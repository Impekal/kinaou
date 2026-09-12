import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const workerScript = fileURLToPath(new URL('./mac-worker.mjs', import.meta.url))
const TOKEN = 'render-range-test-token'
const PORT = 43925

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false })
    const stdout = []; let stderr = ''
    child.stdout?.on('data', (chunk) => stdout.push(chunk)); child.stderr?.on('data', (chunk) => { stderr += chunk.toString() })
    child.on('error', reject); child.on('close', (code) => code === 0 ? resolve(Buffer.concat(stdout)) : reject(new Error(`${command} exited with ${code}: ${stderr.slice(0, 500)}`)))
  })
}

async function toolsAvailable() {
  try { await run('ffmpeg', ['-version']); await run('ffprobe', ['-version']); return true } catch { return false }
}

test('the real compositor renders the selected source interval at the selected duration', { timeout: 300_000 }, async (t) => {
  if (!await toolsAvailable()) { t.skip('ffmpeg/ffprobe not installed — skipping executing range test'); return }
  const root = await mkdtemp(path.join(os.tmpdir(), 'kinaou-render-range-'))
  const managedRoot = path.join(root, 'KINAOU')
  await mkdir(path.join(managedRoot, 'Assets'), { recursive: true }); await mkdir(path.join(managedRoot, 'Renders'), { recursive: true })
  const source = path.join(managedRoot, 'Assets', 'source.mp4')
  await run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=red:size=320x180:rate=30:duration=1', '-f', 'lavfi', '-i', 'color=green:size=320x180:rate=30:duration=1', '-f', 'lavfi', '-i', 'color=blue:size=320x180:rate=30:duration=1', '-filter_complex', '[0:v][1:v][2:v]concat=n=3:v=1:a=0[v]', '-map', '[v]', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', source])

  const child = spawn(process.execPath, [workerScript], { env: { PATH: process.env.PATH, KINAOU_MANAGED_ROOT: managedRoot, KINAOU_WORKER_TOKEN: TOKEN, KINAOU_WORKER_PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''; child.stdout.on('data', (data) => { output += data }); child.stderr.on('data', (data) => { output += data })
  try {
    const deadline = Date.now() + 15_000
    while (!output.includes(`listening on http://127.0.0.1:${PORT}`)) { if (child.exitCode !== null) throw new Error(`Worker exited: ${output}`); if (Date.now() > deadline) throw new Error(`Worker start timeout: ${output}`); await new Promise((resolve) => setTimeout(resolve, 100)) }
    const outputRelativePath = 'KINAOU/Renders/range.mp4'
    const clip = { trackId: 't1', trackType: 'video', trackIndex: 0, clipId: 'c1', asset: { id: 'a1', kind: 'video', uri: 'KINAOU/Assets/source.mp4', managed: true, offline: false, metadata: { durationMs: 3000 } }, startMs: 0, durationMs: 1000, sourceOffsetMs: 1000, gain: 1, speed: 1, transform: { x: 0, y: 0, scale: 1, cropLeft: 0, cropTop: 0, cropRight: 0, cropBottom: 0 }, fades: { inMs: 0, outMs: 0 } }
    const response = await fetch(`http://127.0.0.1:${PORT}/render`, { method: 'POST', headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify({ plan: { purpose: 'export', projectId: 'p1', outputRelativePath, preset: { name: 'Range', container: 'mp4', width: 320, height: 180, fps: 30, videoCodec: 'h264', audioCodec: 'aac' }, durationMs: 1000, requiredCapabilities: ['filesystem', 'ffmpeg'], clips: [clip] } }) })
    const started = await response.json(); assert.equal(started.ok, true, JSON.stringify(started))
    let job
    for (let attempt = 0; attempt < 60; attempt += 1) { await new Promise((resolve) => setTimeout(resolve, 500)); const status = await fetch(`http://127.0.0.1:${PORT}/render/jobs/${started.job.id}`, { headers: { authorization: `Bearer ${TOKEN}` } }); job = (await status.json()).job; if (!['queued', 'running'].includes(job.state)) break }
    assert.equal(job?.state, 'succeeded', job?.error)
    const rendered = path.join(managedRoot, 'Renders', 'range.mp4')
    const duration = Number((await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', rendered])).toString())
    assert.ok(Math.abs(duration - 1) < 0.08, `expected 1.0s, got ${duration}`)
    const rgb = await run('ffmpeg', ['-v', 'error', '-ss', '0.5', '-i', rendered, '-vf', 'scale=1:1', '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'])
    assert.ok(rgb[1] > rgb[0] * 1.5 && rgb[1] > rgb[2] * 1.5, `expected green source interval, got RGB ${[...rgb.slice(0, 3)]}`)
  } finally {
    child.kill('SIGKILL'); await new Promise((resolve) => { child.on('close', resolve); setTimeout(resolve, 3000).unref() }); await rm(root, { recursive: true, force: true })
  }
})
