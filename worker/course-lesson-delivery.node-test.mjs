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

function withMaterials() {
  const input = request(); input.schemaVersion = 2
  input.materials = { acknowledgeTextVideoMatch: true, source: { context: { ...input.export.courseLesson, outlineRevision: 2 }, range: input.export.range, projectMetadataSha256: 'a'.repeat(64), preparedAt: '2026-09-27T00:00:00.000Z' }, files: [
    { path: 'learner/worksheet.txt', text: '\ufeff  Question 🌍\r\nHint' },
    { path: 'instructor/answer-key.txt', text: 'PRIVATE_ANSWER' }
  ].map(file => ({ ...file, sha256: crypto.createHash('sha256').update(file.text).digest('hex') })) }
  return input
}
function withSubtitles() {
  const input = withMaterials(); input.schemaVersion = 3
  const text = 'WEBVTT\n\n1\n00:00:00.000 --> 00:00:01.000\nBonjour &lt;b&gt;🌍&lt;/b&gt;\n'
  input.materials.files.push({ path: 'learner/subtitles.vtt', text, sha256: crypto.createHash('sha256').update(text).digest('hex') })
  input.materials.subtitles = { cueCount: 1, clippedCues: 1 }; return input
}
test('retains actual v3 subtitle bytes/counts and rehashes them after worker restart without resubmission', () => setup(async ({ root, runtime, source }) => {
  const input = withSubtitles(); await runtime.start(input); const job = await finish(runtime, input)
  assert.equal(job.state, 'ready'); assert.equal(job.request.schemaVersion, 3)
  const folder = path.join(root, 'Renders/CourseDeliveries', input.requestId), subtitle = path.join(folder, 'learner/subtitles.vtt')
  assert.equal(await readFile(subtitle, 'utf8'), input.materials.files[2].text)
  const restarted = createLessonDeliveryRuntime({ root, probe: () => { throw Error('No new copy') } })
  assert.equal((await restarted.start(input)).state, 'ready')
  assert.deepEqual((await restarted.status(input)).request.materials.subtitles, { cueCount: 1, clippedCues: 1 })
  await writeFile(subtitle, 'WEBVTT\n\n'); assert.equal((await restarted.status(input)).state, 'integrityFailed')
  assert.deepEqual(await readdir(path.dirname(folder)), [input.requestId]); assert.deepEqual(await readFile(source), bytes)
}))
for (const kind of ['version','file','metadata','count','clipping','format','range']) test(`rejects invalid subtitle ${kind} before output creation`, () => setup(async ({ runtime, renders }) => {
  const input = withSubtitles()
  if (kind === 'version') input.schemaVersion = 2
  if (kind === 'file') input.materials.files.pop()
  if (kind === 'metadata') delete input.materials.subtitles
  if (kind === 'count') input.materials.subtitles.cueCount = 2
  if (kind === 'clipping') input.materials.subtitles.clippedCues = 2
  if (kind === 'format' || kind === 'range') {
    const file = input.materials.files[2]; file.text = kind === 'format' ? 'not WebVTT' : file.text.replace('00:00:01.000', '00:00:02.000')
    file.sha256 = crypto.createHash('sha256').update(file.text).digest('hex')
  }
  await assert.rejects(runtime.start(input)); assert.deepEqual(await readdir(renders), ['source.mp4'])
}))
test('writes exact reviewed text bytes, separates answers and rehashes all payloads after restart', () => setup(async ({ root, source, runtime }) => {
  const input = withMaterials(); await runtime.start(input); const job = await finish(runtime, input)
  assert.equal(job.state, 'ready'); assert.equal(job.result.files.length, 2)
  const folder = path.join(root, 'Renders/CourseDeliveries', input.requestId)
  for (const file of input.materials.files) assert.deepEqual(await readFile(path.join(folder, file.path)), Buffer.from(file.text))
  assert.doesNotMatch(await readFile(path.join(folder, 'learner/worksheet.txt'), 'utf8'), /PRIVATE_ANSWER/)
  assert.match(await readFile(path.join(folder, 'README.txt'), 'utf8'), /NEVER share this whole package/)
  const sums = await readFile(path.join(folder, 'SHA256SUMS'), 'utf8')
  for (const file of input.materials.files) assert.ok(sums.includes(`${file.sha256}  ${file.path}\n`))
  const restarted = createLessonDeliveryRuntime({ root, probe })
  assert.equal((await restarted.status(input)).state, 'ready')
  const privateFile = path.join(folder, 'instructor/answer-key.txt')
  await writeFile(privateFile, 'PRIVATE_ANSWEZ'); assert.equal((await restarted.status(input)).state, 'integrityFailed')
  await unlink(privateFile); assert.equal((await restarted.status(input)).state, 'integrityFailed')
  await writeFile(privateFile, 'PRIVATE_ANSWER'); assert.equal((await restarted.start(input)).state, 'ready')
  await unlink(privateFile); await symlink(source, privateFile); assert.equal((await restarted.status(input)).state, 'integrityFailed')
  assert.deepEqual(await readFile(source), bytes)
}))
for (const kind of ['hash','path','duplicate','unicode','control','size','count','language','range','ack','version','missing']) test(`rejects invalid material ${kind} before reserving output`, () => setup(async ({ runtime, renders }) => {
  const input = withMaterials(), packet = input.materials
  if (kind === 'hash') packet.files[0].sha256 = 'f'.repeat(64)
  if (kind === 'path') packet.files[0].path = 'learner/answer-key.txt'
  if (kind === 'duplicate') packet.files[1].path = packet.files[0].path
  if (kind === 'unicode') packet.files[0].text = '\ud800'
  if (kind === 'control') packet.files[0].text = 'bad\0text'
  if (kind === 'size') packet.files[0].text = 'é'.repeat(262145)
  if (kind === 'count') packet.files = Array.from({ length: 15 }, (_, i) => ({ ...packet.files[0], path: `learner/material-${i}.txt` }))
  if (kind === 'language') packet.source.context.language = 'fr'
  if (kind === 'range') packet.source.range = { inMs: 0, outMs: 2000 }
  if (kind === 'ack') packet.acknowledgeTextVideoMatch = false
  if (kind === 'version') input.schemaVersion = 1
  if (kind === 'missing') delete input.materials
  await assert.rejects(runtime.start(input)); assert.deepEqual(await readdir(renders), ['source.mp4'])
}))
for (const collision of ['lesson.mp4','manifest.json','learner']) test(`never overwrites or deletes a foreign ${collision} that appears during the operation`, () => setup(async ({ root, source }) => {
  const input = withMaterials(), folder = path.join(root, 'Renders/CourseDeliveries', input.requestId)
  const runtime = createLessonDeliveryRuntime({ root, probe: async () => {
    if (collision === 'learner') { await mkdir(path.join(folder, collision)); await writeFile(path.join(folder, collision, 'foreign.txt'), 'FOREIGN') }
    else await writeFile(path.join(folder, collision), 'FOREIGN')
    return probe()
  } })
  await runtime.start(input)
  // A foreign malformed manifest is deliberately not accepted as a completed job.
  if (collision === 'manifest.json') {
    try { assert.equal((await finish(runtime, input)).state, 'failed') }
    catch (error) { assert.ok(error instanceof SyntaxError) }
  } else assert.equal((await finish(runtime, input)).state, 'failed')
  // The in-memory failure precedes asynchronous cleanup/status persistence.
  let persisted
  for (let i = 0; i < 200; i++) {
    persisted = JSON.parse(await readFile(path.join(folder, 'status.json'), 'utf8'))
    if (persisted.state === 'failed') break
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  assert.equal(persisted.state, 'failed')
  assert.equal(await readFile(path.join(folder, collision === 'learner' ? 'learner/foreign.txt' : collision), 'utf8'), 'FOREIGN')
  assert.ok(!(await readdir(folder)).includes('lesson.mp4.partial'))
  if (collision !== 'lesson.mp4') assert.ok(!(await readdir(folder)).includes('lesson.mp4'))
  assert.deepEqual(await readFile(source), bytes)
}))

test('library is explicitly read-only, works without browser tickets and rehashes selected files', () => setup(async ({ root, renders, runtime, source }) => {
  assert.deepEqual(await runtime.list({ projectId: 'project' }), { schemaVersion: 1, projectId: 'project', entries: [], scanned: 0, skipped: 0 })
  assert.deepEqual(await readdir(renders), ['source.mp4'])
  const input = withSubtitles(); await runtime.start(input); await finish(runtime, input)
  const restarted = createLessonDeliveryRuntime({ root, probe: () => { throw Error('Library must never render/probe/create') } }), folder = path.join(renders, 'CourseDeliveries', input.requestId)
  const before = await readdir(folder), manifest = await readFile(path.join(folder, 'manifest.json'))
  const page = await restarted.list({ projectId: 'project' })
  assert.equal(page.entries.length, 1); assert.equal(page.entries[0].hasCompletionRecord, true); assert.equal(page.entries[0].hasSubtitles, true)
  assert.equal(page.entries[0].requestVersion, 3); assert.equal(page.entries[0].materialFiles, 3)
  const lookup = { projectId: 'project', requestId: input.requestId }
  assert.equal((await restarted.inspect(lookup)).state, 'ready')
  const subtitle = path.join(folder, 'learner/subtitles.vtt'); await writeFile(subtitle, 'Changed')
  assert.equal((await restarted.list({ projectId: 'project' })).entries[0].hasCompletionRecord, true) // A listing is not a verification.
  assert.equal((await restarted.inspect(lookup)).state, 'integrityFailed')
  assert.deepEqual(await readFile(path.join(folder, 'manifest.json')), manifest); assert.deepEqual(await readdir(folder), before)
  assert.deepEqual(await readFile(source), bytes)
  assert.equal((await restarted.list({ projectId: 'another' })).entries.length, 0)
  await assert.rejects(restarted.inspect({ ...lookup, projectId: 'another' }), /another project/)
}))
test('library paginates by folder ID, skips malformed/unsafe entries and retains interrupted records without writes', () => setup(async ({ root, renders, runtime, temp }) => {
  const parent = path.join(renders, 'CourseDeliveries'); await mkdir(parent)
  const ids = Array.from({ length: 43 }, (_, i) => `00000000-0000-0000-0000-${String(i + 1).padStart(12, '0')}`)
  for (const [index, requestId] of ids.entries()) {
    const folder = path.join(parent, requestId), input = { ...request(), requestId, projectId: index % 2 ? 'other' : 'project' }
    await mkdir(folder); await writeFile(path.join(folder, 'request.json'), JSON.stringify(input))
  }
  await writeFile(path.join(parent, ids[2], 'request.json'), 'malformed')
  await rm(path.join(parent, ids[4]), { recursive: true }); await mkdir(path.join(temp, 'outside')); await symlink(path.join(temp, 'outside'), path.join(parent, ids[4]))
  const first = await runtime.list({ projectId: 'project' })
  assert.equal(first.scanned, 20); assert.equal(first.skipped, 2); assert.equal(first.entries.length, 8); assert.equal(first.nextCursor, ids[19])
  const second = await runtime.list({ projectId: 'project', after: first.nextCursor })
  assert.equal(second.entries.length, 10); assert.equal(second.nextCursor, ids[39])
  const last = await runtime.list({ projectId: 'project', after: second.nextCursor })
  assert.equal(last.entries.length, 2); assert.equal(last.nextCursor, undefined); assert.equal(last.scanned, 3)
  assert.equal((await runtime.inspect({ projectId: 'project', requestId: ids[0] })).state, 'interrupted')
  assert.deepEqual(await readdir(path.join(parent, ids[0])), ['request.json'])
  assert.deepEqual(await readdir(path.join(temp, 'outside')), [])
  await assert.rejects(runtime.list({ projectId: 'project', after: '../escape' }))
  await assert.rejects(runtime.inspect({ projectId: 'project', requestId: '../escape' }))
  const wrongId = { ...request(), requestId: crypto.randomUUID() }; await writeFile(path.join(parent, ids[0], 'request.json'), JSON.stringify(wrongId))
  await assert.rejects(runtime.inspect({ projectId: 'project', requestId: ids[0] }), /another project or ID/)
  assert.equal((await runtime.list({ projectId: 'project' })).skipped, 3)
}))
test('library refuses a linked parent rather than reading another tree', () => setup(async ({ renders, temp, runtime }) => {
  await mkdir(path.join(temp, 'outside')); await symlink(path.join(temp, 'outside'), path.join(renders, 'CourseDeliveries'))
  await assert.rejects(runtime.list({ projectId: 'project' }), /Unsafe/)
}))
