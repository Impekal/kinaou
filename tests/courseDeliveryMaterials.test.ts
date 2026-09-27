import { it, expect, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { addCaption } from '../src/core/captions'
import { inspectDeliverySubtitles } from '../worker/course-delivery-subtitles.mjs'
import { createProject } from '../src/core/project'
import { newCourseOutline, projectCourse, saveCourseOutline } from '../src/core/course'
import { recordSuccessfulExport } from '../src/core/exportHistory'
import { reviewCourseDeliveryMaterials, useReviewedCourseDeliveryMaterials } from '../src/core/courseDeliveryMaterials'
import { lessonDeliveryMaterialsSchema } from '../src/core/courseDeliveryMaterialSchema'
import { LessonDeliverySession, lessonDeliveryRequestSchema, parseLessonDeliveryJob, prepareLessonDelivery, readLessonDeliveryTicket, type DeliveryStorage, type LessonDeliveryJob } from '../src/core/courseLessonDelivery'

function fixture() {
  const original = createProject('Materials'), outline = newCourseOutline(original)
  outline.language = 'fr'
  outline.modules = [{ id: 'module', title: 'Module', lessons: [{ id: 'lesson', title: 'Lesson', objective: '', range: { inMs: 0, outMs: 1000 },
    script: '\ufeff  Bonjour 🌍\r\nPRIVATE_SCRIPT  ',
    materials: [{ id: 'handout', title: 'Handout', audience: 'learner', body: 'Überblick\nBonjour' }, { id: 'private', title: 'Notes', audience: 'instructor', body: 'PRIVATE_NOTE' }],
    exercises: [{ id: 'exercise', title: 'Practice', prompt: 'Question?', hint: 'Hint', solution: 'PRIVATE_ANSWER', criteria: 'PRIVATE_RUBRIC' }]
  }] }]
  const saved = saveCourseOutline(original, outline)
  return recordSuccessfulExport(saved, { jobId: 'job', label: 'Lesson', outputRelativePath: 'KINAOU/Renders/lesson.mp4', format: 'landscape', range: { inMs: 0, outMs: 1000 }, sceneIds: [], durationMs: 1000, completedAt: '2026-09-27T00:00:00.000Z', courseLesson: { courseId: outline.id, moduleId: 'module', lessonId: 'lesson', courseTitle: outline.title, moduleTitle: 'Module', lessonTitle: 'Lesson', outlineRevision: 1, language: 'fr' } })
}
it('previews exact saved UTF-8, separates learner/instructor text, hashes every byte and never changes the project', async () => {
  const project = fixture(), before = JSON.stringify(project), fetch = vi.spyOn(globalThis, 'fetch')
  try {
    const review = await reviewCourseDeliveryMaterials(project, 'job')
    expect(review.files).toHaveLength(6)
    const learner = review.files.filter(file => file.path.startsWith('learner/')).map(file => file.text).join('\n')
    expect(learner).toContain('Question?'); expect(learner).toContain('Überblick\nBonjour'); expect(learner).not.toContain('PRIVATE_')
    expect(review.files.find(file => file.path === 'instructor/script.txt')!.text).toBe('\ufeff  Bonjour 🌍\r\nPRIVATE_SCRIPT  ')
    expect(review.files.find(file => file.path === 'instructor/answer-key.txt')!.text).toContain('PRIVATE_RUBRIC')
    expect(JSON.parse(review.files[0].text)).toMatchObject({ draft: true, expertApproval: false })
    for (const file of review.files) { expect(file.sha256).toBe(createHash('sha256').update(file.text).digest('hex')); expect(Object.isFrozen(file)).toBe(true) }
    expect(review.bytes).toBe(review.files.reduce((sum, file) => sum + Buffer.byteLength(file.text), 0))
    expect(JSON.stringify(project)).toBe(before); expect(fetch).not.toHaveBeenCalled()
  } finally { fetch.mockRestore() }
})
it('requires explicit review, rejects fabricated or stale reviews and binds the exact receipt', async () => {
  const project = fixture(), review = await reviewCourseDeliveryMaterials(project, 'job'), request = prepareLessonDelivery(project, 'job', true)
  expect(() => useReviewedCourseDeliveryMaterials(project, review, request, false)).toThrow()
  expect(() => useReviewedCourseDeliveryMaterials(project, structuredClone(review), request, true)).toThrow()
  expect(() => useReviewedCourseDeliveryMaterials({ ...project, title: 'Changed' }, review, request, true)).toThrow()
  expect(() => useReviewedCourseDeliveryMaterials(project, review, { ...request, export: { ...request.export, label: 'Changed' } }, true)).toThrow()
  const prepared = useReviewedCourseDeliveryMaterials(project, review, request, true)
  expect(prepared.schemaVersion).toBe(2); expect(prepared.materials!.files).toEqual(review.files)
})
it('allows a freshly reviewed text revision after rendering while preserving historical video revision', async () => {
  let project = fixture(); const course = projectCourse(project)!; course.modules[0].lessons[0].script = 'New reviewed text'; project = saveCourseOutline(project, course)
  const review = await reviewCourseDeliveryMaterials(project, 'job'), request = useReviewedCourseDeliveryMaterials(project, review, prepareLessonDelivery(project, 'job', true), true)
  expect(review.exportRevision).toBe(1); expect(review.source.context.outlineRevision).toBe(2)
  expect(request.export.courseLesson.outlineRevision).toBe(1); expect(request.materials!.source.context.outlineRevision).toBe(2)
})
it.each(['language','range','removed','emptyMaterial','incompleteExercise'])('blocks %s instead of silently omitting text or binding another lesson', async kind => {
  const project = fixture(), course = projectCourse(project)!, lesson = course.modules[0].lessons[0]
  if (kind === 'language') course.language = 'de'
  if (kind === 'range') lesson.range.outMs++
  if (kind === 'removed') course.modules[0].lessons = []
  if (kind === 'emptyMaterial') lesson.materials![0].body = '  '
  if (kind === 'incompleteExercise') lesson.exercises![0].solution = ''
  await expect(reviewCourseDeliveryMaterials(saveCourseOutline(project, course), 'job')).rejects.toThrow()
})
it.each(['path','duplicate','count','size','unicode','control','ack'])('rejects invalid material packet %s', async kind => {
  const project = fixture(), review = await reviewCourseDeliveryMaterials(project, 'job'), packet = structuredClone(useReviewedCourseDeliveryMaterials(project, review, prepareLessonDelivery(project, 'job', true), true).materials!)
  if (kind === 'path') packet.files[0].path = 'learner/answer-key.txt'
  if (kind === 'duplicate') packet.files.push({ ...packet.files[1] })
  if (kind === 'count') packet.files = Array.from({ length: 15 }, (_, i) => ({ ...packet.files[1], path: `learner/material-${i}.txt` }))
  if (kind === 'size') packet.files = [{ ...packet.files[1], text: 'é'.repeat(262145) }]
  if (kind === 'unicode') packet.files[1].text = '\ud800'
  if (kind === 'control') packet.files[1].text = 'bad\0text'
  if (kind === 'ack') Object.assign(packet, { acknowledgeTextVideoMatch: false })
  expect(() => lessonDeliveryMaterialsSchema.parse(packet)).toThrow()
})
it('keeps version 1 compatible, requires version 2 materials, and checks matching language/range', async () => {
  const project = fixture(), base = prepareLessonDelivery(project, 'job', true), review = await reviewCourseDeliveryMaterials(project, 'job'), request = useReviewedCourseDeliveryMaterials(project, review, base, true)
  expect(lessonDeliveryRequestSchema.parse(base).schemaVersion).toBe(1)
  expect(() => lessonDeliveryRequestSchema.parse({ ...base, schemaVersion: 2 })).toThrow()
  expect(() => lessonDeliveryRequestSchema.parse({ ...request, schemaVersion: 1 })).toThrow()
  for (const kind of ['language','range']) {
    const changed = structuredClone(request)
    if (kind === 'language') changed.materials!.source.context.language = 'de'; else changed.materials!.source.range.outMs++
    expect(() => lessonDeliveryRequestSchema.parse(changed)).toThrow()
  }
})
it.each(['missing','path','hash','size','duplicate'])('rejects completed material response with %s mismatch', async kind => {
  const project = fixture(), review = await reviewCourseDeliveryMaterials(project, 'job'), request = useReviewedCourseDeliveryMaterials(project, review, prepareLessonDelivery(project, 'job', true), true), base = `KINAOU/Renders/CourseDeliveries/${request.requestId}`
  const result = { directory: base, mediaPath: `${base}/lesson.mp4`, manifestPath: `${base}/manifest.json`, sourcePath: request.export.outputRelativePath, sizeBytes: 10, sha256: 'a'.repeat(64), createdAt: '2026-09-27T00:00:00.000Z', integrityCheckedAt: '2026-09-27T00:00:00.000Z', files: review.files.map(file => ({ path: `${base}/${file.path}`, sha256: file.sha256, sizeBytes: Buffer.byteLength(file.text) })) }
  expect(parseLessonDeliveryJob({ schemaVersion: 1, request, state: 'ready', result }, request).state).toBe('ready')
  if (kind === 'missing') result.files.pop()
  if (kind === 'path') result.files[0].path = `${base}/other.txt`
  if (kind === 'hash') result.files[0].sha256 = 'b'.repeat(64)
  if (kind === 'size') result.files[0].sizeBytes++
  if (kind === 'duplicate') result.files[0] = result.files[1]
  expect(() => parseLessonDeliveryJob({ schemaVersion: 1, request, state: 'ready', result }, request)).toThrow()
})
it('retains a large v2 packet before start and restores it without another copy after a lost reply', async () => {
  const project = fixture(), course = projectCourse(project)!; course.modules[0].lessons[0].materials = Array.from({ length: 6 }, (_, i) => ({ id: `m-${i}`, title: 'Material', audience: 'learner' as const, body: 'x'.repeat(18000) }))
  const saved = saveCourseOutline(project, course), review = await reviewCourseDeliveryMaterials(saved, 'job'), request = useReviewedCourseDeliveryMaterials(saved, review, prepareLessonDelivery(saved, 'job', true), true), ticket = { schemaVersion: 1 as const, workerUrl: 'http://127.0.0.1:43948', request }
  const values = new Map<string,string>(), storage: DeliveryStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value) }, removeItem: key => { values.delete(key) } }
  const client = { startLessonDelivery: vi.fn(async (): Promise<LessonDeliveryJob> => { expect(readLessonDeliveryTicket(storage, saved.id)).toEqual(ticket); throw Error('Lost reply') }), lessonDeliveryStatus: vi.fn(async (): Promise<LessonDeliveryJob> => ({ schemaVersion: 1, request, state: 'unknown' })) }, publish = vi.fn()
  await new LessonDeliverySession(ticket, { storage, client, publish, current: () => true }).start()
  expect([...values.values()][0].length).toBeGreaterThan(65536)
  const recovered = new LessonDeliverySession(readLessonDeliveryTicket(storage, saved.id)!, { storage, client, publish, current: () => true }); await recovered.check(); await recovered.start()
  expect(client.startLessonDelivery).toHaveBeenCalledTimes(1); expect(client.lessonDeliveryStatus).toHaveBeenCalledTimes(1)
})

