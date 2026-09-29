import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { mkdtemp, mkdir, readFile, writeFile, rename, rm, stat, symlink, readdir } from 'node:fs/promises'
import { createProjectSourceArchiveRuntime } from './project-source-archive.mjs'
import { createProjectSourceRestoreRuntime } from './project-source-restore.mjs'
import { sourceRestoreEvidence, restoreDirectory, validateSourceRestoreRequest, validateSourceRestoreJob } from './project-source-restore-protocol.mjs'
const hash = value => crypto.createHash('sha256').update(value).digest('hex')
async function settle(runtime, query) {
  const deadline = Date.now() + 10000
  for (;;) { const job = await runtime.status(query); if (!['queued','copying'].includes(job.state)) return job; if (Date.now() > deadline) throw Error('Restoration test timeout'); await new Promise(resolve => setTimeout(resolve, 5)) }
}
async function fixture(t) {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'kinaou-restore-')); t.after(() => rm(temp, { recursive: true, force: true }))
  const root = path.join(temp, 'KINAOU'); await mkdir(path.join(root, 'Assets'), { recursive: true })
  const media = Buffer.alloc(1024 ** 2 + 31, 71); await writeFile(path.join(root, 'Assets/source.bin'), media)
  const project = { schemaVersion: 1, id: 'private-course', title: 'Private recovery', script: 'Private answer', assets: [{ id: 'media', kind: 'other', uri: 'KINAOU/Assets/source.bin', managed: true }], tracks: [], storyboard: [] }
  const projectText = JSON.stringify(project), archive = createProjectSourceArchiveRuntime({ root })
  const source = { schemaVersion: 1, requestId: crypto.randomUUID(), projectId: project.id, projectSha256: hash(projectText) }
  await archive.start({ ...source, projectText, language: 'fr', acknowledgePrivateArchive: true })
  const verified = await settle(archive, source); assert.equal(verified.state, 'ready')
  const request = { schemaVersion: 1, restoreId: crypto.randomUUID(), source, evidenceSha256: hash(sourceRestoreEvidence(verified)), language: 'fr', acknowledgeIsolatedCopy: true }
  return { root, temp, media, projectText, source, archive, verified, request, runtime: createProjectSourceRestoreRuntime({ root, sourceRuntime: archive }), archiveFolder: path.join(temp, verified.result.directory), folder: path.join(temp, restoreDirectory(request.restoreId)) }
}
test('creates a genuinely independent private copy, preserves originals and rechecks without the source archive after restart', async t => {
  const f = await fixture(t), manifest = await readFile(path.join(f.archiveFolder, 'manifest.json'))
  await f.runtime.start(f.request); const job = await settle(f.runtime, f.request)
  assert.equal(job.state, 'ready', job.error); validateSourceRestoreJob(job, f.request)
  const copied = path.join(f.folder, 'source/KINAOU/Assets/source.bin'), archived = path.join(f.archiveFolder, 'source/KINAOU/Assets/source.bin')
  assert.deepEqual(await readFile(copied), f.media)
  assert.equal((await readFile(path.join(f.folder, 'source/KINAOU/Projects/project.json'))).toString(), f.projectText)
  assert.notEqual((await stat(copied)).ino, (await stat(archived)).ino)
  assert.equal((await stat(copied)).mode & 0o777, 0o600)
  assert.equal(job.result.projectTitle, 'Private recovery'); assert.equal(job.result.totalBytes, f.media.length)
  assert.match((await readFile(path.join(f.folder, 'README.txt'))).toString(), /COPIE DE TRAVAIL/)
  assert.deepEqual(await readFile(path.join(f.root, 'Assets/source.bin')), f.media)
  assert.deepEqual(await readFile(path.join(f.archiveFolder, 'manifest.json')), manifest)
  await rename(f.archiveFolder, f.archiveFolder + '-held')
  const restarted = createProjectSourceRestoreRuntime({ root: f.root })
  assert.equal((await restarted.status(f.request)).state, 'ready')
  assert.equal((await restarted.start(f.request)).state, 'ready') // no second copy or source dependency
  assert.deepEqual(await readdir(path.dirname(f.folder)), [f.request.restoreId])
})
test('unknown lookup is read-only; unavailable storage is an error, not an unused ID', async t => {
  const f = await fixture(t)
  assert.equal((await f.runtime.status(f.request)).state, 'unknown')
  await assert.rejects(stat(path.dirname(f.folder)), { code: 'ENOENT' })
  await rename(f.root, path.join(f.temp, 'Disconnected'))
  await assert.rejects(f.runtime.status(f.request), { code: 'ENOENT' })
})
test('requires exact reviewed source evidence before reserving any restoration directory', async t => {
  const f = await fixture(t)
  for (const changed of [{ ...f.request, acknowledgeIsolatedCopy: false }, { ...f.request, evidenceSha256: '0'.repeat(64) }, { ...f.request, restoreId: '../escape' }, { ...f.request, language: 'es' }]) await assert.rejects(f.runtime.start(changed))
  await assert.rejects(stat(path.dirname(f.folder)), { code: 'ENOENT' })
  await writeFile(path.join(f.archiveFolder, 'source/KINAOU/Assets/source.bin'), Buffer.alloc(f.media.length, 8))
  await assert.rejects(f.runtime.start(f.request))
  await assert.rejects(stat(path.dirname(f.folder)), { code: 'ENOENT' })
})
test('duplicate concurrent starts reserve only one folder and refuse mismatched source bindings', async t => {
  const f = await fixture(t)
  const [a, b] = await Promise.all([f.runtime.start(f.request), f.runtime.start(f.request)])
  assert.equal(a.query.restoreId, b.query.restoreId); assert.equal((await settle(f.runtime, f.request)).state, 'ready')
  assert.deepEqual(await readdir(path.dirname(f.folder)), [f.request.restoreId])
  await assert.rejects(f.runtime.status({ ...f.request, evidenceSha256: '0'.repeat(64) }))
  await assert.rejects(f.runtime.start({ ...f.request, source: { ...f.source, projectId: 'other' } }))
})
test('existing foreign or partial folders are preserved and never resumed', async t => {
  const f = await fixture(t); await mkdir(f.folder, { recursive: true }); await writeFile(path.join(f.folder, 'keep.txt'), 'FOREIGN')
  assert.equal((await f.runtime.start(f.request)).state, 'interrupted')
  assert.deepEqual(await readdir(f.folder), ['keep.txt']); assert.equal((await readFile(path.join(f.folder, 'keep.txt'))).toString(), 'FOREIGN')
})
test('source mutation after initial verification leaves a failed partial copy with no completion and no automatic retry', async t => {
  const f = await fixture(t), sourceFile = path.join(f.archiveFolder, 'source/KINAOU/Assets/source.bin')
  const changing = createProjectSourceRestoreRuntime({ root: f.root, sourceRuntime: { status: async query => { const result = await f.archive.status(query); await writeFile(sourceFile, Buffer.alloc(f.media.length, 12)); return result } } })
  await changing.start(f.request); const job = await settle(changing, f.request)
  assert.equal(job.state, 'failed'); assert.match(job.error, /Source changed/)
  await assert.rejects(stat(path.join(f.folder, 'manifest.json')), { code: 'ENOENT' })
  await writeFile(sourceFile, f.media)
  assert.equal((await createProjectSourceRestoreRuntime({ root: f.root }).start(f.request)).state, 'failed')
})
for (const item of ['source/KINAOU/Assets/source.bin','source/KINAOU/Projects/project.json','README.txt','SHA256SUMS']) test('detects changed restored ' + item + ' without modifying original archive', async t => {
  const f = await fixture(t); await f.runtime.start(f.request); assert.equal((await settle(f.runtime, f.request)).state, 'ready')
  const file = path.join(f.folder, item), before = await readFile(file); await writeFile(file, Buffer.alloc(before.length, 2))
  const runtime = createProjectSourceRestoreRuntime({ root: f.root })
  assert.equal((await runtime.status(f.request)).state, 'integrityFailed')
  assert.equal((await runtime.start(f.request)).state, 'integrityFailed')
  assert.equal((await f.archive.status(f.source)).state, 'ready')
})
for (const target of ['destination', 'media']) test('refuses symlink ' + target + ' without changing its target', async t => {
  const f = await fixture(t), foreign = path.join(f.temp, 'foreign'); await mkdir(foreign); await writeFile(path.join(foreign, 'keep'), 'KEEP')
  if (target === 'destination') await symlink(foreign, path.dirname(f.folder))
  else { const media = path.join(f.archiveFolder, 'source/KINAOU/Assets/source.bin'); await rm(media); await symlink(path.join(foreign, 'keep'), media) }
  await assert.rejects(f.runtime.start(f.request)); assert.equal((await readFile(path.join(foreign, 'keep'))).toString(), 'KEEP')
})
test('response schema binds destination, query, bytes, title and media set', async t => {
  const f = await fixture(t); await f.runtime.start(f.request); const good = await settle(f.runtime, f.request)
  for (const change of [
    j => j.query.restoreId = crypto.randomUUID(), j => j.result.managedRoot = 'KINAOU', j => j.result.projectPath = 'KINAOU/Projects/live.json',
    j => j.result.files[0].path = 'KINAOU/Assets/live.bin', j => j.result.files[0].sizeBytes = -1, j => j.result.totalBytes++,
    j => j.result.projectTitle = 'bad\nlabel', j => j.result.files.push(j.result.files[0]), j => j.result.integrityCheckedAt = 'invalid'
  ]) { const bad = structuredClone(good); change(bad); assert.throws(() => validateSourceRestoreJob(bad, f.request)) }
  assert.throws(() => sourceRestoreEvidence({ ...f.verified, state: 'copying' }))
  assert.throws(() => validateSourceRestoreRequest({ ...f.request, source: { ...f.source, projectSha256: 'bad' } }))
})
