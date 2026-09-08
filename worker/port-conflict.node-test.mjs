import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const workerScript = fileURLToPath(new URL('./mac-worker.mjs', import.meta.url))
const PORT = 43913

function spawnWorker(managedRoot) {
  return spawn(process.execPath, [workerScript], {
    env: {
      PATH: process.env.PATH,
      KINAOU_MANAGED_ROOT: managedRoot,
      KINAOU_WORKER_TOKEN: 'port-conflict-test-token',
      KINAOU_WORKER_PORT: String(PORT)
    },
    stdio: ['ignore', 'pipe', 'pipe']
  })
}

test('a second worker on an occupied port exits with a clear explanation instead of a stack trace', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'kinaou-port-test-'))
  const managedRoot = path.join(root, 'KINAOU')
  await mkdir(managedRoot, { recursive: true })
  const first = spawnWorker(managedRoot)
  try {
    let firstOutput = ''
    first.stdout.on('data', (data) => { firstOutput += data.toString() })
    const deadline = Date.now() + 15_000
    while (!firstOutput.includes(`listening on http://127.0.0.1:${PORT}`)) {
      if (first.exitCode !== null) throw new Error(`First worker exited before listening: ${firstOutput}`)
      if (Date.now() > deadline) throw new Error(`First worker did not start in time: ${firstOutput}`)
      await new Promise((resolve) => setTimeout(resolve, 100))
    }

    const second = spawnWorker(managedRoot)
    let secondOutput = ''
    second.stdout.on('data', (data) => { secondOutput += data.toString() })
    second.stderr.on('data', (data) => { secondOutput += data.toString() })
    const exitCode = await new Promise((resolve, reject) => {
      second.on('close', resolve)
      setTimeout(() => { second.kill('SIGKILL'); reject(new Error(`Second worker did not exit: ${secondOutput}`)) }, 15_000).unref()
    })

    assert.equal(exitCode, 1)
    assert.match(secondOutput, new RegExp(`Port ${PORT} on 127\\.0\\.0\\.1 is already in use`))
    assert.match(secondOutput, new RegExp(`kill \\$\\(lsof -ti :${PORT}\\)`))
    assert.match(secondOutput, /KINAOU_WORKER_PORT/)
    assert.ok(!secondOutput.includes('Unhandled'), `must not crash with an unhandled error event: ${secondOutput}`)
    assert.ok(!secondOutput.includes('at Server.setupListenHandle'), `must not print a stack trace: ${secondOutput}`)
  } finally {
    first.kill('SIGKILL')
    await new Promise((resolve) => { first.on('close', resolve); setTimeout(resolve, 3000).unref() })
    await rm(root, { recursive: true, force: true })
  }
})
