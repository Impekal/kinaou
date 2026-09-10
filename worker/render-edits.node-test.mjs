import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const workerScript = fileURLToPath(new URL('./mac-worker.mjs', import.meta.url))
const TOKEN = 'render-edits-test-token'
const PORT = 43918

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false })
    const stdout = []
    let stderr = ''
    child.stdout?.on('data', (chunk) => stdout.push(chunk))
    child.stderr?.on('data', (chunk) => { stderr += chunk.toString() })
    child.on('error', reject)
    child.on('close', (code) => code === 0 ? resolve({ stdout: Buffer.concat(stdout), stderr }) : reject(new Error(`${command} exited with ${code}: ${stderr.slice(0, 400)}`)))
  })
}

async function hasFfmpeg() {
  try { await run('ffmpeg', ['-version']); await run('ffprobe', ['-version']); return true } catch { return false }
}

/** Average luma (0-255) of a region at a point in time. */
async function luma(file, crop, atSeconds) {
  const { stdout } = await run('ffmpeg', ['-v', 'error', '-ss', String(atSeconds), '-i', file, '-vf', `crop=${crop},scale=1:1`, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'])
  return stdout[0] ?? 0
}

async function meanVolumeDb(file) {
  const { stderr } = await run('ffmpeg', ['-v', 'info', '-i', file, '-af', 'volumedetect', '-f', 'null', '-'])
  const match = stderr.match(/mean_volume:\s*(-?\d+(?:\.\d+)?) dB/)
  assert.ok(match, `no mean_volume in ffmpeg output: ${stderr.slice(-300)}`)
  return Number(match[1])
}

const preset = { name: 'Edits', container: 'mp4', width: 640, height: 360, fps: 30, videoCodec: 'h264', audioCodec: 'aac' }
const noTransform = { x: 0, y: 0, scale: 1, cropLeft: 0, cropTop: 0, cropRight: 0, cropBottom: 0 }

function clip(overrides = {}) {
  return {
    trackId: 't1', trackType: 'video', trackIndex: 0, clipId: 'c1',
    asset: { id: 'a1', kind: 'video', uri: 'KINAOU/Assets/half.mp4', managed: true, offline: false, metadata: { durationMs: 4000 } },
    startMs: 0, durationMs: 2000, sourceOffsetMs: 0, gain: 1, speed: 1,
    transform: noTransform, fades: { inMs: 0, outMs: 0 },
    ...overrides
  }
}

test('the real compositor applies the edit semantics it promises', { timeout: 420_000 }, async (t) => {
  if (!(await hasFfmpeg())) {
    t.skip('ffmpeg/ffprobe not installed — skipping the executing edit-semantics test')
    return
  }

  const root = await mkdtemp(path.join(os.tmpdir(), 'kinaou-render-edits-'))
  const managedRoot = path.join(root, 'KINAOU')
  await mkdir(path.join(managedRoot, 'Assets'), { recursive: true })
  await mkdir(path.join(managedRoot, 'Renders'), { recursive: true })

  // 4s source: black for the first half, white for the second. Which half a render
  // shows at a given moment proves how the source was walked through time.
  await run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=black:size=640x360:rate=30:duration=2',
    '-f', 'lavfi', '-i', 'color=c=white:size=640x360:rate=30:duration=2',
    '-filter_complex', '[0:v][1:v]concat=n=2:v=1:a=0[v]', '-map', '[v]', '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
    path.join(managedRoot, 'Assets', 'half.mp4')])
  // A white source with a steady tone, for fade, transform and audio checks.
  await run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=white:size=640x360:rate=30:duration=4',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac',
    path.join(managedRoot, 'Assets', 'tone.mp4')])

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

    const render = async (name, clips, durationMs = 2000) => {
      const outputRelativePath = `KINAOU/Renders/${name}.mp4`
      const response = await fetch(`http://127.0.0.1:${PORT}/render`, {
        method: 'POST',
        headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
        body: JSON.stringify({ plan: { purpose: 'export', projectId: 'p1', outputRelativePath, preset, durationMs, requiredCapabilities: ['filesystem', 'ffmpeg'], clips } })
      })
      const started = await response.json()
      assert.equal(started.ok, true, `render did not start: ${JSON.stringify(started)}`)
      for (let attempt = 0; attempt < 120; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000))
        const status = await fetch(`http://127.0.0.1:${PORT}/render/jobs/${started.job.id}`, { headers: { authorization: `Bearer ${TOKEN}` } })
        const { job } = await status.json()
        if (job.state === 'succeeded') return path.join(managedRoot, outputRelativePath.slice('KINAOU/'.length))
        if (job.state !== 'queued' && job.state !== 'running') throw new Error(`render ${job.state}: ${job.error ?? ''}`)
      }
      throw new Error('render did not finish in time')
    }

    const whole = '640:360:0:0'

    await t.test('speed retiming really walks the source faster', async () => {
      const normal = await render('speed-1', [clip({ speed: 1 })])
      const double = await render('speed-2', [clip({ speed: 2 })])

      // At 1x a 2s clip never leaves the source's black first half.
      assert.ok(await luma(normal, whole, 1.5) < 40, 'the 1x render should still show the black half')
      // At 2x the same 2s clip has consumed all 4s, so it is in the white half.
      assert.ok(await luma(double, whole, 1.5) > 200, 'the 2x render should already show the white half')
    })

    await t.test('a fade-in really darkens the start of the clip', async () => {
      const faded = await render('fade-in', [clip({ asset: { id: 'a2', kind: 'video', uri: 'KINAOU/Assets/tone.mp4', managed: true, offline: false, metadata: { durationMs: 4000 } }, fades: { inMs: 1000, outMs: 0 } })])
      const early = await luma(faded, whole, 0.1)
      const late = await luma(faded, whole, 1.5)
      assert.ok(early < late - 60, `fade-in should start dark and end bright (got ${early} then ${late})`)
    })

    await t.test('scaling a clip down leaves the canvas visible around it', async () => {
      const scaled = await render('scaled', [clip({
        asset: { id: 'a2', kind: 'video', uri: 'KINAOU/Assets/tone.mp4', managed: true, offline: false, metadata: { durationMs: 4000 } },
        transform: { ...noTransform, scale: 0.4 }
      })])
      assert.ok(await luma(scaled, '320:180:160:90', 1) > 200, 'the scaled picture should still fill the centre')
      assert.ok(await luma(scaled, '80:45:0:0', 1) < 20, 'the corner should show the empty canvas, not the picture')
    })

    await t.test('clip gain really changes the mixed audio level', async () => {
      const audioAsset = { id: 'a2', kind: 'video', uri: 'KINAOU/Assets/tone.mp4', managed: true, offline: false, metadata: { durationMs: 4000 } }
      const loud = await render('gain-1', [clip({ trackType: 'voice', asset: audioAsset, gain: 1 })])
      const quiet = await render('gain-quarter', [clip({ trackType: 'voice', asset: audioAsset, gain: 0.25 })])

      const loudDb = await meanVolumeDb(loud)
      const quietDb = await meanVolumeDb(quiet)
      // A quarter of the amplitude is about 12 dB down; allow for encoder slack.
      assert.ok(quietDb < loudDb - 9, `gain 0.25 should be clearly quieter (got ${quietDb} dB vs ${loudDb} dB)`)
    })
  } finally {
    child.kill('SIGKILL')
    await new Promise((resolve) => { child.on('close', resolve); setTimeout(resolve, 3000).unref() })
    await rm(root, { recursive: true, force: true })
  }
})
