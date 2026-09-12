import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const workerScript = fileURLToPath(new URL('./mac-worker.mjs', import.meta.url))
const TOKEN = 'render-ducking-test-token'
const PORT = 43926

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false }); const stdout = []; let stderr = ''
    child.stdout?.on('data', (chunk) => stdout.push(chunk)); child.stderr?.on('data', (chunk) => { stderr += chunk.toString() })
    child.on('error', reject); child.on('close', (code) => code === 0 ? resolve({ stdout: Buffer.concat(stdout), stderr }) : reject(new Error(`${command} exited with ${code}: ${stderr.slice(0, 500)}`)))
  })
}

async function volumeDb(file, start, duration) {
  const { stderr } = await run('ffmpeg', ['-v', 'info', '-ss', String(start), '-t', String(duration), '-i', file, '-af', 'volumedetect', '-f', 'null', '-'])
  const match = stderr.match(/mean_volume:\s*(-?\d+(?:\.\d+)?) dB/)
  assert.ok(match, `No measured volume: ${stderr.slice(-500)}`)
  return Number(match[1])
}

test('music is measurably quieter during a voice interval', { timeout: 300_000 }, async (t) => {
  try { await run('ffmpeg', ['-version']); await run('ffprobe', ['-version']) } catch { t.skip('ffmpeg/ffprobe not installed'); return }
  const root = await mkdtemp(path.join(os.tmpdir(), 'kinaou-render-ducking-')); const managedRoot = path.join(root, 'KINAOU')
  await mkdir(path.join(managedRoot, 'Assets'), { recursive: true }); await mkdir(path.join(managedRoot, 'Renders'), { recursive: true })
  await run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=black:size=320x180:rate=30:duration=6', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', path.join(managedRoot, 'Assets', 'black.mp4')])
  await run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=6', path.join(managedRoot, 'Assets', 'music.wav')])
  await run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=mono', '-t', '2', path.join(managedRoot, 'Assets', 'voice.wav')])
  const child = spawn(process.execPath, [workerScript], { env: { PATH: process.env.PATH, KINAOU_MANAGED_ROOT: managedRoot, KINAOU_WORKER_TOKEN: TOKEN, KINAOU_WORKER_PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''; child.stdout.on('data', (data) => { output += data }); child.stderr.on('data', (data) => { output += data })
  try {
    const deadline = Date.now() + 15_000
    while (!output.includes(`listening on http://127.0.0.1:${PORT}`)) { if (child.exitCode !== null) throw new Error(`Worker exited: ${output}`); if (Date.now() > deadline) throw new Error(`Worker start timeout: ${output}`); await new Promise((resolve) => setTimeout(resolve, 100)) }
    const base = { startMs: 0, sourceOffsetMs: 0, gain: 1, speed: 1, transform: { x: 0, y: 0, scale: 1, cropLeft: 0, cropTop: 0, cropRight: 0, cropBottom: 0 }, fades: { inMs: 0, outMs: 0 } }
    const clips = [
      { ...base, trackId: 'v', trackType: 'video', trackIndex: 0, clipId: 'visual', durationMs: 6000, asset: { id: 'visual', kind: 'video', uri: 'KINAOU/Assets/black.mp4', managed: true, offline: false, metadata: { durationMs: 6000 } } },
      { ...base, trackId: 'm', trackType: 'music', trackIndex: 1, clipId: 'music', durationMs: 6000, asset: { id: 'music', kind: 'audio', uri: 'KINAOU/Assets/music.wav', managed: true, offline: false, metadata: { durationMs: 6000 } } },
      { ...base, trackId: 'd', trackType: 'voice', trackIndex: 2, clipId: 'voice', startMs: 2000, durationMs: 2000, asset: { id: 'voice', kind: 'audio', uri: 'KINAOU/Assets/voice.wav', managed: true, offline: false, metadata: { durationMs: 2000 } } }
    ]
    const relative = 'KINAOU/Renders/ducking.mp4'
    const response = await fetch(`http://127.0.0.1:${PORT}/render`, { method: 'POST', headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify({ plan: { purpose: 'export', projectId: 'p', outputRelativePath: relative, preset: { name: 'Ducking', container: 'mp4', width: 320, height: 180, fps: 30, videoCodec: 'h264', audioCodec: 'aac' }, durationMs: 6000, requiredCapabilities: ['filesystem', 'ffmpeg'], audioDucking: { enabled: true, reductionDb: 12, attackMs: 150, releaseMs: 400 }, clips } }) })
    const started = await response.json(); assert.equal(started.ok, true, JSON.stringify(started)); let job
    for (let attempt = 0; attempt < 120; attempt += 1) { await new Promise((resolve) => setTimeout(resolve, 500)); job = (await (await fetch(`http://127.0.0.1:${PORT}/render/jobs/${started.job.id}`, { headers: { authorization: `Bearer ${TOKEN}` } })).json()).job; if (!['queued', 'running'].includes(job.state)) break }
    assert.equal(job?.state, 'succeeded', job?.error)
    const file = path.join(managedRoot, 'Renders', 'ducking.mp4'); const outside = await volumeDb(file, 0.5, 0.8); const during = await volumeDb(file, 2.5, 0.8)
    t.diagnostic(`measured music mean volume: outside ${outside} dB, during voice ${during} dB`)
    assert.ok(during < outside - 9, `12 dB ducking should be measurable (outside ${outside} dB, during ${during} dB)`)
  } finally { child.kill('SIGKILL'); await new Promise((resolve) => { child.on('close', resolve); setTimeout(resolve, 3000).unref() }); await rm(root, { recursive: true, force: true }) }
})
