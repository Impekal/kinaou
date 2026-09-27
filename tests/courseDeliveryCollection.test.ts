import { it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createHash } from 'node:crypto'
import { createProject } from '../src/core/project'
import { newCourseOutline, saveCourseOutline } from '../src/core/course'
import { recordSuccessfulExport } from '../src/core/exportHistory'
import { prepareLessonDelivery, type LessonDeliveryJob } from '../src/core/courseLessonDelivery'
import { CollectionSession, reviewCourseCollection, useCollectionReview, readCollectionTicket, retainCollectionTicket, forgetCollectionTicket, type CollectionTicket, type CourseCollectionJob } from '../src/core/courseDeliveryCollection'
import { collectionSourceText, validateCourseCollectionJob } from '../worker/course-collection-protocol.mjs'
import { WorkerClient } from '../src/core/workerClient'
import { CourseDeliveryWorkspace } from '../src/components/CourseDeliveryWorkspace'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import { translateUi } from '../src/core/uiMessages'
import { uiLanguages } from '../src/core/uiLanguage'
function fixture() {
  let project = createProject('Collection')
  const course = { ...newCourseOutline(project), id: 'course', language: 'en' as const, modules: [{ id: 'module', title: 'Module', lessons: ['one','two','three'].map(id => ({ id, title: `Current ${id}`, objective: '', range: { inMs: 0, outMs: 1000 } })) }] }
  project = saveCourseOutline(project, course)
  const jobs: LessonDeliveryJob[] = []
  for (const id of ['two','one']) {
    project = recordSuccessfulExport(project, { jobId: id, label: id, outputRelativePath: `KINAOU/Renders/${id}.mp4`, format: 'landscape', range: { inMs: 0, outMs: 1000 }, durationMs: 1000, sceneIds: [], completedAt: '2026-09-27T00:00:00.000Z', courseLesson: { courseId: course.id, moduleId: 'module', lessonId: id, outlineRevision: 1, courseTitle: 'Historical course', moduleTitle: 'Old module', lessonTitle: `Historical ${id}`, language: 'en' } })
    const request = prepareLessonDelivery(project, id, true), directory = `KINAOU/Renders/CourseDeliveries/${request.requestId}`
    jobs.push({ schemaVersion: 1, request, state: 'ready', result: { directory, manifestPath: `${directory}/manifest.json`, mediaPath: `${directory}/lesson.mp4`, sourcePath: request.export.outputRelativePath, sizeBytes: 100, sha256: 'a'.repeat(64), createdAt: '2026-09-27T00:00:00.000Z', integrityCheckedAt: '2026-09-27T00:00:00.000Z' } })
  }
  const data = new Map<string,string>(), storage = { getItem: vi.fn((key: string) => data.get(key) ?? null), setItem: vi.fn((key: string, value: string) => { data.set(key, value) }), removeItem: vi.fn((key: string) => { data.delete(key) }) }
  return { project, jobs, storage, data }
}
async function sessionFixture() {
  const f = fixture(), review = await reviewCourseCollection(f.project, f.jobs), request = useCollectionReview(review, f.project, f.jobs, true)
  const ticket: CollectionTicket = { schemaVersion: 1, workerUrl: 'http://127.0.0.1:43948', request }, job: CourseCollectionJob = { schemaVersion: 1, request, state: 'queued' }
  let current = true
  const client = { startCourseCollection: vi.fn(async () => job), courseCollectionStatus: vi.fn(async () => job) }, publish = vi.fn()
  const session = new CollectionSession(ticket, { storage: f.storage, client, publish, current: () => current })
  return { ...f, review, request, ticket, job, client, publish, session, invalidate: () => { current = false } }
}
it('reviews an ordered subset without mutations; browser fingerprint matches canonical worker hash', async () => {
  const f = fixture(), before = JSON.stringify([f.project, f.jobs]), review = await reviewCourseCollection(f.project, f.jobs)
  expect(review.lessons.map(item => item.lessonId)).toEqual(['one','two']); expect(review.course.lessonCount).toBe(3); expect(review.totalMediaBytes).toBe(200)
  expect(review.historical[0].title).toBe('Historical one')
  expect(review.lessons[0].sourceFingerprint).toBe(createHash('sha256').update(collectionSourceText(f.jobs[1])).digest('hex'))
  const refreshed = structuredClone(f.jobs[1]); refreshed.result!.integrityCheckedAt = '2026-09-27T01:00:00.000Z'
  expect(collectionSourceText(refreshed)).toBe(collectionSourceText(f.jobs[1])); expect(JSON.stringify([f.project, f.jobs])).toBe(before)
})
it.each(['state','project','course','language','range','duplicate','count','bytes'])('refuses unusable selection: %s', async kind => {
  const f = fixture()
  if (kind === 'state') { f.jobs[0].state = 'unknown'; delete f.jobs[0].result }
  if (kind === 'project') f.jobs[0].request.projectId = 'other'
  if (kind === 'course') f.jobs[0].request.export.courseLesson.courseId = 'other'
  if (kind === 'language') f.jobs[0].request.export.courseLesson.language = 'fr'
  if (kind === 'range') f.jobs[0].request.export.range.outMs = 2000
  if (kind === 'duplicate') f.jobs[1] = f.jobs[0]
  if (kind === 'count') f.jobs.push(...Array.from({ length: 20 }, () => f.jobs[0]))
  if (kind === 'bytes') f.jobs[0].result!.sizeBytes = 9 * 1024 ** 3
  await expect(reviewCourseCollection(f.project, f.jobs)).rejects.toThrow()
})
it.each(['ack','project','jobs','review'])('invalidates start when reviewed %s changes', async kind => {
  const f = fixture(), review = await reviewCourseCollection(f.project, f.jobs)
  if (kind === 'project') f.project.title = 'Changed'
  if (kind === 'jobs') f.jobs.reverse()
  if (kind === 'review') review.course.title = 'Changed'
  expect(() => useCollectionReview(review, f.project, f.jobs, kind !== 'ack')).toThrow()
})
it('stores and reads back durable reminder before exactly one submission, never stores credentials', async () => {
  const f = await sessionFixture()
  f.client.startCourseCollection.mockImplementation(async () => { expect(readCollectionTicket(f.storage, f.project.id)).toEqual(f.ticket); return f.job })
  await f.session.start(); await f.session.start(); expect(f.client.startCourseCollection).toHaveBeenCalledTimes(1)
  expect([...f.data.values()][0]).not.toContain('token'); expect(f.publish).toHaveBeenLastCalledWith({ phase: 'job', job: f.job })
  expect(() => retainCollectionTicket(f.storage, f.ticket)).toThrow()
  forgetCollectionTicket(f.storage, f.ticket); expect(readCollectionTicket(f.storage, f.project.id)).toBeNull()
})
it.each(['throw','readback'])('does not submit when reminder persistence %s fails', async kind => {
  const f = await sessionFixture()
  f.storage.setItem.mockImplementation(() => { if (kind === 'throw') throw Error('Quota') })
  await f.session.start(); expect(f.client.startCourseCollection).not.toHaveBeenCalled(); expect(f.publish.mock.calls.at(-1)![0].phase).toBe('failed')
})
it('lost start reply retains reminder; reloaded session checks only, without redispatch', async () => {
  const f = await sessionFixture(); f.client.startCourseCollection.mockRejectedValueOnce(Error('Lost reply'))
  await f.session.start(); expect(f.publish.mock.calls.at(-1)![0].phase).toBe('uncertain')
  const recovered = new CollectionSession(readCollectionTicket(f.storage, f.project.id)!, { storage: f.storage, client: f.client, current: () => true, publish: f.publish })
  await recovered.check(); expect(f.client.startCourseCollection).toHaveBeenCalledTimes(1); expect(f.client.courseCollectionStatus).toHaveBeenCalledTimes(1)
  expect(f.publish).toHaveBeenLastCalledWith({ phase: 'job', job: f.job })
})
it.each(['detach','context'])('discards a delayed reply after %s and keeps the durable ticket', async kind => {
  const f = await sessionFixture(); let resolve!: (value: CourseCollectionJob) => void
  f.client.startCourseCollection.mockImplementation(() => new Promise(done => { resolve = done }))
  const pending = f.session.start(); if (kind === 'detach') f.session.detach(); else f.invalidate()
  resolve(f.job); await pending; await f.session.check()
  expect(f.publish.mock.calls.map(call => call[0].phase)).toEqual(['checking']); expect(readCollectionTicket(f.storage, f.project.id)).toEqual(f.ticket)
  expect(f.client.courseCollectionStatus).not.toHaveBeenCalled()
})
it('rejects cross-operation replies and altered reminder without deleting or resubmitting', async () => {
  const f = await sessionFixture(); f.client.startCourseCollection.mockResolvedValueOnce({ ...f.job, request: { ...f.request, requestId: crypto.randomUUID() } })
  await f.session.start(); expect(f.publish.mock.calls.at(-1)![0].phase).toBe('uncertain')
  const key = [...f.data.keys()][0]; f.data.set(key, JSON.stringify({ ...f.ticket, request: { ...f.request, projectId: 'other' } }))
  await f.session.check(); expect(f.client.courseCollectionStatus).not.toHaveBeenCalled(); expect(() => forgetCollectionTicket(f.storage, f.ticket)).toThrow()
})
it('WorkerClient authenticates collection endpoints, enforces exact envelope and validates results', async () => {
  const f = await sessionFixture(), calls: string[] = []
  const client = new WorkerClient({ baseUrl: f.ticket.workerUrl, token: 'test-only', fetchImpl: async (url, init) => { calls.push(String(url)); expect(new Headers(init?.headers).get('authorization')).toBe('Bearer test-only'); expect(JSON.parse(String(init?.body))).toEqual(f.request); return new Response(JSON.stringify({ ok: true, type: 'course-collection', job: f.job })) } })
  expect(await client.startCourseCollection(f.request)).toEqual(f.job); expect(await client.courseCollectionStatus(f.request)).toEqual(f.job)
  expect(calls.map(url => url.split('/').at(-1))).toEqual(['start','status'])
  expect(() => validateCourseCollectionJob({ ...f.job, state: 'ready' }, f.request)).toThrow()
})
it.each(uiLanguages)('renders private collection boundaries in %s with disabled disconnected controls', language => {
  const f = fixture(), html = renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: language, children: createElement(CourseDeliveryWorkspace, { project: f.project, dirty: false }) }))
  expect(html).toContain(translateUi(language, 'course.collection.heading')); expect(html).toContain(translateUi(language, 'course.collection.unavailable'))
  expect(html).toContain(`<button disabled="">${translateUi(language, 'course.collection.review')}</button>`)
})
