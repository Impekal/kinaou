import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const workerScript = fileURLToPath(new URL('./mac-worker.mjs', import.meta.url))
const TOKEN = 'publish-package-test-token'
const PORT = 43928

test('publish packages are real non-overwriting sidecars for existing managed exports', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'kinaou-publish-test-'))
  const managedRoot = path.join(root, 'KINAOU')
  const renders = path.join(managedRoot, 'Renders')
  await mkdir(renders, { recursive: true })
  const source = path.join(renders, 'finished.mp4')
  await writeFile(source, 'real rendered bytes')

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

    const valid = {
      schemaVersion: 1,
      projectId: 'project-1',
      export: { schemaVersion: 1, jobId: 'job-1', label: 'Finished export', outputRelativePath: 'KINAOU/Renders/finished.mp4', format: 'landscape', range: { inMs: 0, outMs: 5000 }, sceneIds: ['scene-1'], durationMs: 5000, completedAt: '2026-09-13T08:00:00.000Z' },
      platform: 'youtube',
      title: 'Reviewed title',
      description: 'Reviewed description',
      tags: ['KINAOU', 'local']
    }
    const call = async (body, token = TOKEN) => {
      const response = await fetch(`http://127.0.0.1:${PORT}/publish/packages`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) })
      return { status: response.status, payload: await response.json() }
    }
    const list = async (projectId, token = TOKEN) => {
      const response = await fetch(`http://127.0.0.1:${PORT}/publish/packages?projectId=${encodeURIComponent(projectId)}`, { headers: { authorization: `Bearer ${token}` } })
      return { status: response.status, payload: await response.json() }
    }

    const first = await call(valid)
    assert.equal(first.status, 201)
    assert.equal(first.payload.type, 'publish-package')
    assert.equal(first.payload.result.sourcePath, valid.export.outputRelativePath)
    assert.match(first.payload.result.path, /^KINAOU\/Renders\/finished_youtube_.*\.publish\.json$/)
    const document = JSON.parse(await readFile(path.join(managedRoot, first.payload.result.path.slice('KINAOU/'.length)), 'utf8'))
    assert.deepEqual(document, {
      schemaVersion: 1,
      kind: 'kinaou-publish-package',
      createdAt: first.payload.result.createdAt,
      projectId: 'project-1',
      platform: 'youtube',
      title: 'Reviewed title',
      description: 'Reviewed description',
      tags: ['KINAOU', 'local'],
      media: { ...valid.export, sizeBytes: 19 }
    })

    const second = await call(valid)
    assert.equal(second.status, 201)
    assert.notEqual(second.payload.result.path, first.payload.result.path)
    assert.equal((await readFile(source, 'utf8')), 'real rendered bytes')

    const otherProject = await call({ ...valid, projectId: 'project-2', title: 'Other project' })
    assert.equal(otherProject.status, 201)
    await writeFile(path.join(renders, 'malformed.publish.json'), '{not-json')
    await symlink(path.join(managedRoot, first.payload.result.path.slice('KINAOU/'.length)), path.join(renders, 'linked.publish.json'))
    const library = await list('project-1')
    assert.equal(library.status, 200)
    assert.equal(library.payload.type, 'publish-packages')
    assert.equal(library.payload.packages.length, 2)
    assert.ok(library.payload.packages.every((entry) => entry.document.projectId === 'project-1'))
    assert.ok(library.payload.packages.every((entry) => entry.document.kind === 'kinaou-publish-package'))
    assert.ok(library.payload.packages.every((entry) => entry.sourceAvailable === true))
    assert.ok(library.payload.packages.every((entry) => entry.path.endsWith('.publish.json')))
    assert.ok(!library.payload.packages.some((entry) => entry.path === otherProject.payload.result.path))

    await symlink(source, path.join(renders, 'linked.mp4'))
    const symlinkedSource = await call({ ...valid, export: { ...valid.export, outputRelativePath: 'KINAOU/Renders/linked.mp4' } })
    assert.equal(symlinkedSource.status, 400)
    assert.match(symlinkedSource.payload.error.message, /missing or empty/)

    await rm(source)
    const missingSourceLibrary = await list('project-1')
    assert.ok(missingSourceLibrary.payload.packages.every((entry) => entry.sourceAvailable === false))
    const invalidProject = await list(' ')
    assert.equal(invalidProject.status, 400)
    const unauthorizedList = await list('project-1', 'wrong')
    assert.equal(unauthorizedList.status, 401)

    const missing = await call({ ...valid, export: { ...valid.export, outputRelativePath: 'KINAOU/Renders/missing.mp4' } })
    assert.equal(missing.status, 400)
    assert.match(missing.payload.error.message, /missing or empty/)
    const escape = await call({ ...valid, export: { ...valid.export, outputRelativePath: 'KINAOU/../outside.mp4' } })
    assert.equal(escape.status, 403)
    const duplicateTags = await call({ ...valid, tags: ['same', 'SAME'] })
    assert.equal(duplicateTags.status, 400)
    const unauthorized = await call(valid, 'wrong')
    assert.equal(unauthorized.status, 401)
  } finally {
    child.kill('SIGKILL')
    await new Promise((resolve) => { child.on('close', resolve); setTimeout(resolve, 3000).unref() })
    await rm(root, { recursive: true, force: true })
  }
})
