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
