import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { spawn, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'

const exec = promisify(execFile)
const pause = () => new Promise((resolve) => setTimeout(resolve, 30))

test('real worker transfers selected references over localhost HTTP, saves probed output and cancels before prompt submission', { timeout: 30000 }, async (t) => {
  try { await exec('ffmpeg', ['-version']); await exec('ffprobe', ['-version']) }
  catch (error) { if (process.env.CI) throw error; t.skip('FFmpeg required'); return }
  const root = await mkdtemp(path.join(os.tmpdir(), 'kinaou-reference-worker-'))
  const managed = path.join(root, 'KINAOU')
  const uploads = []
  const prompts = []
  let holdUpload = false
  let child
  let output = Buffer.alloc(0)
  const server = http.createServer(async (req, res) => {
    try {
      const chunks = []
      for await (const chunk of req) chunks.push(chunk)
      const body = Buffer.concat(chunks)
      res.setHeader('content-type', 'application/json')
      if (req.url === '/system_stats') return res.end(JSON.stringify({ system: { comfyui_version: 'fixture' } }))
      if (req.url === '/upload/image') {
        const form = await new Request('http://localhost/upload', { method: 'POST', headers: { 'content-type': req.headers['content-type'] }, body }).formData()
        const file = form.get('image')
        uploads.push({ name: file.name, bytes: Buffer.from(await file.arrayBuffer()), overwrite: form.get('overwrite'), type: form.get('type') })
        if (holdUpload) return // Cancellation must abort this request without submitting a prompt.
        return res.end(JSON.stringify({ name: file.name, subfolder: '', type: 'input' }))
      }
      if (req.url === '/prompt') { prompts.push(JSON.parse(body)); return res.end(JSON.stringify({ prompt_id: 'fixture-1' })) }
      if (req.url === '/history/fixture-1') return res.end(JSON.stringify({ 'fixture-1': { status: { completed: true }, outputs: { '9': { videos: [{ filename: 'fixture.mp4', type: 'output', subfolder: '' }] } } } }))
      if (req.url.startsWith('/view?')) { res.setHeader('content-type', 'video/mp4'); return res.end(output) }
      res.statusCode = 404; res.end('{}')
    } catch (error) { res.statusCode = 500; res.end(JSON.stringify({ error: String(error) })) }
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const base = 'http://127.0.0.1:43936'
  const request = async (route, body) => {
    const response = await fetch(`${base}${route}`, { method: body ? 'POST' : 'GET', headers: { authorization: 'Bearer reference-test', 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) })
    return { status: response.status, ...await response.json() }
  }
  const finish = async (id) => {
    for (let i = 0; i < 300; i++) {
      const { job } = await request(`/video/jobs/${id}`)
      if (!['queued', 'running'].includes(job.state)) return job
      await pause()
    }
    throw new Error('Job did not finish')
  }
  try {
    await mkdir(path.join(managed, 'Models/ComfyUI/Workflows'), { recursive: true })
    await mkdir(path.join(managed, 'Assets'), { recursive: true })
    await exec('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=red:size=64x64', '-t', '0.2', '-pix_fmt', 'yuv420p', path.join(root, 'fixture.mp4')])
    output = await readFile(path.join(root, 'fixture.mp4'))
    await exec('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=red:size=64x64', '-frames:v', '1', '-threads', '1', path.join(managed, 'Assets/photo.png')])
    await exec('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.2', path.join(managed, 'Assets/voice.wav')])
    const photo = await readFile(path.join(managed, 'Assets/photo.png'))
    const voice = await readFile(path.join(managed, 'Assets/voice.wav'))
    const template = { schemaVersion: 1, mediaType: 'video', id: 'reference-fixture', label: 'Protocol fixture, not an AI model', workflow: {
      '1': { class_type: 'CLIPTextEncode', inputs: { text: '' } }, '2': { class_type: 'LoadImage', inputs: { image: 'old.png' } }, '3': { class_type: 'LoadAudio', inputs: { audio: 'old.wav' } }
    }, bindings: { positivePrompt: { nodeId: '1', input: 'text' } }, referenceInputs: { portrait: { nodeId: '2', input: 'image' }, speech: { nodeId: '3', input: 'audio' } } }
    await writeFile(path.join(managed, 'Models/ComfyUI/Workflows/fixture.json'), JSON.stringify(template))
    child = spawn(process.execPath, [path.resolve('worker/mac-worker.mjs')], { env: { PATH: process.env.PATH, KINAOU_MANAGED_ROOT: managed, KINAOU_WORKER_TOKEN: 'reference-test', KINAOU_WORKER_PORT: '43936', KINAOU_COMFYUI_URL: `http://127.0.0.1:${server.address().port}`, KINAOU_COMFYUI_POLL_MS: '5' }, stdio: ['ignore', 'pipe', 'pipe'] })
    let logs = ''
    child.stdout.on('data', (chunk) => { logs += chunk }); child.stderr.on('data', (chunk) => { logs += chunk })
    for (let i = 0; !logs.includes(`listening on ${base}`); i++) { if (i > 300 || child.exitCode !== null) throw new Error(logs); await pause() }
    const discovered = await request('/video/templates')
    assert.deepEqual(discovered.templates[0].referenceRoles, ['portrait', 'speech'])
    const parameters = { templatePath: 'KINAOU/Models/ComfyUI/Workflows/fixture.json', positivePrompt: 'Reviewed fixture', seed: 42, references: { portrait: { assetId: 'photo-id', path: 'KINAOU/Assets/photo.png', authorized: true }, speech: { assetId: 'voice-id', path: 'KINAOU/Assets/voice.wav', authorized: true } } }
    assert.equal((await request('/video/jobs', { ...parameters, references: {} })).ok, false)
    assert.equal(uploads.length, 0)
    const started = await request('/video/jobs', parameters)
    assert.equal(started.status, 202)
    const done = await finish(started.job.id)
    assert.equal(done.state, 'succeeded', done.error)
    assert.equal(done.width, 64); assert.ok(done.durationMs > 0)
    assert.equal(uploads.length, 2); assert.equal(prompts.length, 1)
    assert.deepEqual(uploads[0].bytes, photo); assert.deepEqual(uploads[1].bytes, voice)
    assert.equal(uploads[1].overwrite, 'false'); assert.equal(uploads[1].type, 'input')
    assert.equal(prompts[0].prompt['2'].inputs.image, uploads[0].name)
    assert.equal(prompts[0].prompt['3'].inputs.audio, uploads[1].name)
    assert.deepEqual(done.provenance.references[1], { role: 'speech', assetId: 'voice-id', sourcePath: 'KINAOU/Assets/voice.wav', authorized: true, sha256: createHash('sha256').update(voice).digest('hex') })
    assert.deepEqual(await readFile(path.join(root, done.videoPath)), output)
    assert.deepEqual(await readFile(path.join(managed, 'Assets/voice.wav')), voice)
    const missing = await request('/video/jobs', { ...parameters, references: { ...parameters.references, portrait: { ...parameters.references.portrait, path: 'KINAOU/Assets/missing.png' } } })
    assert.equal((await finish(missing.job.id)).state, 'failed')
    assert.equal(prompts.length, 1)
    holdUpload = true
    const active = await request('/video/jobs', parameters)
    for (let i = 0; uploads.length < 3 && i < 100; i++) await pause()
    assert.equal(uploads.length, 3)
    assert.equal((await request(`/video/jobs/${active.job.id}/cancel`, {})).job.state, 'cancelled')
    assert.equal((await finish(active.job.id)).state, 'cancelled')
    await pause()
    assert.equal(prompts.length, 1)
  } finally {
    if (child) { child.kill('SIGKILL'); await new Promise((resolve) => child.on('close', resolve)) }
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
    await rm(root, { recursive: true, force: true })
  }
})
