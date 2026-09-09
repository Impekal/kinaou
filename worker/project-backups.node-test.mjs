import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { access, mkdir, mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const workerScript = fileURLToPath(new URL('./mac-worker.mjs', import.meta.url))
const TOKEN = 'project-backup-test-token'
const PORT = 43915

test('project backups round-trip through the managed drive with strict ids', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'kinaou-backup-test-'))
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

    const call = async (route, options = {}) => {
      const response = await fetch(`http://127.0.0.1:${PORT}${route}`, {
        headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
        ...options
      })
      return { status: response.status, payload: await response.json() }
    }

    const project = { id: 'e2e-project-1', schemaVersion: 1, title: 'Backup Roundtrip', updatedAt: '2026-09-09T00:00:00.000Z', assets: [], tracks: [], storyboard: [], metadata: {} }
    const saved = await call('/projects/save', { method: 'POST', body: JSON.stringify({ project }) })
    assert.equal(saved.status, 201)
    assert.equal(saved.payload.result.path, 'KINAOU/Projects/e2e-project-1.json')
    await access(path.join(managedRoot, 'Projects', 'e2e-project-1.json'))

    const listed = await call('/projects/backups')
    assert.equal(listed.status, 200)
    assert.equal(listed.payload.backups.length, 1)
    assert.equal(listed.payload.backups[0].id, 'e2e-project-1')
    assert.equal(listed.payload.backups[0].title, 'Backup Roundtrip')
    assert.equal(listed.payload.backups[0].updatedAt, '2026-09-09T00:00:00.000Z')

    const restored = await call('/projects/restore', { method: 'POST', body: JSON.stringify({ id: 'e2e-project-1' }) })
    assert.equal(restored.status, 200)
    assert.deepEqual(restored.payload.project, project)

    const badId = await call('/projects/restore', { method: 'POST', body: JSON.stringify({ id: '../escape' }) })
    assert.equal(badId.status, 400)

    const badSave = await call('/projects/save', { method: 'POST', body: JSON.stringify({ project: { id: 'x', title: '' } }) })
    assert.equal(badSave.status, 400)

    const missing = await call('/projects/restore', { method: 'POST', body: JSON.stringify({ id: 'does-not-exist' }) })
    assert.ok(missing.status >= 400)

    const unauthorized = await fetch(`http://127.0.0.1:${PORT}/projects/backups`, { headers: { authorization: 'Bearer wrong' } })
    assert.equal(unauthorized.status, 401)
  } finally {
    child.kill('SIGKILL')
    await new Promise((resolve) => { child.on('close', resolve); setTimeout(resolve, 3000).unref() })
    await rm(root, { recursive: true, force: true })
  }
})
