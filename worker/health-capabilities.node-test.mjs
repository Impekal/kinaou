import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const workerScript = fileURLToPath(new URL('./mac-worker.mjs', import.meta.url))
const TOKEN = 'health-capabilities-test-token'

async function startWorker(binDir, port) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'kinaou-health-test-'))
  const managedRoot = path.join(root, 'KINAOU')
  await mkdir(managedRoot, { recursive: true })
  const child = spawn(process.execPath, [workerScript], {
    env: {
      PATH: binDir,
      KINAOU_MANAGED_ROOT: managedRoot,
      KINAOU_WORKER_TOKEN: TOKEN,
      KINAOU_WORKER_PORT: String(port)
    },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  let output = ''
  const collect = (data) => { output += data.toString() }
  child.stdout.on('data', collect)
  child.stderr.on('data', collect)
  const deadline = Date.now() + 15_000
  while (!output.includes(`listening on http://127.0.0.1:${port}`)) {
    if (child.exitCode !== null) throw new Error(`Worker exited before listening: ${output}`)
    if (Date.now() > deadline) { child.kill('SIGKILL'); throw new Error(`Worker did not start in time: ${output}`) }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  return {
    output: () => output,
    async health() {
      const response = await fetch(`http://127.0.0.1:${port}/health`, { headers: { authorization: `Bearer ${TOKEN}` } })
      assert.equal(response.status, 200)
      const payload = await response.json()
      assert.equal(payload.ok, true)
      return payload.handshake
    },
    async stop() {
      child.kill('SIGTERM')
      await new Promise((resolve) => { child.on('close', resolve); setTimeout(() => { child.kill('SIGKILL'); resolve() }, 3000) })
      await rm(root, { recursive: true, force: true })
    }
  }
}

test('health omits FFmpeg-backed capabilities when ffmpeg and ffprobe are missing', async () => {
  const binDir = await mkdtemp(path.join(os.tmpdir(), 'kinaou-empty-bin-'))
  const worker = await startWorker(binDir, 43911)
  try {
    const handshake = await worker.health()
    assert.ok(handshake.capabilities.includes('filesystem'))
    assert.ok(handshake.capabilities.includes('asset-upload'))
    for (const dishonest of ['ffmpeg', 'media-probe', 'media-proxy', 'media-thumbnail', 'media-waveform']) {
      assert.ok(!handshake.capabilities.includes(dishonest), `capability ${dishonest} must not be advertised without FFmpeg`)
    }
    assert.equal(handshake.ffmpegVersion, undefined)
    assert.equal(handshake.ffprobeVersion, undefined)
    assert.match(worker.output(), /FFmpeg\/ffprobe not found in PATH/)
  } finally {
    await worker.stop()
    await rm(binDir, { recursive: true, force: true })
  }
})

test('health advertises FFmpeg-backed capabilities when ffmpeg and ffprobe respond', async () => {
  const binDir = await mkdtemp(path.join(os.tmpdir(), 'kinaou-stub-bin-'))
  for (const [name, version] of [['ffmpeg', 'ffmpeg version 7.0-kinaou-test'], ['ffprobe', 'ffprobe version 7.0-kinaou-test']]) {
    const stubPath = path.join(binDir, name)
    await writeFile(stubPath, `#!/bin/sh\necho "${version}"\n`)
    await chmod(stubPath, 0o755)
  }
  const worker = await startWorker(binDir, 43912)
  try {
    const handshake = await worker.health()
    for (const capability of ['filesystem', 'asset-upload', 'ffmpeg', 'media-probe', 'media-proxy', 'media-thumbnail', 'media-waveform']) {
      assert.ok(handshake.capabilities.includes(capability), `capability ${capability} must be advertised with FFmpeg present`)
    }
    assert.equal(handshake.ffmpegVersion, 'ffmpeg version 7.0-kinaou-test')
    assert.equal(handshake.ffprobeVersion, 'ffprobe version 7.0-kinaou-test')
    assert.ok(!worker.output().includes('FFmpeg/ffprobe not found in PATH'))
  } finally {
    await worker.stop()
    await rm(binDir, { recursive: true, force: true })
  }
})
