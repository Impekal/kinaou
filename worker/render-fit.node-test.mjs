import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const workerScript = fileURLToPath(new URL('./mac-worker.mjs', import.meta.url))
const clientCompositor = fileURLToPath(new URL('../src/core/localWorker.ts', import.meta.url))
const TOKEN = 'render-fit-test-token'
const PORT = 43916

function extractFitLogic(source) {
  const fit = source.match(/const fitFilter = [\s\S]*?force_original_aspect_ratio=decrease`/)
  assert.ok(fit, 'fit filter derivation not found')
  const visual = source.match(/parts\.push\(`\[\$\{index\}:v\]\$\{framePrefix\(clip\)\}[^\n]*\)/)
  assert.ok(visual, 'visual filter line not found')
  const zoom = source.match(/const zoom = clip\.motion === 'zoom-in'[\s\S]*?,1\)`/)
  assert.ok(zoom, 'motion zoom expression not found')
  const zoompan = source.match(/return `\$\{fitted\},zoompan=[^\n]*`/)
  assert.ok(zoompan, 'zoompan filter not found')
  const letterbox = source.match(/const factor = Math\.min\(width \/ sourceWidth[\s\S]*?\* factor\)\) \}/)
  assert.ok(letterbox, 'letterboxed size maths not found')
  return { fit: fit[0], visual: visual[0], zoom: zoom[0], zoompan: zoompan[0], letterbox: letterbox[0] }
}

function extractDuckingLogic(source) {
  const match = source.match(/function musicDuckingFilters\(clip, clips, settings\) \{[\s\S]*?\n\}/)
  assert.ok(match, 'music ducking function not found')
  return match[0]
}

test('both compositor implementations derive the fit and motion filters identically', async () => {
  const worker = extractFitLogic(await readFile(workerScript, 'utf8'))
  const client = extractFitLogic(await readFile(clientCompositor, 'utf8'))
  for (const key of ['fit', 'visual', 'zoom', 'zoompan', 'letterbox']) {
    assert.equal(worker[key], client[key], `${key} drifted between the two compositor implementations`)
  }
  assert.match(worker.fit, /force_original_aspect_ratio=increase,crop=\$\{width\}:\$\{height\}/)
  assert.match(worker.zoompan, /s=\$\{target\.w\}x\$\{target\.h\}/)
})

test('both compositor implementations derive music ducking identically', async () => {
  const worker = extractDuckingLogic(await readFile(workerScript, 'utf8'))
  const client = extractDuckingLogic(await readFile(clientCompositor, 'utf8'))
  assert.equal(worker, client, 'music ducking drifted between the two compositor implementations')
  assert.match(worker, /Math\.pow\(10, -settings\.reductionDb \/ 20\)/)
  assert.match(worker, /settings\.attackMs/)
  assert.match(worker, /settings\.releaseMs/)
})

test('both compositor implementations apply the same optional master loudness filter', async () => {
  const expression = /if \(plan\.loudnessNormalization\?\.enabled\) \{[\s\S]*?audioOutput = 'master'\n    \}/
  const worker = (await readFile(workerScript, 'utf8')).match(expression)
  const client = (await readFile(clientCompositor, 'utf8')).match(expression)
  assert.ok(worker && client, 'master loudness expression not found')
  assert.equal(worker[0], client[0], 'master loudness filter drifted between compositor implementations')
  assert.match(worker[0], /loudnorm=I=/)
})

test('the worker rejects a render plan with an unknown fit mode', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'kinaou-fit-test-'))
  const managedRoot = path.join(root, 'KINAOU')
  await mkdir(managedRoot, { recursive: true })

  const child = spawn(process.execPath, [workerScript], {
    env: { PATH: process.env.PATH, KINAOU_MANAGED_ROOT: managedRoot, KINAOU_WORKER_TOKEN: TOKEN, KINAOU_WORKER_PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  let output = ''
  child.stdout.on('data', (data) => { output += data.toString() })
  child.stderr.on('data', (data) => { output += data.toString() })
  try {
    const deadline = Date.now() + 15_000
    while (!output.includes(`listening on http://127.0.0.1:${PORT}`)) {
      if (child.exitCode !== null) throw new Error(`Worker exited before listening: ${output}`)
      if (Date.now() > deadline) throw new Error(`Worker did not start in time: ${output}`)
      await new Promise((resolve) => setTimeout(resolve, 100))
    }

    const basePreset = { name: 'Vertical', container: 'mp4', width: 1080, height: 1920, fps: 30, videoCodec: 'h264', audioCodec: 'aac' }
    const plan = (preset) => ({
      purpose: 'export',
      projectId: 'p1',
      outputRelativePath: 'KINAOU/Renders/out.mp4',
      preset,
      durationMs: 1000,
      requiredCapabilities: ['filesystem', 'ffmpeg'],
      clips: [{
        trackId: 't1', trackType: 'video', trackIndex: 0, clipId: 'c1',
        asset: { id: 'a1', kind: 'video', uri: 'KINAOU/Assets/demo.mp4', managed: true, offline: false, metadata: {} },
        startMs: 0, durationMs: 1000, sourceOffsetMs: 0, gain: 1, speed: 1,
        transform: { x: 0, y: 0, scale: 1, cropLeft: 0, cropTop: 0, cropRight: 0, cropBottom: 0 },
        fades: { inMs: 0, outMs: 0 }
      }]
    })

    const send = async (preset) => {
      const response = await fetch(`http://127.0.0.1:${PORT}/render`, {
        method: 'POST',
        headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
        body: JSON.stringify({ plan: plan(preset) })
      })
      return { status: response.status, payload: await response.json() }
    }

    const bad = await send({ ...basePreset, fit: 'stretch' })
    assert.equal(bad.status, 400)
    assert.match(bad.payload.error.message, /fit mode/)

    // cover and an absent fit are both legitimate and get past validation
    for (const preset of [{ ...basePreset, fit: 'cover' }, basePreset]) {
      const accepted = await send(preset)
      assert.equal(accepted.status, 202, `expected the plan to be accepted, got ${JSON.stringify(accepted.payload)}`)
    }
  } finally {
    child.kill('SIGKILL')
    await new Promise((resolve) => { child.on('close', resolve); setTimeout(resolve, 3000).unref() })
    await rm(root, { recursive: true, force: true })
  }
})
