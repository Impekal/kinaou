import { describe, expect, it } from 'vitest'
import { createProject } from '../src/core/project'
import { importProbedMedia } from '../src/core/mediaImport'
import { WorkerClient } from '../src/core/workerClient'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

describe('worker client', () => {
  it('accepts localhost only and requires a token', () => {
    expect(() => new WorkerClient({ baseUrl: 'https://example.com', token: 'x' })).toThrow(/localhost/)
    expect(() => new WorkerClient({ baseUrl: 'http://127.0.0.1:43117', token: '' })).toThrow(/token/)
  })

  it('never calls the global fetch bound to the client instance (browser Window.fetch rule)', async () => {
    const original = globalThis.fetch
    const seen: unknown[] = []
    globalThis.fetch = function (this: unknown) {
      seen.push(this)
      return Promise.resolve(jsonResponse({ ok: false, error: { code: 'UNKNOWN', message: 'stub' } }, 500))
    } as typeof fetch
    try {
      const client = new WorkerClient({ baseUrl: 'http://127.0.0.1:43117', token: 'secret' })
      await client.health().catch(() => {})
      expect(seen).toHaveLength(1)
      expect(seen[0] === undefined || seen[0] === globalThis).toBe(true)
    } finally {
      globalThis.fetch = original
    }
  })

  it('parses availability responses and drops malformed entries', async () => {
    const fetchImpl: typeof fetch = async (input, init) => {
      expect(String(input)).toContain('/assets/availability')
      expect(JSON.parse(String(init?.body))).toEqual({ paths: ['KINAOU/Assets/a.mp4', 'KINAOU/Assets/b.png'] })
      return jsonResponse({ ok: true, type: 'asset-availability', results: [
        { path: 'KINAOU/Assets/a.mp4', available: true },
        { path: 'KINAOU/Assets/b.png', available: false },
        { path: 42, available: 'yes' }
      ] })
    }
    const client = new WorkerClient({ baseUrl: 'http://127.0.0.1:43117', token: 'secret', fetchImpl })
    expect(await client.assetAvailability(['KINAOU/Assets/a.mp4', 'KINAOU/Assets/b.png'])).toEqual([
      { path: 'KINAOU/Assets/a.mp4', available: true },
      { path: 'KINAOU/Assets/b.png', available: false }
    ])
    expect(await client.assetAvailability([])).toEqual([])

    const invalid = new WorkerClient({ baseUrl: 'http://127.0.0.1:43117', token: 'secret', fetchImpl: async () => jsonResponse({ ok: true, type: 'asset-availability', results: 'nope' }) })
    await expect(invalid.assetAvailability(['KINAOU/Assets/a.mp4'])).rejects.toThrow(/availability/)
  })

  it('sends bearer auth and parses health/probe responses', async () => {
    const seen: Array<{ url: string; auth: string | null }> = []
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input)
      const headers = new Headers(init?.headers)
      seen.push({ url, auth: headers.get('authorization') })
      if (url.endsWith('/health')) {
        return jsonResponse({ ok: true, type: 'health', handshake: { workerId: 'mac-1', name: 'Mac Worker', platform: 'darwin', version: '0.4.0', capabilities: ['filesystem', 'ffmpeg', 'media-probe', 'asset-upload'], managedRoots: ['/Volumes/Media/KINAOU'] } })
      }
      return jsonResponse({ ok: true, type: 'probe-media', result: { path: '/Volumes/Media/KINAOU/Assets/demo.mp4', durationMs: 4200, sizeBytes: 1234, width: 1920, height: 1080, videoCodec: 'h264' } })
    }

    const client = new WorkerClient({ baseUrl: 'http://127.0.0.1:43117', token: 'secret', fetchImpl })
    const health = await client.health()
    const probe = await client.probe('KINAOU/Assets/demo.mp4')

    expect(health.workerId).toBe('mac-1')
    expect(probe.durationMs).toBe(4200)
    expect(seen.every((item) => item.auth === 'Bearer secret')).toBe(true)
  })

  it('streams an explicitly selected browser blob with auth and encoded filename', async () => {
    let seenHeaders = new Headers()
    let seenBody: BodyInit | null | undefined
    const fetchImpl: typeof fetch = async (_input, init) => {
      seenHeaders = new Headers(init?.headers)
      seenBody = init?.body
      return jsonResponse({ ok: true, type: 'asset-upload', result: { managedPath: 'KINAOU/Assets/id_My Clip.mp4', name: 'My Clip.mp4', sizeBytes: 3 } }, 201)
    }
    const client = new WorkerClient({ baseUrl: 'http://localhost:43117', token: 'secret', fetchImpl })
    const blob = new Blob(['abc'], { type: 'video/mp4' })
    const result = await client.importAsset(blob, 'My Clip.mp4')

    expect(result.managedPath).toBe('KINAOU/Assets/id_My Clip.mp4')
    expect(seenHeaders.get('authorization')).toBe('Bearer secret')
    expect(seenHeaders.get('x-kinaou-filename')).toBe('My%20Clip.mp4')
    expect(seenHeaders.get('content-type')).toBe('video/mp4')
    expect(seenBody).toBe(blob)
  })

  it('rejects malformed upload responses and surfaces worker errors', async () => {
    const malformed = new WorkerClient({ baseUrl: 'http://localhost:43117', token: 'secret', fetchImpl: async () => jsonResponse({ ok: true, type: 'asset-upload', result: { managedPath: '../bad', name: 'bad', sizeBytes: 1 } }, 201) })
    await expect(malformed.importAsset(new Blob(['x']), 'x.bin')).rejects.toThrow(/path/)

    const failing = new WorkerClient({ baseUrl: 'http://localhost:43117', token: 'secret', fetchImpl: async () => jsonResponse({ ok: false, error: { code: 'UPLOAD_TOO_LARGE', message: 'too large' } }, 413) })
    await expect(failing.importAsset(new Blob(['x']), 'x.bin')).rejects.toThrow('too large')
  })

  it('surfaces worker errors instead of pretending success', async () => {
    const client = new WorkerClient({
      baseUrl: 'http://localhost:43117',
      token: 'secret',
      fetchImpl: async () => jsonResponse({ ok: false, error: { code: 'CAPABILITY_UNAVAILABLE', message: 'ffprobe is not available' } }, 400)
    })
    await expect(client.probe('KINAOU/Assets/demo.mp4')).rejects.toThrow('ffprobe is not available')
  })

  it('starts, polls and cancels managed image jobs through the authenticated worker', async () => {
    const provenance = { kind: 'local-model', adapterId: 'comfyui', templateId: 'ui-sdxl', seed: 7, width: null, height: null, positivePrompt: 'app screen', negativePrompt: '' }
    const base = { id: 'img-1', state: 'queued', progress: 0, createdAt: 'x', updatedAt: 'x', templatePath: 'KINAOU/Models/ComfyUI/Workflows/ui.json', provenance }
    const client = new WorkerClient({ baseUrl: 'http://127.0.0.1:43117', token: 'secret', fetchImpl: async (input, init) => {
      const url = String(input)
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer secret')
      if (url.endsWith('/image/templates')) return jsonResponse({ ok: true, type: 'image-templates', comfyui: { available: true, version: '0.3.40' }, templates: [{ path: base.templatePath, id: 'ui-sdxl', label: 'UI SDXL', mediaType: 'image', supportsNegativePrompt: true, supportsWidth: false, supportsHeight: false }] })
      if (url.endsWith('/image/jobs')) {
        expect(JSON.parse(String(init?.body))).toEqual({ templatePath: base.templatePath, positivePrompt: 'app screen', seed: 7 })
        return jsonResponse({ ok: true, type: 'image-job', job: base }, 202)
      }
      if (url.endsWith('/cancel')) return jsonResponse({ ok: true, type: 'image-job', job: { ...base, state: 'cancelled' } })
      return jsonResponse({ ok: true, type: 'image-job', job: { ...base, state: 'succeeded', progress: 1, imagePath: 'KINAOU/Assets/GeneratedImages/img-1.png', sizeBytes: 2048 } })
    } })
    const availability = await client.imageGenerationAvailability()
    expect(availability.comfyui.version).toBe('0.3.40')
    expect(availability.templates).toHaveLength(1)
    expect((await client.startImageJob({ templatePath: base.templatePath, positivePrompt: 'app screen', seed: 7 })).state).toBe('queued')
    expect((await client.imageJobStatus('img-1')).imagePath).toBe('KINAOU/Assets/GeneratedImages/img-1.png')
    expect((await client.cancelImageJob('img-1')).state).toBe('cancelled')
  })

  it('starts, polls and cancels managed video generation jobs', async () => {
    const provenance = { kind: 'local-model', adapterId: 'comfyui', templateId: 'scene-video', mediaType: 'video', seed: 3, width: null, height: null, positivePrompt: 'harbour at dawn', negativePrompt: '' }
    const base = { id: 'vid-1', state: 'queued', progress: 0, createdAt: 'x', updatedAt: 'x', templatePath: 'KINAOU/Models/ComfyUI/Workflows/video.json', provenance }
    const client = new WorkerClient({ baseUrl: 'http://127.0.0.1:43117', token: 'secret', fetchImpl: async (input, init) => {
      const url = String(input)
      if (url.endsWith('/video/templates')) return jsonResponse({ ok: true, type: 'video-templates', comfyui: { available: true }, templates: [{ path: base.templatePath, id: 'scene-video', label: 'Scene video', mediaType: 'video', supportsNegativePrompt: false, supportsWidth: false, supportsHeight: false }] })
      if (url.endsWith('/video/jobs')) {
        expect(JSON.parse(String(init?.body))).toEqual({ templatePath: base.templatePath, positivePrompt: 'harbour at dawn', seed: 3 })
        return jsonResponse({ ok: true, type: 'video-job', job: base }, 202)
      }
      if (url.endsWith('/cancel')) return jsonResponse({ ok: true, type: 'video-job', job: { ...base, state: 'cancelled' } })
      return jsonResponse({ ok: true, type: 'video-job', job: { ...base, state: 'succeeded', progress: 1, videoPath: 'KINAOU/Assets/GeneratedVideo/vid-1.mp4', sizeBytes: 9000, durationMs: 4000 } })
    } })
    expect((await client.videoGenerationAvailability()).templates[0].mediaType).toBe('video')
    expect((await client.startVideoJob({ templatePath: base.templatePath, positivePrompt: 'harbour at dawn', seed: 3 })).state).toBe('queued')
    expect((await client.videoJobStatus('vid-1')).durationMs).toBe(4000)
    expect((await client.cancelVideoJob('vid-1')).state).toBe('cancelled')
  })

  it('rejects image templates on the video availability endpoint', async () => {
    const client = new WorkerClient({ baseUrl: 'http://127.0.0.1:43117', token: 'secret', fetchImpl: async () => jsonResponse({ ok: true, type: 'video-templates', comfyui: { available: true }, templates: [{ path: 'KINAOU/Models/ComfyUI/Workflows/ui.json', id: 'ui', label: 'UI', mediaType: 'image', supportsNegativePrompt: false, supportsWidth: false, supportsHeight: false }] }) })
    await expect(client.videoGenerationAvailability()).rejects.toThrow(/media type/)
  })

  it('rejects image job results that leave managed generated storage', async () => {
    const provenance = { kind: 'local-model', adapterId: 'comfyui', templateId: 'ui-sdxl', seed: 7, width: null, height: null, positivePrompt: 'app screen', negativePrompt: '' }
    const client = new WorkerClient({ baseUrl: 'http://127.0.0.1:43117', token: 'secret', fetchImpl: async () => jsonResponse({ ok: true, type: 'image-job', job: { id: 'img-1', state: 'succeeded', progress: 1, createdAt: 'x', updatedAt: 'x', templatePath: 'KINAOU/Models/ComfyUI/Workflows/ui.json', provenance, imagePath: 'KINAOU/Renders/escape.png', sizeBytes: 1 } }) })
    await expect(client.imageJobStatus('img-1')).rejects.toThrow(/completed/)
  })

  it('starts, polls, stops and cancels real screen capture jobs', async () => {
    const provenance = { kind: 'real-capture', adapterId: 'macos-screencapture', displayId: 1, delaySeconds: 0, region: null, interactive: false, appName: null, requestedDurationMs: 30000 }
    const base = { id: 'cap-1', kind: 'recording', state: 'running', progress: 0.2, createdAt: 'x', updatedAt: 'x', provenance }
    const seen: string[] = []
    const client = new WorkerClient({ baseUrl: 'http://127.0.0.1:43117', token: 'secret', fetchImpl: async (input, init) => {
      const url = String(input)
      seen.push(url)
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer secret')
      if (url.endsWith('/capture/jobs')) {
        expect(JSON.parse(String(init?.body))).toEqual({ kind: 'recording', durationMs: 30000 })
        return jsonResponse({ ok: true, type: 'capture-job', job: base }, 202)
      }
      if (url.endsWith('/stop')) return jsonResponse({ ok: true, type: 'capture-job', job: { ...base, state: 'succeeded', progress: 1, capturePath: 'KINAOU/Assets/Captures/cap-1.mov', sizeBytes: 9000, durationMs: 8000 } })
      if (url.endsWith('/cancel')) return jsonResponse({ ok: true, type: 'capture-job', job: { ...base, state: 'cancelled' } })
      return jsonResponse({ ok: true, type: 'capture-job', job: base })
    } })
    expect((await client.startCapture({ kind: 'recording', durationMs: 30000 })).state).toBe('running')
    expect((await client.captureStatus('cap-1')).progress).toBe(0.2)
    expect((await client.stopCapture('cap-1')).durationMs).toBe(8000)
    expect((await client.cancelCapture('cap-1')).state).toBe('cancelled')
    expect(seen).toHaveLength(4)
  })

  it('lists local models and returns Director output through the authenticated worker', async () => {
    let calls = 0
    const client = new WorkerClient({ baseUrl: 'http://localhost:43117', token: 'secret', fetchImpl: async (input, init) => {
      calls += 1
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer secret')
      if (String(input).endsWith('/models/local')) return jsonResponse({ ok: true, type: 'local-models', models: [{ id: 'qwen:7b', sizeBytes: 42 }] })
      expect(JSON.parse(String(init?.body))).toEqual({ model: 'qwen:7b', brief: 'Harbour film' })
      return jsonResponse({ ok: true, type: 'director-plan', plan: { schemaVersion: 1 } })
    } })
    expect(await client.listLocalModels()).toEqual([{ id: 'qwen:7b', sizeBytes: 42 }])
    expect(await client.generateDirectorPlan('qwen:7b', 'Harbour film')).toEqual({ schemaVersion: 1 })
    expect(calls).toBe(2)
  })
})

