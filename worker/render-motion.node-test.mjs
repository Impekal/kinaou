import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const workerScript = fileURLToPath(new URL('./mac-worker.mjs', import.meta.url))
const TOKEN = 'render-motion-test-token'
const PORT = 43920

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false })
    const stdout = []
    let stderr = ''
    child.stdout?.on('data', (chunk) => stdout.push(chunk))
    child.stderr?.on('data', (chunk) => { stderr += chunk.toString() })
    child.on('error', reject)
    child.on('close', (code) => code === 0 ? resolve(Buffer.concat(stdout)) : reject(new Error(`${command} exited with ${code}: ${stderr.slice(0, 400)}`)))
  })
}

async function hasFfmpeg() {
  try { await run('ffmpeg', ['-version']); await run('ffprobe', ['-version']); return true } catch { return false }
}

/** A coarse greyscale fingerprint of one frame, for comparing two moments. */
async function frameSignature(file, atSeconds) {
  const raw = await run('ffmpeg', ['-v', 'error', '-ss', String(atSeconds), '-i', file, '-vf', 'scale=16:16', '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'])
  return [...raw]
}

function meanAbsoluteDifference(a, b) {
  assert.equal(a.length, b.length)
  let total = 0
  for (let index = 0; index < a.length; index += 1) total += Math.abs(a[index] - b[index])
  return total / a.length
}

const preset = { name: 'Motion', container: 'mp4', width: 640, height: 640, fps: 30, videoCodec: 'h264', audioCodec: 'aac' }
const noTransform = { x: 0, y: 0, scale: 1, cropLeft: 0, cropTop: 0, cropRight: 0, cropBottom: 0 }

function stillClip(motion, fit) {
  return {
    trackId: 't1', trackType: 'video', trackIndex: 0, clipId: 'c1',
    // A 1280x720 still: in a square canvas it is letterboxed, so the contain path has
    // to compute its own target size rather than stretching it to the canvas.
    asset: { id: 'a1', kind: 'image', uri: 'KINAOU/Assets/still.png', managed: true, offline: false, metadata: { width: 1280, height: 720 } },
    startMs: 0, durationMs: 3000, sourceOffsetMs: 0, gain: 1, speed: 1,
    transform: noTransform, fades: { inMs: 0, outMs: 0 },
    ...(motion ? { motion } : {}),
    ...(fit ? {} : {})
  }
}

test('a still scene really moves when motion is enabled', { timeout: 300_000 }, async (t) => {
  if (!(await hasFfmpeg())) {
    t.skip('ffmpeg/ffprobe not installed — skipping the executing motion test')
    return
  }

  const root = await mkdtemp(path.join(os.tmpdir(), 'kinaou-render-motion-'))
  const managedRoot = path.join(root, 'KINAOU')
  await mkdir(path.join(managedRoot, 'Assets'), { recursive: true })
  await mkdir(path.join(managedRoot, 'Renders'), { recursive: true })
  await run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=1280x720:rate=1:duration=1', '-frames:v', '1', path.join(managedRoot, 'Assets', 'still.png')])

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

    const render = async (name, clips, usedPreset = preset) => {
      const outputRelativePath = `KINAOU/Renders/${name}.mp4`
      const response = await fetch(`http://127.0.0.1:${PORT}/render`, {
        method: 'POST',
        headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
        body: JSON.stringify({ plan: { purpose: 'export', projectId: 'p1', outputRelativePath, preset: usedPreset, durationMs: 3000, requiredCapabilities: ['filesystem', 'ffmpeg'], clips } })
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

    await t.test('a still without motion is identical from start to end', async () => {
      const file = await render('still', [stillClip(undefined)])
      const drift = meanAbsoluteDifference(await frameSignature(file, 0.2), await frameSignature(file, 2.7))
      assert.ok(drift < 2, `a motionless still should not change (mean difference ${drift})`)
    })

    await t.test('zoom-in and zoom-out visibly change the picture over the clip', async () => {
      for (const motion of ['zoom-in', 'zoom-out']) {
        const file = await render(motion, [stillClip(motion)])
        const drift = meanAbsoluteDifference(await frameSignature(file, 0.2), await frameSignature(file, 2.7))
        assert.ok(drift > 4, `${motion} should visibly change the picture (mean difference ${drift})`)
      }
    })

    await t.test('a letterboxed still keeps its aspect ratio while it moves', async () => {
      const file = await render('letterboxed', [stillClip('zoom-in')])
      // The 16:9 still sits in a square canvas: the top rows must stay empty canvas
      // throughout, which a stretched-to-canvas frame would have filled with picture.
      for (const at of [0.2, 1.5, 2.7]) {
        const raw = await run('ffmpeg', ['-v', 'error', '-ss', String(at), '-i', file, '-vf', 'crop=640:60:0:0,scale=1:1', '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'])
        assert.ok((raw[0] ?? 0) < 12, `the letterbox band should stay empty at ${at}s (got ${raw[0]})`)
      }
    })

    await t.test('motion fills the frame when the format crops to cover', async () => {
      const file = await render('cover-motion', [stillClip('zoom-in')], { ...preset, fit: 'cover' })
      const raw = await run('ffmpeg', ['-v', 'error', '-ss', '1.5', '-i', file, '-vf', 'crop=640:60:0:0,scale=1:1', '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'])
      assert.ok((raw[0] ?? 0) > 20, `cover motion should fill the top of the frame (got ${raw[0]})`)
    })

    await t.test('motion on anything but a still is refused, not silently ignored', async () => {
      const response = await fetch(`http://127.0.0.1:${PORT}/render`, {
        method: 'POST',
        headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
        body: JSON.stringify({ plan: { purpose: 'export', projectId: 'p1', outputRelativePath: 'KINAOU/Renders/bad.mp4', preset, durationMs: 1000, requiredCapabilities: ['filesystem', 'ffmpeg'], clips: [{ ...stillClip('sideways'), asset: { id: 'a1', kind: 'image', uri: 'KINAOU/Assets/still.png', managed: true, offline: false, metadata: {} } }] } })
      })
      assert.equal(response.status, 400)
      const payload = await response.json()
      assert.match(payload.error.message, /clip motion/i)
    })
  } finally {
    child.kill('SIGKILL')
    await new Promise((resolve) => { child.on('close', resolve); setTimeout(resolve, 3000).unref() })
    await rm(root, { recursive: true, force: true })
  }
})
