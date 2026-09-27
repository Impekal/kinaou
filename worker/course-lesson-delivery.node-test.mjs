import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, unlink, symlink } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { createLessonDeliveryRuntime, validateLessonDeliveryRequest } from './course-lesson-delivery.mjs'

const bytes = Buffer.from([0,0,0,16,...Buffer.from('ftypisomTEST')])
const request = () => ({ schemaVersion: 1, requestId: crypto.randomUUID(), projectId: 'project', acknowledgePrivateMetadata: true,
  export: { schemaVersion: 1, jobId: 'job', label: 'Lesson', outputRelativePath: 'KINAOU/Renders/source.mp4', format: 'landscape', range: { inMs: 0, outMs: 1000 }, durationMs: 1000, sceneIds: [], completedAt: '2026-09-27T00:00:00.000Z',
    courseLesson: { courseId: 'course', moduleId: 'module', lessonId: 'lesson', outlineRevision: 1, courseTitle: 'Course', moduleTitle: 'Module', lessonTitle: 'Lesson', language: 'en' } } })
const probe = async () => ({ width: 1920, height: 1080, durationMs: 1000, videoCodec: 'h264', audioCodec: 'aac' })
async function setup(fn) {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'kinaou-delivery-')), root = path.join(temp, 'KINAOU'), renders = path.join(root, 'Renders'), source = path.join(renders, 'source.mp4')
  await mkdir(renders, { recursive: true }); await writeFile(source, bytes)
  try { await fn({ temp, root, renders, source, runtime: createLessonDeliveryRuntime({ root, probe }) }) } finally { await rm(temp, { recursive: true, force: true }) }
}
async function finish(runtime, input) {
  for (let i = 0; i < 200; i++) { const job = await runtime.status(input); if (!['queued','copying','verifying'].includes(job.state)) return job; await new Promise(resolve => setTimeout(resolve, 5)) }
  throw Error('Fixture delivery did not finish')
}
test('copies exact original bytes, hashes them, retains private receipt and rechecks after worker restart', () => setup(async ({ root, source, runtime }) => {
  const input = request(); await runtime.start(input); const job = await finish(runtime, input)
  assert.equal(job.state, 'ready'); assert.equal(job.result.sha256, crypto.createHash('sha256').update(bytes).digest('hex'))
  const dir = path.join(root, 'Renders/CourseDeliveries', input.requestId)
  assert.deepEqual(await readFile(path.join(dir, 'lesson.mp4')), bytes); assert.deepEqual(await readFile(source), bytes)
  assert.match(await readFile(path.join(dir, 'README.txt'), 'utf8'), /PRIVATE/)
  const manifest = JSON.parse(await readFile(path.join(dir, 'manifest.json'), 'utf8'))
  assert.deepEqual(manifest.request, validateLessonDeliveryRequest(input)); assert.equal(manifest.fullProjectBackup, false); assert.equal(manifest.teachingQualityApproved, false)
  const restarted = createLessonDeliveryRuntime({ root, probe: () => { throw Error('No re-render/probe on completed recovery') } })
  await unlink(source)
  assert.equal((await restarted.status(input)).state, 'ready'); assert.equal((await restarted.start(input)).state, 'ready')
  assert.deepEqual((await readdir(path.dirname(dir))), [input.requestId])
}))
test('same request is idempotent while running; different request at same ID is refused', () => setup(async ({ root }) => {
  let release; const gate = new Promise(resolve => { release = resolve })
  const runtime = createLessonDeliveryRuntime({ root, probe: async () => { await gate; return probe() } }), input = request()
  await Promise.all([runtime.start(input), runtime.start(structuredClone(input))])
  await assert.rejects(runtime.start({ ...input, projectId: 'other' }), /conflict/)
  await assert.rejects(runtime.status({ ...input, export: { ...input.export, label: 'Other' } }), /conflict/)
  release(); assert.equal((await finish(runtime, input)).state, 'ready')
}))
test('modified and missing copies are not reported as verified; original stays unchanged', () => setup(async ({ root, source, runtime }) => {
  const input = request(); await runtime.start(input); await finish(runtime, input)
  const media = path.join(root, 'Renders/CourseDeliveries', input.requestId, 'lesson.mp4')
  const changed = Buffer.from(bytes); changed[changed.length - 1] ^= 1; await writeFile(media, changed)
  assert.equal((await runtime.status(input)).state, 'integrityFailed')
  await unlink(media); assert.equal((await runtime.status(input)).state, 'integrityFailed')
  assert.deepEqual(await readFile(source), bytes)
}))
test('failed technical check cleans only its generated payloads, never original media', () => setup(async ({ root, source }) => {
  const runtime = createLessonDeliveryRuntime({ root, probe: async () => ({ ...await probe(), width: 320 }) }), input = request()
  await runtime.start(input); const job = await finish(runtime, input)
  assert.equal(job.state, 'failed'); assert.match(job.error, /dimensions/)
  const names = await readdir(path.join(root, 'Renders/CourseDeliveries', input.requestId))
  assert.ok(!names.includes('lesson.mp4')); assert.ok(!names.includes('lesson.mp4.partial')); assert.ok(!names.includes('manifest.json'))
  assert.deepEqual(await readFile(source), bytes)
  assert.equal((await createLessonDeliveryRuntime({ root, probe }).start(input)).state, 'failed')
}))
test('unknown status is read-only and incomplete reserved directory is never overwritten', () => setup(async ({ root, renders, runtime }) => {
  const input = request(); assert.equal((await runtime.status(input)).state, 'unknown')
  assert.deepEqual(await readdir(renders), ['source.mp4'])
  const folder = path.join(renders, 'CourseDeliveries', input.requestId); await mkdir(folder, { recursive: true }); await writeFile(path.join(folder, 'foreign-marker.txt'), 'untouched')
  assert.equal((await runtime.start(input)).state, 'interrupted')
  assert.deepEqual(await readdir(folder), ['foreign-marker.txt'])
  await writeFile(path.join(folder, 'request.json'), JSON.stringify(validateLessonDeliveryRequest(input)))
  await writeFile(path.join(folder, 'status.json'), JSON.stringify({ schemaVersion: 1, request: validateLessonDeliveryRequest(input), state: 'copying', totalBytes: 16, copiedBytes: 4 }))
  assert.equal((await createLessonDeliveryRuntime({ root, probe }).status(input)).state, 'interrupted')
  assert.equal(await readFile(path.join(folder, 'foreign-marker.txt'), 'utf8'), 'untouched')
}))
test('rejects symlinked destination parent instead of writing outside managed root', () => setup(async ({ root, renders, temp, runtime }) => {
  await mkdir(path.join(temp, 'outside')); await symlink(path.join(temp, 'outside'), path.join(renders, 'CourseDeliveries'))
  await assert.rejects(runtime.start(request()), /Unsafe/); assert.deepEqual(await readdir(path.join(temp, 'outside')), [])
}))
for (const kind of ['ack','id','course','path','project']) test(`rejects malformed ${kind} request before output creation`, () => setup(async ({ runtime, renders }) => {
  const input = request()
  if (kind === 'ack') input.acknowledgePrivateMetadata = false
  if (kind === 'id') input.requestId = '../escape'
  if (kind === 'course') input.export.courseLesson.language = 'xx'
  if (kind === 'path') input.export.outputRelativePath = 'KINAOU/Assets/source.mp4'
  if (kind === 'project') input.projectId = 'bad\nproject'
  await assert.rejects(runtime.start(input)); assert.deepEqual(await readdir(renders), ['source.mp4'])
}))
