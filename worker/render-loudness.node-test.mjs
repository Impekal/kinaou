import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const workerScript = fileURLToPath(new URL('./mac-worker.mjs', import.meta.url))
const TOKEN = 'render-loudness-test-token'
const PORT = 43927

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false }); const stdout = []; let stderr = ''
    child.stdout?.on('data', (chunk) => stdout.push(chunk)); child.stderr?.on('data', (chunk) => { stderr += chunk.toString() })
    child.on('error', reject); child.on('close', (code) => code === 0 ? resolve({ stdout: Buffer.concat(stdout), stderr }) : reject(new Error(`${command} exited with ${code}: ${stderr.slice(0, 500)}`)))
  })
}

async function volume(file) {
  const { stderr } = await run('ffmpeg', ['-v', 'info', '-i', file, '-af', 'volumedetect', '-f', 'null', '-'])
  const mean = stderr.match(/mean_volume:\s*(-?\d+(?:\.\d+)?) dB/); const peak = stderr.match(/max_volume:\s*(-?\d+(?:\.\d+)?) dB/)
  assert.ok(mean && peak, `No volume measurement: ${stderr.slice(-500)}`)
  return { meanDb: Number(mean[1]), peakDb: Number(peak[1]) }
}

test('optional loudnorm measurably raises a quiet export and stays off otherwise', { timeout: 300_000 }, async (t) => {
  try { await run('ffmpeg', ['-version']); await run('ffprobe', ['-version']) } catch { t.skip('ffmpeg/ffprobe not installed'); return }
  const root = await mkdtemp(path.join(os.tmpdir(), 'kinaou-render-loudness-')); const managedRoot = path.join(root, 'KINAOU')
  await mkdir(path.join(managedRoot, 'Assets'), { recursive: true }); await mkdir(path.join(managedRoot, 'Renders'), { recursive: true })
  await run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=black:size=320x180:rate=30:duration=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', path.join(managedRoot, 'Assets', 'black.mp4')])
  await run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=3', '-af', 'volume=0.02', path.join(managedRoot, 'Assets', 'quiet.wav')])
  const child = spawn(process.execPath, [workerScript], { env: { PATH: process.env.PATH, KINAOU_MANAGED_ROOT: managedRoot, KINAOU_WORKER_TOKEN: TOKEN, KINAOU_WORKER_PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''; child.stdout.on('data', (data) => { output += data }); child.stderr.on('data', (data) => { output += data })
  try {
    const deadline = Date.now() + 15_000
    while (!output.includes(`listening on http://127.0.0.1:${PORT}`)) { if (child.exitCode !== null) throw new Error(`Worker exited: ${output}`); if (Date.now() > deadline) throw new Error(`Worker start timeout: ${output}`); await new Promise((resolve) => setTimeout(resolve, 100)) }
    const base = { startMs: 0, sourceOffsetMs: 0, durationMs: 3000, gain: 1, speed: 1, transform: { x: 0, y: 0, scale: 1, cropLeft: 0, cropTop: 0, cropRight: 0, cropBottom: 0 }, fades: { inMs: 0, outMs: 0 } }
    const clips = [
      { ...base, trackId: 'v', trackType: 'video', trackIndex: 0, clipId: 'visual', asset: { id: 'visual', kind: 'video', uri: 'KINAOU/Assets/black.mp4', managed: true, offline: false, metadata: { durationMs: 3000 } } },
      { ...base, trackId: 'a', trackType: 'voice', trackIndex: 1, clipId: 'audio', asset: { id: 'audio', kind: 'audio', uri: 'KINAOU/Assets/quiet.wav', managed: true, offline: false, metadata: { durationMs: 3000 } } }
    ]
    async function render(name, enabled) {
      const relative = `KINAOU/Renders/${name}.mp4`
      const body = { plan: { purpose: 'export', projectId: 'p', outputRelativePath: relative, preset: { name: 'Loudness', container: 'mp4', width: 320, height: 180, fps: 30, videoCodec: 'h264', audioCodec: 'aac' }, durationMs: 3000, requiredCapabilities: ['filesystem', 'ffmpeg'], audioDucking: { enabled: false, reductionDb: 12, attackMs: 150, releaseMs: 400 }, loudnessNormalization: { enabled, targetLufs: -14, truePeakDb: -1.5, loudnessRange: 11 }, clips } }
      const started = await (await fetch(`http://127.0.0.1:${PORT}/render`, { method: 'POST', headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify(body) })).json()
      assert.equal(started.ok, true, JSON.stringify(started)); let job
      for (let attempt = 0; attempt < 120; attempt += 1) { await new Promise((resolve) => setTimeout(resolve, 500)); job = (await (await fetch(`http://127.0.0.1:${PORT}/render/jobs/${started.job.id}`, { headers: { authorization: `Bearer ${TOKEN}` } })).json()).job; if (!['queued', 'running'].includes(job.state)) break }
      assert.equal(job?.state, 'succeeded', job?.error); return path.join(managedRoot, 'Renders', `${name}.mp4`)
    }
    const plain = await volume(await render('plain', false)); const normalized = await volume(await render('normalized', true))
    t.diagnostic(`measured export volume: plain mean ${plain.meanDb} dB / peak ${plain.peakDb} dB; normalized mean ${normalized.meanDb} dB / peak ${normalized.peakDb} dB`)
    assert.ok(normalized.meanDb > plain.meanDb + 15, `normalization should materially raise quiet audio: ${plain.meanDb} to ${normalized.meanDb} dB`)
    assert.ok(normalized.peakDb <= -1, `normalized true peak should retain headroom, got ${normalized.peakDb} dB`)
  } finally { child.kill('SIGKILL'); await new Promise((resolve) => { child.on('close', resolve); setTimeout(resolve, 3000).unref() }); await rm(root, { recursive: true, force: true }) }
})
