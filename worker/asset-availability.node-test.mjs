import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const workerScript = fileURLToPath(new URL('./mac-worker.mjs', import.meta.url))
const TOKEN = 'asset-availability-test-token'
const PORT = 43914

test('availability endpoint reports real file presence and rejects unmanaged paths', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'kinaou-availability-test-'))
  const managedRoot = path.join(root, 'KINAOU')
  await mkdir(path.join(managedRoot, 'Assets'), { recursive: true })
  await writeFile(path.join(managedRoot, 'Assets', 'present.mp4'), 'real bytes')
  await writeFile(path.join(managedRoot, 'Assets', 'empty.png'), '')

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

    const call = async (body, token = TOKEN) => {
      const response = await fetch(`http://127.0.0.1:${PORT}/assets/availability`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify(body)
      })
      return { status: response.status, payload: await response.json() }
    }

    const ok = await call({ paths: ['KINAOU/Assets/present.mp4', 'KINAOU/Assets/missing.mov', 'KINAOU/Assets/empty.png'] })
    assert.equal(ok.status, 200)
    assert.equal(ok.payload.type, 'asset-availability')
    assert.deepEqual(ok.payload.results, [
      { path: 'KINAOU/Assets/present.mp4', available: true },
      { path: 'KINAOU/Assets/missing.mov', available: false },
      { path: 'KINAOU/Assets/empty.png', available: false }
    ])

    const escape = await call({ paths: ['KINAOU/../outside.txt'] })
    assert.equal(escape.status, 403)
    assert.equal(escape.payload.ok, false)

    const unmanaged = await call({ paths: ['/etc/passwd'] })
    assert.equal(unmanaged.status, 403)

    const empty = await call({ paths: [] })
    assert.equal(empty.status, 400)

    const unauthorized = await call({ paths: ['KINAOU/Assets/present.mp4'] }, 'wrong-token')
    assert.equal(unauthorized.status, 401)
  } finally {
    child.kill('SIGKILL')
    await new Promise((resolve) => { child.on('close', resolve); setTimeout(resolve, 3000).unref() })
    await rm(root, { recursive: true, force: true })
  }
})
