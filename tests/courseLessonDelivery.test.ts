import { it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LessonDeliverySession, forgetLessonDeliveryTicket, parseLessonDeliveryJob, prepareLessonDelivery, readLessonDeliveryTicket, retainLessonDeliveryTicket, type LessonDeliveryJob, type LessonDeliveryTicket, type DeliveryStorage } from '../src/core/courseLessonDelivery'
import { createProject } from '../src/core/project'
import { recordSuccessfulExport } from '../src/core/exportHistory'
import { WorkerClient } from '../src/core/workerClient'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import { CourseLessonDeliveryControl } from '../src/components/CourseLessonDeliveryControl'
import { translateUi } from '../src/core/uiMessages'
import { uiLanguages } from '../src/core/uiLanguage'

function fixture() {
  const project = recordSuccessfulExport(createProject('Delivery'), { jobId: 'job', label: 'Lesson', outputRelativePath: 'KINAOU/Renders/lesson.mp4', format: 'landscape', range: { inMs: 0, outMs: 1000 }, sceneIds: [], durationMs: 1000, completedAt: '2026-09-27T00:00:00.000Z', courseLesson: { courseId: 'course', moduleId: 'module', lessonId: 'lesson', outlineRevision: 1, courseTitle: 'Course', moduleTitle: 'Module', lessonTitle: 'Lesson', language: 'en' } })
  const request = prepareLessonDelivery(project, 'job', true), ticket: LessonDeliveryTicket = { schemaVersion: 1, workerUrl: 'http://127.0.0.1:43948', request }
  const values = new Map<string,string>(), storage: DeliveryStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value) }, removeItem: key => { values.delete(key) } }
  const queued: LessonDeliveryJob = { schemaVersion: 1, request, state: 'queued' }, base = `KINAOU/Renders/CourseDeliveries/${request.requestId}`
  const ready: LessonDeliveryJob = { schemaVersion: 1, request, state: 'ready', result: { directory: base, mediaPath: `${base}/lesson.mp4`, manifestPath: `${base}/manifest.json`, sourcePath: request.export.outputRelativePath, sha256: 'a'.repeat(64), sizeBytes: 100, createdAt: '2026-09-27T00:00:00.000Z', integrityCheckedAt: '2026-09-27T00:01:00.000Z' } }
  let current = true
  const client = { startLessonDelivery: vi.fn(async (_input: typeof request) => queued), lessonDeliveryStatus: vi.fn(async (_input: typeof request) => ready) }, publish = vi.fn()
  const session = new LessonDeliverySession(ticket, { storage, current: () => current, client, publish })
  return { project, request, ticket, values, storage, client, publish, queued, ready, session, invalidate: () => { current = false } }
}
it('retains the exact recovery ticket before one start; only status reads happen during recovery', async () => {
  const f = fixture(), before = JSON.stringify(f.project)
  f.client.startLessonDelivery.mockImplementationOnce(async input => { expect(readLessonDeliveryTicket(f.storage, f.project.id)?.request).toEqual(input); return f.queued })
  expect(f.client.startLessonDelivery).not.toHaveBeenCalled(); await f.session.start(); await f.session.start(); await f.session.check()
  expect(f.client.startLessonDelivery).toHaveBeenCalledTimes(1); expect(f.client.lessonDeliveryStatus).toHaveBeenCalledExactlyOnceWith(f.request)
  expect(f.publish).toHaveBeenLastCalledWith({ phase: 'job', job: f.ready }); expect(JSON.stringify(f.project)).toBe(before)
  expect(readLessonDeliveryTicket(f.storage, f.project.id)).toEqual(f.ticket)
})
it('lost start response is uncertain and reload recovery never resubmits', async () => {
  const f = fixture(); f.client.startLessonDelivery.mockRejectedValueOnce(Error('Lost reply'))
  await f.session.start(); expect(f.publish.mock.calls.at(-1)?.[0].phase).toBe('uncertain')
  const restored = new LessonDeliverySession(readLessonDeliveryTicket(f.storage, f.project.id)!, { storage: f.storage, current: () => true, client: f.client, publish: f.publish })
  await restored.check(); expect(f.client.startLessonDelivery).toHaveBeenCalledTimes(1); expect(f.publish).toHaveBeenLastCalledWith({ phase: 'job', job: f.ready })
  await restored.start(); expect(f.client.startLessonDelivery).toHaveBeenCalledTimes(1)
})
it.each(['quota','readback','existing','corrupt'])('blocks start if durable storage is %s', async kind => {
  const f = fixture()
  if (kind === 'quota') f.storage.setItem = () => { throw Error('Quota') }
  if (kind === 'readback') f.storage.setItem = () => {}
  if (kind === 'existing') retainLessonDeliveryTicket(f.storage, f.ticket)
  if (kind === 'corrupt') f.values.set(`kinaou.course-delivery.pending.v1.${encodeURIComponent(f.project.id)}`, 'not-json')
  await f.session.start(); expect(f.client.startLessonDelivery).not.toHaveBeenCalled(); expect(f.publish.mock.calls.at(-1)?.[0].phase).toBe('failed')
})
it('copies input identity at session creation so external mutation cannot switch its target', async () => {
  const f = fixture(), original = structuredClone(f.request); f.ticket.request.export.label = 'Changed caller object'
  await f.session.start(); expect(f.client.startLessonDelivery.mock.calls[0][0]).toEqual(original)
})
it.each(['detach','context'])('discards late response after %s without removing recovery ticket', async kind => {
  const f = fixture(); let resolve!: (job: LessonDeliveryJob) => void
  f.client.startLessonDelivery.mockImplementationOnce(() => new Promise(done => { resolve = done }))
  const pending = f.session.start(); await f.session.start()
  if (kind === 'detach') f.session.detach(); else f.invalidate()
  resolve(f.queued); await pending
  expect(f.publish.mock.calls.map(call => call[0].phase)).toEqual(['checking']); expect(readLessonDeliveryTicket(f.storage, f.project.id)).toEqual(f.ticket)
})
it('requires exact retained ticket for read/forget and never removes another operation', async () => {
  const f = fixture(); await f.session.start()
  const other = { ...f.ticket, workerUrl: 'http://127.0.0.1:9999' }
  const savedKey = [...f.values.keys()][0]; f.values.set(savedKey, JSON.stringify(other))
  await f.session.check(); expect(f.client.lessonDeliveryStatus).not.toHaveBeenCalled()
  expect(() => forgetLessonDeliveryTicket(f.storage, f.ticket)).toThrow(/changed/)
  expect(readLessonDeliveryTicket(f.storage, f.project.id)).toEqual(other)
  forgetLessonDeliveryTicket(f.storage, other); expect(readLessonDeliveryTicket(f.storage, f.project.id)).toBeNull()
})
it.each(['request','directory','media','source','hash','size','unfinished','progress','failure'])('rejects a mismatched %s response', kind => {
  const f = fixture(), value = structuredClone(f.ready)
  if (kind === 'request') value.request.projectId = 'another'
  if (kind === 'directory') value.result!.directory += '/other'
  if (kind === 'media') value.result!.mediaPath = 'KINAOU/Renders/other.mp4'
  if (kind === 'source') value.result!.sourcePath = 'KINAOU/Renders/other.mp4'
  if (kind === 'hash') value.result!.sha256 = 'fake'
  if (kind === 'size') value.result!.sizeBytes = 0
  if (kind === 'unfinished') value.state = 'copying'
  if (kind === 'progress') { value.state = 'copying'; delete value.result; value.totalBytes = 10; value.copiedBytes = 11 }
  if (kind === 'failure') { value.state = 'failed'; delete value.result }
  expect(() => parseLessonDeliveryJob(value, f.request)).toThrow()
})
it('binds actual WorkerClient start/status routes and validated request without retry', async () => {
  const f = fixture(), calls: string[] = []
  const client = new WorkerClient({ baseUrl: f.ticket.workerUrl, token: 'secret', fetchImpl: async (url, init) => { calls.push(String(url)); expect(JSON.parse(String(init?.body))).toEqual(f.request); return new Response(JSON.stringify({ ok: true, type: 'course-lesson-delivery', job: f.ready })) } })
  expect(await client.startLessonDelivery(f.request)).toEqual(f.ready); expect(await client.lessonDeliveryStatus(f.request)).toEqual(f.ready)
  expect(calls).toEqual([`${f.ticket.workerUrl}/course/delivery/start`, `${f.ticket.workerUrl}/course/delivery/status`])
})
it('preparation requires explicit acknowledgement and an actual retained receipt', () => {
  const f = fixture(); expect(() => prepareLessonDelivery(f.project, 'job', false)).toThrow(/acknowledged/)
  expect(() => prepareLessonDelivery(f.project, 'missing', true)).toThrow(/Select/)
})
it.each(uiLanguages)('renders private-copy boundaries with unchecked acknowledgement in %s', language => {
  const f = fixture(), html = renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: language, children: createElement(CourseLessonDeliveryControl, { project: f.project, jobId: 'job', dirty: false }) }))
  expect(html).toContain(translateUi(language, 'course.delivery.heading')); expect(html).toContain(translateUi(language, 'course.delivery.unavailable'))
  expect(html).not.toContain('checked=""'); expect(html).toContain(`<button disabled="">${translateUi(language, 'course.delivery.start')}</button>`)
})
