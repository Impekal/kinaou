import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, symlink } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { createLessonDeliveryRuntime } from './course-lesson-delivery.mjs'
import { createCourseCollectionRuntime } from './course-delivery-collection.mjs'
import { collectionSourceText, validateCourseCollectionRequest, validateCourseCollectionJob } from './course-collection-protocol.mjs'
const digest = text => crypto.createHash('sha256').update(text).digest('hex')
const bytes = Buffer.from([0,0,0,16,...Buffer.from('ftypisomTEST')])
const probe = async () => ({ width: 1920, height: 1080, durationMs: 1000, videoCodec: 'h264', audioCodec: 'aac' })
async function setup(fn) {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'kinaou-collection-')), root = path.join(temp, 'KINAOU'), renders = path.join(root, 'Renders')
  await mkdir(renders, { recursive: true }); await writeFile(path.join(renders, 'source.mp4'), bytes)
  try {
    const lessons = createLessonDeliveryRuntime({ root, probe }), sources = []
    for (let n = 1; n <= 2; n++) {
      const context = { courseId: 'course', moduleId: 'module', lessonId: `lesson-${n}`, outlineRevision: 1, courseTitle: 'Course', moduleTitle: 'Module', lessonTitle: `Historical ${n}`, language: 'fr' }
      const subtitle = 'WEBVTT\n\n1\n00:00:00.000 --> 00:00:01.000\nBonjour\n'
      const request = { schemaVersion: 3, requestId: crypto.randomUUID(), projectId: 'project', acknowledgePrivateMetadata: true,
        export: { schemaVersion: 1, jobId: `job-${n}`, label: 'Lesson', outputRelativePath: 'KINAOU/Renders/source.mp4', format: 'landscape', range: { inMs: 0, outMs: 1000 }, durationMs: 1000, sceneIds: [], completedAt: '2026-09-27T00:00:00.000Z', courseLesson: context },
        materials: { acknowledgeTextVideoMatch: true, source: { context, range: { inMs: 0, outMs: 1000 }, projectMetadataSha256: 'a'.repeat(64), preparedAt: '2026-09-27T00:00:00.000Z' }, subtitles: { cueCount: 1, clippedCues: 0 }, files: [{ path: 'learner/subtitles.vtt', text: subtitle, sha256: digest(subtitle) }, { path: 'instructor/answer-key.txt', text: 'PRIVATE', sha256: digest('PRIVATE') }] } }
      await lessons.start(request); const source = await lessons.settledStatus(request); assert.equal(source.state, 'ready'); sources.push(source)
    }
    const input = validateCourseCollectionRequest({ schemaVersion: 1, requestId: crypto.randomUUID(), projectId: 'project', acknowledgePrivateMetadata: true, course: { courseId: 'course', title: 'Current course', language: 'fr', outlineRevision: 2, lessonCount: 3 }, lessons: sources.map(source => ({ sourceRequestId: source.request.requestId, sourceFingerprint: digest(collectionSourceText(source)), moduleId: 'module', lessonId: source.request.export.courseLesson.lessonId, moduleTitle: 'Current module', lessonTitle: 'Current title', range: source.request.export.range })) })
    await fn({ temp, root, renders, lessons, sources, input, runtime: createCourseCollectionRuntime({ root, probe, lessonRuntime: lessons }), folder: path.join(renders, 'CourseCollections', input.requestId) })
  } finally { await rm(temp, { recursive: true, force: true }) }
}
async function finish(runtime, input) {
  for (let i = 0; i < 400; i++) { const job = await runtime.status(input); if (!['queued','checking','copying'].includes(job.state)) return job; await new Promise(resolve => setTimeout(resolve, 5)) }
  throw Error('Collection fixture timed out')
}
test('collection discovery is metadata-only and explicit inspection works after restart without browser request or ffprobe', () => setup(async f => {
  assert.equal((await f.runtime.list({ projectId: 'project' })).scanned, 0)
  assert.ok(!(await readdir(f.renders)).includes('CourseCollections'))
  await f.runtime.start(f.input); assert.equal((await finish(f.runtime, f.input)).state, 'ready')
  const manifest = await readFile(path.join(f.folder, 'manifest.json')), request = await readFile(path.join(f.folder, 'request.json'))
  const restarted = createCourseCollectionRuntime({ root: f.root, probe: () => { throw Error('Read-only inspection must not probe') } })
  const page = await restarted.list({ projectId: 'project' })
  assert.deepEqual(page.entries, [{ requestId: f.input.requestId, projectId: 'project', course: f.input.course, selectedLessons: 2, hasCompletionRecord: true }])
  assert.equal((await restarted.inspect({ projectId: 'project', requestId: f.input.requestId })).state, 'ready')
  await assert.rejects(restarted.inspect({ projectId: 'other', requestId: f.input.requestId }), /another project/)
  assert.deepEqual((await restarted.list({ projectId: 'other' })).entries, [])
  const media = path.join(f.folder, 'lessons', f.sources[0].request.requestId, 'lesson.mp4')
  await writeFile(media, 'CHANGED')
  assert.equal((await restarted.list({ projectId: 'project' })).entries[0].hasCompletionRecord, true)
  assert.equal((await restarted.inspect({ projectId: 'project', requestId: f.input.requestId })).state, 'integrityFailed')
  assert.equal(await readFile(media, 'utf8'), 'CHANGED'); assert.deepEqual(await readFile(path.join(f.folder, 'manifest.json')), manifest); assert.deepEqual(await readFile(path.join(f.folder, 'request.json')), request)
  assert.deepEqual(await readdir(path.dirname(f.folder)), [f.input.requestId]); assert.equal((await f.lessons.status(f.sources[0].request)).state, 'ready')
}))
test('collection library paginates empty other-project pages, skips malformed/unsafe entries and never repairs them', () => setup(async f => {
  const parent = path.dirname(f.folder), id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
  await mkdir(parent)
  for (let n = 1; n <= 43; n++) {
    const folder = path.join(parent, id(n))
    if (n === 31) { await symlink(f.temp, folder); continue }
    await mkdir(folder); const input = { ...f.input, requestId: n === 32 ? crypto.randomUUID() : id(n), projectId: n <= 20 ? 'other' : 'project' }
    await writeFile(path.join(folder, 'request.json'), n === 30 ? '{malformed' : JSON.stringify(input))
  }
  const first = await f.runtime.list({ projectId: 'project' }); assert.equal(first.scanned, 20); assert.deepEqual(first.entries, []); assert.equal(first.nextCursor, id(20))
  const second = await f.runtime.list({ projectId: 'project', after: first.nextCursor }); assert.equal(second.scanned, 20); assert.equal(second.skipped, 3); assert.equal(second.entries.length, 17); assert.equal(second.nextCursor, id(40))
  const third = await f.runtime.list({ projectId: 'project', after: second.nextCursor }); assert.equal(third.scanned, 3); assert.equal(third.entries.length, 3); assert.equal(third.nextCursor, undefined)
  assert.ok(third.entries.every(entry => !entry.hasCompletionRecord))
  assert.equal((await f.runtime.inspect({ projectId: 'project', requestId: id(43) })).state, 'interrupted')
  await assert.rejects(f.runtime.inspect({ projectId: 'project', requestId: id(32) }), /another project or ID/)
  await assert.rejects(f.runtime.inspect({ projectId: 'project', requestId: id(31) }), /Unsafe/)
  assert.equal(await readFile(path.join(parent, id(30), 'request.json'), 'utf8'), '{malformed'); assert.equal((await readdir(parent)).length, 43)
}))
test('collection listing rejects unsafe parent and invalid cursor/project before reading anything', () => setup(async f => {
  await assert.rejects(f.runtime.list({ projectId: 'bad\nproject' })); await assert.rejects(f.runtime.list({ projectId: 'project', after: '../escape' }))
  await symlink(f.temp, path.join(f.renders, 'CourseCollections'))
  await assert.rejects(f.runtime.list({ projectId: 'project' }), /Unsafe/)
  await assert.rejects(f.runtime.inspect({ projectId: 'project', requestId: '../escape' }))
}))
test('copies two independent v3 packages, exact private materials and ordered subset index; survives source removal/restart', () => setup(async f => {
  await f.runtime.start(f.input); const job = await finish(f.runtime, f.input); assert.equal(job.state, 'ready', job.error)
  assert.equal(validateCourseCollectionJob(job, f.input).result.lessons.length, 2)
  assert.equal(job.result.totalMediaBytes, bytes.length * 2)
  const index = JSON.parse(await readFile(path.join(f.folder, 'COURSE.json'), 'utf8'))
  assert.equal(index.private, true); assert.equal(index.teachingQualityApproved, false); assert.equal(index.fullSourceProjectBackup, false)
  assert.equal(index.request.course.lessonCount, 3); assert.deepEqual(index.lessons.map(item => item.sourceRequestId), f.input.lessons.map(item => item.sourceRequestId))
  for (const source of f.sources) {
    const child = path.join(f.folder, 'lessons', source.request.requestId)
    assert.deepEqual(await readFile(path.join(child, 'lesson.mp4')), bytes)
    for (const file of source.request.materials.files) assert.equal(await readFile(path.join(child, file.path), 'utf8'), file.text)
  }
  assert.match(await readFile(path.join(f.folder, 'README.txt'), 'utf8'), /PRIVÉE/)
  assert.equal((await readFile(path.join(f.folder, 'SHA256SUMS'), 'utf8')).trim().split('\n').length, 6)
  assert.equal((await f.lessons.list({ projectId: 'project' })).entries.length, 2)
  const filesBefore = await readdir(f.folder)
  await rm(path.join(f.renders, 'CourseDeliveries'), { recursive: true }); await rm(path.join(f.renders, 'source.mp4'))
  const restarted = createCourseCollectionRuntime({ root: f.root, probe: () => { throw Error('No new copy') } })
  assert.equal((await restarted.status(f.input)).state, 'ready'); assert.equal((await restarted.start(f.input)).state, 'ready')
  assert.deepEqual(await readdir(f.folder), filesBefore)
}))
for (const item of ['COURSE.json','SHA256SUMS','README.txt','video','subtitle','childManifest']) test(`detects changed ${item}, never repairs source/copy automatically`, () => setup(async f => {
  await f.runtime.start(f.input); assert.equal((await finish(f.runtime, f.input)).state, 'ready')
  const file = ['video','subtitle','childManifest'].includes(item) ? path.join(f.folder, 'lessons', f.sources[0].request.requestId, item === 'video' ? 'lesson.mp4' : item === 'subtitle' ? 'learner/subtitles.vtt' : 'manifest.json') : path.join(f.folder, item)
  await writeFile(file, 'CHANGED'); assert.equal((await f.runtime.status(f.input)).state, 'integrityFailed')
  assert.equal(await readFile(file, 'utf8'), 'CHANGED'); assert.equal((await f.lessons.status(f.sources[0].request)).state, 'ready')
}))
for (const kind of ['fingerprint','range','language','project']) test(`preflight refuses stale ${kind} before any child payload`, () => setup(async f => {
  const input = structuredClone(f.input)
  if (kind === 'fingerprint') input.lessons[0].sourceFingerprint = 'f'.repeat(64)
  if (kind === 'range') input.lessons[0].range.outMs = 2000
  if (kind === 'language') input.course.language = 'de'
  if (kind === 'project') input.projectId = 'other'
  await f.runtime.start(input); assert.equal((await finish(f.runtime, input)).state, 'failed')
  assert.ok(!(await readdir(f.folder)).includes('lessons')); assert.equal((await f.runtime.start(input)).state, 'failed')
}))
test('unknown/incomplete status is read-only; foreign reserved folder never overwritten', () => setup(async f => {
  assert.equal((await f.runtime.status(f.input)).state, 'unknown'); assert.ok(!(await readdir(f.renders)).includes('CourseCollections'))
  await mkdir(f.folder, { recursive: true }); await writeFile(path.join(f.folder, 'foreign.txt'), 'KEEP')
  assert.equal((await f.runtime.start(f.input)).state, 'interrupted'); assert.deepEqual(await readdir(f.folder), ['foreign.txt'])
  await writeFile(path.join(f.folder, 'request.json'), JSON.stringify(f.input)); await writeFile(path.join(f.folder, 'status.json'), JSON.stringify({ schemaVersion: 1, request: f.input, state: 'copying', completedLessons: 0 }))
  assert.equal((await f.runtime.status(f.input)).state, 'interrupted'); assert.equal(await readFile(path.join(f.folder, 'foreign.txt'), 'utf8'), 'KEEP')
}))
test('rejects symlink destination and invalid internal namespace without writes outside managed root', () => setup(async f => {
  const outside = path.join(f.temp, 'outside'); await mkdir(outside); await symlink(outside, path.join(f.renders, 'CourseCollections'))
  await assert.rejects(f.runtime.start(f.input), /Unsafe/); assert.deepEqual(await readdir(outside), [])
  assert.throws(() => createLessonDeliveryRuntime({ root: f.root, probe, collectionId: '../escape' }), /namespace/)
}))
test('reserves one operation, rejects collisions, retains partial failure and never automatically retries', () => setup(async f => {
  let release; const gate = new Promise(resolve => { release = resolve }); let probes = 0
  const runtime = createCourseCollectionRuntime({ root: f.root, lessonRuntime: f.lessons, probe: async () => { probes++; await gate; if (probes === 2) throw Error('Second copy failed'); return probe() } })
  await runtime.start(f.input); await runtime.start(structuredClone(f.input))
  await assert.rejects(runtime.start({ ...f.input, requestId: crypto.randomUUID() }), /one collection/)
  await assert.rejects(runtime.status({ ...f.input, course: { ...f.input.course, title: 'Conflict' } }), /conflict/)
  release(); const job = await finish(runtime, f.input); assert.equal(job.state, 'failed')
  assert.ok(!(await readdir(f.folder)).includes('manifest.json'))
  assert.deepEqual(await readFile(path.join(f.folder, 'lessons', f.sources[0].request.requestId, 'lesson.mp4')), bytes)
  const restarted = createCourseCollectionRuntime({ root: f.root, probe: () => { throw Error('No restart') } })
  assert.equal((await restarted.start(f.input)).state, 'failed'); assert.equal((await f.lessons.status(f.sources[1].request)).state, 'ready')
}))
for (const kind of ['ack','duplicate','count','id']) test(`rejects invalid collection ${kind} before reserving a folder`, () => setup(async f => {
  const input = structuredClone(f.input)
  if (kind === 'ack') input.acknowledgePrivateMetadata = false
  if (kind === 'duplicate') input.lessons[1] = input.lessons[0]
  if (kind === 'count') input.course.lessonCount = 1
  if (kind === 'id') input.requestId = '../escape'
  await assert.rejects(f.runtime.start(input)); assert.ok(!(await readdir(f.renders)).includes('CourseCollections'))
}))
