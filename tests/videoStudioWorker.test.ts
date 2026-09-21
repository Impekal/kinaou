import { it, expect } from 'vitest'
import http from 'node:http'
import { createHash } from 'node:crypto'
import { execFileSync, spawn } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { AddressInfo } from 'node:net'
import { WorkerClient } from '../src/core/workerClient'
import { VideoStudioSession, type VideoFeedback } from '../src/core/videoStudioSession'
import { reviewVideoDraft } from '../src/core/videoStudioDraft'
import { createProject, parseProject } from '../src/core/project'
import { ProjectRepository } from '../src/core/persistence'
import { PersistentVersionHistory } from '../src/core/versioning'
import { commitSceneAssignment } from '../src/core/sceneAssignmentCommit'
import { createRenderPlan, projectFormatPreset } from '../src/core/render'
const pause = () => new Promise<void>(resolve => setTimeout(resolve, 30))

it('executes referenced video save-only recovery through the real worker and renders it without altering sources', async () => {
  // Explicit protocol fixture, not a ComfyUI model, natural voice or lip-sync demonstration.
  const root = await mkdtemp(path.join(os.tmpdir(), 'kinaou-video-contract-')), managed = path.join(root, 'KINAOU')
  let output: Buffer = Buffer.alloc(0), prompts = 0, received: any
  const uploads: { name: string; bytes: Buffer }[] = []
  const server = http.createServer(async (req, res) => {
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk)); const bytes = Buffer.concat(chunks), body = bytes.toString()
    res.setHeader('content-type', 'application/json')
    if (req.url === '/system_stats') return res.end(JSON.stringify({ system: { comfyui_version: 'EXPLICIT-FIXTURE' } }))
    if (req.url === '/upload/image') {
      const form = await new Request('http://localhost/upload', { method: 'POST', headers: { 'content-type': req.headers['content-type']! }, body: new Uint8Array(bytes) }).formData()
      const file = form.get('image') as File
      uploads.push({ name: file.name, bytes: Buffer.from(await file.arrayBuffer()) })
      return res.end(JSON.stringify({ name: file.name, type: 'input', subfolder: '' }))
    }
    if (req.url === '/prompt') { prompts++; received = JSON.parse(body); return res.end(JSON.stringify({ prompt_id: 'test' })) }
    if (req.url === '/history/test') return res.end(JSON.stringify({ test: { status: { completed: true }, outputs: { '1': { videos: [{ filename: 'fixture.mp4', type: 'output', subfolder: '' }] } } } }))
    if (req.url?.startsWith('/view?')) { res.setHeader('content-type', 'video/mp4'); return res.end(output) }
    res.statusCode = 404; res.end('{}')
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  let child: ReturnType<typeof spawn> | undefined, closed: Promise<void> | undefined
  try {
    await mkdir(path.join(managed, 'Models/ComfyUI/Workflows'), { recursive: true })
    execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=red:size=64x64', '-t', '1', '-pix_fmt', 'yuv420p', path.join(root, 'fixture.mp4')])
    output = await readFile(path.join(root, 'fixture.mp4'))
    await mkdir(path.join(managed, 'Assets'), { recursive: true })
    execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', path.join(managed, 'Assets/own.wav')])
    const voice = await readFile(path.join(managed, 'Assets/own.wav'))
    const template = { schemaVersion: 1, mediaType: 'video', id: 'fixture', label: 'Explicit protocol fixture', referenceInputs: { speech: { nodeId: '2', input: 'audio' } }, workflow: { '2': { class_type: 'LoadAudio', inputs: { audio: '' } }, '1': { class_type: 'TestOnly', inputs: { text: '', negative: '', seed: 0, width: 64, height: 64 } } }, bindings: Object.fromEntries([['positivePrompt', 'text'], ['negativePrompt', 'negative'], ['seed', 'seed'], ['width', 'width'], ['height', 'height']].map(([key, input]) => [key, { nodeId: '1', input }])) }
    await writeFile(path.join(managed, 'Models/ComfyUI/Workflows/fixture.json'), JSON.stringify(template))
    child = spawn(process.execPath, ['worker/mac-worker.mjs'], { env: { PATH: process.env.PATH, KINAOU_MANAGED_ROOT: managed, KINAOU_WORKER_PORT: '43956', KINAOU_WORKER_TOKEN: 'video-contract', KINAOU_COMFYUI_URL: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, KINAOU_COMFYUI_POLL_MS: '5' }, stdio: ['ignore', 'pipe', 'pipe'] })
    closed = new Promise(resolve => child!.once('close', () => resolve()))
    let logs = ''; child.stdout!.on('data', chunk => { logs += chunk }); child.stderr!.on('data', chunk => { logs += chunk })
    const deadline = Date.now() + 15000
    while (!logs.includes('listening on http://127.0.0.1:43956')) { if (child.exitCode !== null || Date.now() > deadline) throw Error(logs); await pause() }
    const client = new WorkerClient({ baseUrl: 'http://127.0.0.1:43956', token: 'video-contract' })
    const availability = await client.videoGenerationAvailability()
    const data = new Map<string, string>(), store = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value) }, removeItem: (key: string) => { data.delete(key) } }
    const repository = new ProjectRepository(store), history = new PersistentVersionHistory(store)
    let project = repository.save(parseProject({ ...createProject('Image contract'), assets: [{ id: 'voice', kind: 'audio', uri: 'KINAOU/Assets/own.wav', managed: true, metadata: { name: 'Original own recording fixture' } }], storyboard: [{ id: 'scene', title: 'Original scene', description: 'Visual', narration: 'Original speech', durationMs: 1000 }] })), failSave = true
    const parameters = reviewVideoDraft(availability.templates[0], { positivePrompt: 'Original red illustration', negativePrompt: 'blur', seed: '42', width: '64', height: '64' }, project, { speech: 'voice' }, { speech: true }).parameters!
    const states: VideoFeedback[] = []
    const session = new VideoStudioSession(project, 'test', parameters, template.id, {
      client, environment: () => ({ project, connection: 'test' }), snapshot: value => { history.snapshot(value, 'Before image', 'system') },
      persist: value => { if (failSave) throw Error('Explicit test storage failure'); project = repository.save(value) }, publish: value => states.push(value), wait: pause
    })
    await session.run(); expect(states.at(-1)?.phase, JSON.stringify(states)).toBe('saveFailed'); expect(project.assets).toHaveLength(1)
    const imagePath = path.join(root, states.at(-1)!.job!.videoPath!)
    expect(await readFile(imagePath)).toEqual(output)
    failSave = false; await session.run(); await session.run()
    expect(prompts).toBe(1); expect(states.at(-1)?.phase).toBe('succeeded')
    expect(received.prompt['1'].inputs).toEqual({ text: 'Original red illustration', negative: 'blur', seed: 42, width: 64, height: 64 })
    expect(uploads).toHaveLength(1); expect(uploads[0].bytes).toEqual(voice)
    expect(received.prompt['2'].inputs.audio).toBe(uploads[0].name)
    expect(project.assets[1].metadata.references).toEqual([{ role: 'speech', assetId: 'voice', sourcePath: 'KINAOU/Assets/own.wav', authorized: true, sha256: createHash('sha256').update(voice).digest('hex') }])
    expect(await readFile(path.join(managed, 'Assets/own.wav'))).toEqual(voice)
    const loaded = repository.load(project.id)!
    expect(loaded.assets[1].metadata).toMatchObject({ generated: true, positivePrompt: parameters.positivePrompt, negativePrompt: 'blur', seed: 42 })
    commitSceneAssignment(project, 'scene', project.assets[1].id, history, value => { project = repository.save(value) })
    project = parseProject({ ...project, tracks: [{ id: 'visual', name: 'Original', type: 'video', clips: [{ id: 'clip', assetId: project.assets[1].id, sceneId: 'scene', startMs: 0, durationMs: 1000 }] }] })
    const plan = createRenderPlan(project, { ...projectFormatPreset(project, 'landscape', 'export'), width: 64, height: 64, fps: 10 }, 'KINAOU/Renders/fixture.mp4')
    let render = await client.startRender(plan)
    for (let i = 0; ['queued', 'running'].includes(render.state) && i < 300; i++) { await pause(); render = await client.renderStatus(render.id) }
    expect(render.state, render.error).toBe('succeeded')
    const pixels = execFileSync('ffmpeg', ['-v', 'error', '-i', path.join(managed, 'Renders/fixture.mp4'), '-frames:v', '1', '-vf', 'scale=1:1', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'])
    expect(pixels[0]).toBeGreaterThan(240); expect(pixels[1]).toBeLessThan(10); expect(pixels[2]).toBeLessThan(10)
    commitSceneAssignment(project, 'scene', undefined, history, value => { project = repository.save(value) })
    expect(project.storyboard[0].narration).toBe('Original speech')
    expect(history.restoreReversibly(project, history.list(project.id)[0].id).project.assets).toHaveLength(1)
    expect(await readFile(imagePath)).toEqual(output)
  } finally {
    if (child) { child.kill('SIGTERM'); await closed }
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()))
    await rm(root, { recursive: true, force: true })
  }
}, 30000)
