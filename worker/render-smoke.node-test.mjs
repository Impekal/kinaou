import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, rm, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const workerScript = fileURLToPath(new URL('./mac-worker.mjs', import.meta.url))
const TOKEN = 'render-smoke-test-token'
const PORT = 43917

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, ...options })
    const stdout = []
    let stderr = ''
    child.stdout?.on('data', (chunk) => stdout.push(chunk))
    child.stderr?.on('data', (chunk) => { stderr += chunk.toString() })
    child.on('error', reject)
    child.on('close', (code) => code === 0
      ? resolve(Buffer.concat(stdout))
      : reject(new Error(`${command} exited with ${code}: ${stderr.slice(0, 400)}`)))
  })
}

async function hasFfmpeg() {
  try {
    await run('ffmpeg', ['-version'])
    await run('ffprobe', ['-version'])
    return true
  } catch {
    return false
  }
}

/** Average luma (0-255) of a region, by letting ffmpeg scale it down to a single pixel. */
async function regionLuma(file, crop, atSeconds = 1) {
  const raw = await run('ffmpeg', ['-v', 'error', '-ss', String(atSeconds), '-i', file, '-vf', `crop=${crop},scale=1:1`, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'])
  return raw[0] ?? 0
}

/**
 * Counts near-white pixels at full resolution. Downscaling first would average thin
 * caption strokes into the background and hide text that is genuinely there.
 */
async function brightPixels(file, crop, atSeconds = 1) {
  const raw = await run('ffmpeg', ['-v', 'error', '-ss', String(atSeconds), '-i', file, '-vf', `crop=${crop}`, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'])
  let count = 0
  for (const value of raw) if (value > 200) count += 1
  return count
}

async function dimensions(file) {
  const raw = await run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file])
  const [width, height] = raw.toString().trim().split(',').map(Number)
  return { width, height }
}

const basePreset = { name: 'Smoke', container: 'mp4', fps: 30, videoCodec: 'h264', audioCodec: 'aac' }

function visualClip(durationMs, source = 'wide.mp4') {
  return {
    trackId: 't1', trackType: 'video', trackIndex: 0, clipId: 'c1',
    asset: { id: 'a1', kind: 'video', uri: `KINAOU/Assets/${source}`, managed: true, offline: false, metadata: { durationMs: 3000 } },
    startMs: 0, durationMs, sourceOffsetMs: 0, gain: 1, speed: 1,
    transform: { x: 0, y: 0, scale: 1, cropLeft: 0, cropTop: 0, cropRight: 0, cropBottom: 0 },
    fades: { inMs: 0, outMs: 0 }
  }
}

function captionClip(durationMs, text) {
  return {
    trackId: 't2', trackType: 'caption', trackIndex: 1, clipId: 'c2',
    asset: { id: 'a2', kind: 'caption', uri: 'kinaou://caption/a2', managed: true, offline: false, metadata: { text } },
    startMs: 0, durationMs, sourceOffsetMs: 0, gain: 1, speed: 1,
    transform: { x: 0, y: 0, scale: 1, cropLeft: 0, cropTop: 0, cropRight: 0, cropBottom: 0 },
    fades: { inMs: 0, outMs: 0 }
  }
}

test('the real FFmpeg compositor renders the formats it advertises', { timeout: 300_000 }, async (t) => {
  if (!(await hasFfmpeg())) {
    t.skip('ffmpeg/ffprobe not installed — skipping the executing render smoke test')
    return
  }

  const root = await mkdtemp(path.join(os.tmpdir(), 'kinaou-render-smoke-'))
  const managedRoot = path.join(root, 'KINAOU')
  await mkdir(path.join(managedRoot, 'Assets'), { recursive: true })
  await mkdir(path.join(managedRoot, 'Renders'), { recursive: true })
  // A wide, bright 16:9 source: a vertical frame can only be filled by cropping it.
  await run('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'testsrc=size=1920x1080:rate=30:duration=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', path.join(managedRoot, 'Assets', 'wide.mp4')])
  // A flat dark source: white caption text is unambiguous against it, where the busy
  // test pattern above is already full of bright pixels.
  await run('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'color=c=0x101014:size=1280x720:rate=30:duration=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', path.join(managedRoot, 'Assets', 'dark.mp4')])

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

    const render = async (preset, outputRelativePath, clips) => {
      const response = await fetch(`http://127.0.0.1:${PORT}/render`, {
        method: 'POST',
        headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
        body: JSON.stringify({ plan: { purpose: 'export', projectId: 'p1', outputRelativePath, preset, durationMs: 2000, requiredCapabilities: ['filesystem', 'ffmpeg'], clips } })
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

    await t.test('landscape export keeps the source framing', async () => {
      const file = await render({ ...basePreset, width: 1920, height: 1080 }, 'KINAOU/Renders/landscape.mp4', [visualClip(2000)])
      assert.deepEqual(await dimensions(file), { width: 1920, height: 1080 })
      assert.ok((await stat(file)).size > 0)
    })

    await t.test('cover fills a vertical frame while contain letterboxes it', async () => {
      const cover = await render({ ...basePreset, width: 1080, height: 1920, fit: 'cover' }, 'KINAOU/Renders/vertical-cover.mp4', [visualClip(2000)])
      const contain = await render({ ...basePreset, width: 1080, height: 1920, fit: 'contain' }, 'KINAOU/Renders/vertical-contain.mp4', [visualClip(2000)])

      assert.deepEqual(await dimensions(cover), { width: 1080, height: 1920 })
      assert.deepEqual(await dimensions(contain), { width: 1080, height: 1920 })

      // The top band carries picture in cover mode and is a black bar in contain mode.
      assert.ok(await regionLuma(cover, '1080:300:0:0') > 20, 'cover mode still letterboxes the top of the frame')
      assert.ok(await regionLuma(contain, '1080:300:0:0') < 5, 'contain mode unexpectedly filled the top of the frame')
    })

    await t.test('the same source renders as a real square adaptation', async () => {
      const square = await render({ ...basePreset, width: 1080, height: 1080, fit: 'cover' }, 'KINAOU/Renders/square-cover.mp4', [visualClip(2000)])
      assert.deepEqual(await dimensions(square), { width: 1080, height: 1080 })
      assert.ok((await stat(square)).size > 0)
    })

    await t.test('captions are really burnt into the picture', async () => {
      const plain = await render({ ...basePreset, width: 1280, height: 720 }, 'KINAOU/Renders/plain.mp4', [visualClip(2000, 'dark.mp4')])
      const captioned = await render({ ...basePreset, width: 1280, height: 720 }, 'KINAOU/Renders/captioned.mp4', [visualClip(2000, 'dark.mp4'), captionClip(2000, 'Hallo Welt')])

      const band = '1280:180:0:520'
      const withoutText = await brightPixels(plain, band)
      const withText = await brightPixels(captioned, band)
      assert.equal(withoutText, 0, 'the dark reference render should have no bright pixels in the caption band')
      assert.ok(withText > 0, 'no caption text was burnt into the picture')
    })
  } finally {
    child.kill('SIGKILL')
    await new Promise((resolve) => { child.on('close', resolve); setTimeout(resolve, 3000).unref() })
    await rm(root, { recursive: true, force: true })
  }
})