describe('probed media import', () => {
  it('registers a managed asset with real probe metadata', () => {
    const project = createProject('Import')
    const next = importProbedMedia(project, {
      kind: 'video',
      managedPath: 'KINAOU/Assets/demo.mp4',
      name: 'demo.mp4',
      probe: { path: '/Volumes/Media/KINAOU/Assets/demo.mp4', durationMs: 4200, sizeBytes: 1234, videoCodec: 'h264' }
    })

    expect(next.assets).toHaveLength(1)
    expect(next.assets[0].uri).toBe('KINAOU/Assets/demo.mp4')
    expect(next.assets[0].managed).toBe(true)
    expect(next.assets[0].metadata.durationMs).toBe(4200)
    expect(next.assets[0].metadata.sizeBytes).toBe(1234)
  })

  it('requests and validates a managed video proxy', async () => {
    const client = new WorkerClient({ baseUrl: 'http://127.0.0.1:43117', token: 'secret', fetchImpl: async (input) => {
      expect(String(input)).toContain('/assets/proxy')
      return jsonResponse({ ok: true, type: 'media-proxy', result: { path: 'KINAOU/Cache/Proxies/demo_960p.mp4', probe: { path: '/Volumes/Media/KINAOU/Cache/Proxies/demo_960p.mp4', width: 960, height: 540 } } }, 201)
    } })
    const result = await client.generateVideoProxy('KINAOU/Assets/demo.mov')
    expect(result.path).toBe('KINAOU/Cache/Proxies/demo_960p.mp4')
    expect(result.probe.width).toBe(960)
  })

  it('loads proxy bytes through authenticated worker fetch without exposing token in the URL', async () => {
    let seenUrl = ''
    let seenAuthorization = ''
    const client = new WorkerClient({ baseUrl: 'http://127.0.0.1:43117', token: 'top-secret', fetchImpl: async (input, init) => {
      seenUrl = String(input)
      seenAuthorization = new Headers(init?.headers).get('authorization') ?? ''
      return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'video/mp4' } })
    } })
    const blob = await client.loadVideoProxy('KINAOU/Cache/Proxies/demo_960p.mp4')
    expect(blob.size).toBe(3)
    expect(seenUrl).not.toContain('top-secret')
    expect(seenAuthorization).toBe('Bearer top-secret')
    await expect(client.loadVideoProxy('KINAOU/Assets/original.mov')).rejects.toThrow(/proxy path/)
  })

  it('generates and loads authenticated thumbnails', async () => {
    let calls = 0
    const client = new WorkerClient({ baseUrl: 'http://127.0.0.1:43117', token: 'secret', fetchImpl: async () => {
      calls += 1
      if (calls === 1) return jsonResponse({ ok: true, type: 'media-thumbnail', result: { path: 'KINAOU/Cache/Thumbnails/demo.jpg', sizeBytes: 42 } }, 201)
      return new Response(new Uint8Array([255, 216, 255]), { status: 200, headers: { 'content-type': 'image/jpeg' } })
    } })
    const generated = await client.generateVideoThumbnail('KINAOU/Assets/demo.mov')
    expect(generated.sizeBytes).toBe(42)
    expect((await client.loadVideoThumbnail(generated.path)).type).toBe('image/jpeg')
  })

  it('generates and loads authenticated waveform images', async () => {
    let calls = 0
    const client = new WorkerClient({ baseUrl: 'http://127.0.0.1:43117', token: 'secret', fetchImpl: async () => {
      calls += 1
      if (calls === 1) return jsonResponse({ ok: true, type: 'media-waveform', result: { path: 'KINAOU/Cache/Waveforms/demo.png', sizeBytes: 64 } }, 201)
      return new Response(new Uint8Array([137, 80, 78, 71]), { status: 200, headers: { 'content-type': 'image/png' } })
    } })
    const generated = await client.generateWaveform('KINAOU/Assets/voice.wav')
    expect(generated.path).toBe('KINAOU/Cache/Waveforms/demo.png')
    expect((await client.loadWaveform(generated.path)).type).toBe('image/png')
  })

  it('loads only managed composed timeline previews', async () => {
    const client = new WorkerClient({ baseUrl: 'http://127.0.0.1:43117', token: 'secret', fetchImpl: async () => new Response(new Uint8Array([1]), { status: 200, headers: { 'content-type': 'video/mp4' } }) })
    expect((await client.loadTimelinePreview('KINAOU/Cache/Previews/project.mp4')).type).toBe('video/mp4')
    await expect(client.loadTimelinePreview('KINAOU/Renders/export.mp4')).rejects.toThrow(/preview path/)
  })

  it('rejects imports outside KINAOU/Assets', () => {
    const project = createProject('Import')
    expect(() => importProbedMedia(project, {
      kind: 'video',
      managedPath: 'KINAOU/Renders/demo.mp4',
      name: 'demo.mp4',
      probe: { path: '/tmp/demo.mp4' }
    })).toThrow(/KINAOU\/Assets/)
  })
})