function captionFixture() {
  const project = fixture()
  project.tracks.push({ id: 'delivery-captions', type: 'caption', name: 'Captions', muted: false, locked: false, clips: [] })
  return addCaption(addCaption(project, { text: 'Bonjour <b>🌍</b> & A --> B', startMs: 100, durationMs: 300 }), { text: 'Fin\nÜberblick', startMs: 800, durationMs: 400 })
}
it('adds reviewed lesson-relative escaped subtitles only on explicit opt-in and retains clipping disclosure', async () => {
  const project = captionFixture(), before = JSON.stringify(project)
  const plain = await reviewCourseDeliveryMaterials(project, 'job'); expect(plain.subtitles).toBeUndefined(); expect(plain.files.some(file => file.path.endsWith('.vtt'))).toBe(false)
  const review = await reviewCourseDeliveryMaterials(project, 'job', { includeSubtitles: true }), request = useReviewedCourseDeliveryMaterials(project, review, prepareLessonDelivery(project, 'job', true), true)
  expect(review.subtitles).toEqual({ cueCount: 2, clippedCues: 1 }); expect(request.schemaVersion).toBe(3)
  const text = review.files.find(file => file.path === 'learner/subtitles.vtt')!.text
  expect(text).toBe('WEBVTT\n\n1\n00:00:00.100 --> 00:00:00.400\nBonjour &lt;b&gt;🌍&lt;/b&gt; &amp; A --&gt; B\n\n2\n00:00:00.800 --> 00:00:01.000\nFin\nÜberblick\n')
  expect(inspectDeliverySubtitles(text, 1000)).toEqual({ cueCount: 2 }); expect(JSON.stringify(project)).toBe(before)
  expect(() => useReviewedCourseDeliveryMaterials({ ...project, title: 'Edited' }, review, request, true)).toThrow()
  expect(() => lessonDeliveryRequestSchema.parse({ ...request, schemaVersion: 2 })).toThrow()
})
it.each(['missing','muted','overlap','invalidText'])('does not silently omit selected subtitles when %s', async kind => {
  let project = captionFixture()
  const track = project.tracks.find(track => track.id === 'delivery-captions')!
  if (kind === 'missing') track.clips = []
  if (kind === 'muted') track.muted = true
  if (kind === 'overlap') project = addCaption(project, { text: 'Overlap', startMs: 150, durationMs: 200 })
  if (kind === 'invalidText') project.assets.find(asset => asset.kind === 'caption')!.metadata.text = 'A\n\nB'
  await expect(reviewCourseDeliveryMaterials(project, 'job', { includeSubtitles: true })).rejects.toThrow()
  expect((await reviewCourseDeliveryMaterials(project, 'job')).subtitles).toBeUndefined()
})
it.each(['file','metadata','count','clipping','version','text','duration'])('rejects subtitle packet %s inconsistencies', async kind => {
  const project = captionFixture(), review = await reviewCourseDeliveryMaterials(project, 'job', { includeSubtitles: true }), request = useReviewedCourseDeliveryMaterials(project, review, prepareLessonDelivery(project, 'job', true), true)
  if (kind === 'file') request.materials!.files = request.materials!.files.filter(file => !file.path.endsWith('.vtt'))
  if (kind === 'metadata') delete request.materials!.subtitles
  if (kind === 'count') request.materials!.subtitles!.cueCount++
  if (kind === 'clipping') request.materials!.subtitles!.clippedCues = 3
  if (kind === 'version') request.schemaVersion = 2
  if (kind === 'text') request.materials!.files.find(file => file.path.endsWith('.vtt'))!.text = 'not WebVTT'
  if (kind === 'duration') request.materials!.files.find(file => file.path.endsWith('.vtt'))!.text = 'WEBVTT\n\n1\n00:00:00.000 --> 00:00:02.000\nToo late\n'
  expect(() => lessonDeliveryRequestSchema.parse(request)).toThrow()
})
