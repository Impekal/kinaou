import { it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { DeliveryLibrarySession, parseDeliveryLibraryPage, parseDeliveryLibraryInspection, type DeliveryLibraryPage, type DeliveryLibraryLookup, type DeliveryLibraryQuery } from '../src/core/courseDeliveryLibrary'
import { prepareLessonDelivery, type LessonDeliveryJob } from '../src/core/courseLessonDelivery'
import { recordSuccessfulExport } from '../src/core/exportHistory'
import { createProject } from '../src/core/project'
import { WorkerClient } from '../src/core/workerClient'
import { CourseDeliveryLibraryPanel } from '../src/components/CourseDeliveryLibraryPanel'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import { uiLanguages } from '../src/core/uiLanguage'
import { translateUi } from '../src/core/uiMessages'

function fixture() {
  const project = recordSuccessfulExport(createProject('Library'), { jobId: 'job', label: 'Lesson', outputRelativePath: 'KINAOU/Renders/lesson.mp4', format: 'landscape', range: { inMs: 0, outMs: 1000 }, sceneIds: [], durationMs: 1000, completedAt: '2026-09-27T00:00:00.000Z', courseLesson: { courseId: 'course', moduleId: 'module', lessonId: 'lesson', outlineRevision: 1, courseTitle: 'Course', moduleTitle: 'Module', lessonTitle: 'Lesson', language: 'en' } })
  const request = prepareLessonDelivery(project, 'job', true), lookup = { projectId: project.id, requestId: request.requestId }
  const page: DeliveryLibraryPage = { schemaVersion: 1, projectId: project.id, scanned: 1, skipped: 0, entries: [{ ...lookup, courseLesson: request.export.courseLesson, sourcePath: request.export.outputRelativePath, requestVersion: 1, materialFiles: 0, hasSubtitles: false, hasCompletionRecord: true }] }
  const job: LessonDeliveryJob = { schemaVersion: 1, request, state: 'integrityFailed', error: 'Changed file' }
  const client = { listLessonDeliveries: vi.fn(async (_query: DeliveryLibraryQuery) => page), inspectLessonDelivery: vi.fn(async (_lookup: DeliveryLibraryLookup) => job) }, publish = vi.fn()
  let current = true
  const session = new DeliveryLibrarySession(project.id, { client, publish, current: () => current })
  return { project, request, lookup, page, job, client, publish, session, invalidate: () => { current = false } }
}
it('only explicitly lists/inspects bound historical records, with no project mutation', async () => {
  const f = fixture(), before = JSON.stringify(f.project)
  expect(f.client.listLessonDeliveries).not.toHaveBeenCalled(); expect(f.client.inspectLessonDelivery).not.toHaveBeenCalled()
  await f.session.list(); expect(f.publish).toHaveBeenLastCalledWith({ phase: 'page', page: f.page })
  await f.session.inspect(f.request.requestId); expect(f.publish).toHaveBeenLastCalledWith({ phase: 'job', job: f.job })
  expect(f.client.inspectLessonDelivery).toHaveBeenCalledExactlyOnceWith(f.lookup); expect(JSON.stringify(f.project)).toBe(before)
})
it.each(['detach','context'])('discards late listing after %s and does not resume automatically', async kind => {
  const f = fixture(); let resolve!: (page: DeliveryLibraryPage) => void
  f.client.listLessonDeliveries.mockImplementationOnce(() => new Promise(done => { resolve = done }))
  const pending = f.session.list(); await f.session.list()
  if (kind === 'detach') f.session.detach(); else f.invalidate()
  resolve(f.page); await pending; await f.session.inspect(f.request.requestId)
  expect(f.client.listLessonDeliveries).toHaveBeenCalledTimes(1); expect(f.client.inspectLessonDelivery).not.toHaveBeenCalled()
  expect(f.publish.mock.calls.map(call => call[0].phase)).toEqual(['listing'])
})
it('discards late inspection after selection/project detachment', async () => {
  const f = fixture(); let resolve!: (job: LessonDeliveryJob) => void
  f.client.inspectLessonDelivery.mockImplementationOnce(() => new Promise(done => { resolve = done }))
  const pending = f.session.inspect(f.request.requestId); f.session.detach(); resolve(f.job); await pending
  expect(f.publish.mock.calls.map(call => call[0].phase)).toEqual(['checking'])
})
it('allows explicit retry after read failure without creation or automatic retry', async () => {
  const f = fixture(); f.client.listLessonDeliveries.mockRejectedValueOnce(Error('Offline'))
  await f.session.list(); expect(f.publish.mock.calls.at(-1)![0].phase).toBe('failed'); expect(f.client.listLessonDeliveries).toHaveBeenCalledTimes(1)
  await f.session.list(); expect(f.publish.mock.calls.at(-1)![0].phase).toBe('page')
})
it.each(['project','entryProject','cursor','count','duplicate','version','subtitles'])('rejects malformed/mismatched library %s', kind => {
  const f = fixture(), page = structuredClone(f.page)
  if (kind === 'project') page.projectId = 'other'
  if (kind === 'entryProject') page.entries[0].projectId = 'other'
  if (kind === 'cursor') page.nextCursor = f.request.requestId
  if (kind === 'count') page.scanned = 0
  if (kind === 'duplicate') { page.entries.push(page.entries[0]); page.scanned = 2 }
  if (kind === 'version') page.entries[0].requestVersion = 2
  if (kind === 'subtitles') page.entries[0].hasSubtitles = true
  expect(() => parseDeliveryLibraryPage(page, { projectId: f.project.id })).toThrow()
})
it('validates pagination including empty pages for other projects', () => {
  const f = fixture(), after = '00000000-0000-0000-0000-000000000001', nextCursor = '00000000-0000-0000-0000-000000000020'
  const page = { schemaVersion: 1, projectId: f.project.id, after, nextCursor, entries: [], scanned: 20, skipped: 1 }
  expect(parseDeliveryLibraryPage(page, { projectId: f.project.id, after }).nextCursor).toBe(nextCursor)
  expect(() => parseDeliveryLibraryPage(page, { projectId: f.project.id })).toThrow()
  expect(() => parseDeliveryLibraryPage({ ...page, nextCursor: after }, { projectId: f.project.id, after })).toThrow()
})
it('inspection requires exact project/ID and validates the actual complete job envelope', () => {
  const f = fixture(); expect(parseDeliveryLibraryInspection(f.job, f.lookup)).toEqual(f.job)
  expect(() => parseDeliveryLibraryInspection(f.job, { ...f.lookup, projectId: 'other' })).toThrow()
  expect(() => parseDeliveryLibraryInspection(f.job, { ...f.lookup, requestId: crypto.randomUUID() })).toThrow()
  expect(() => parseDeliveryLibraryInspection({ ...f.job, state: 'ready' }, f.lookup)).toThrow()
})
it('WorkerClient uses authenticated list/inspect endpoints only, never a start route', async () => {
  const f = fixture(), calls: string[] = []
  const client = new WorkerClient({ baseUrl: 'http://127.0.0.1:43948', token: 'test-only', fetchImpl: async (url, init) => {
    calls.push(String(url)); expect(new Headers(init?.headers).get('authorization')).toBe('Bearer test-only')
    if (String(url).endsWith('/list')) { expect(JSON.parse(String(init?.body))).toEqual({ projectId: f.project.id }); return new Response(JSON.stringify({ ok: true, type: 'course-delivery-library', page: f.page })) }
    expect(JSON.parse(String(init?.body))).toEqual(f.lookup); return new Response(JSON.stringify({ ok: true, type: 'course-delivery-inspection', job: f.job }))
  } })
  expect(await client.listLessonDeliveries({ projectId: f.project.id })).toEqual(f.page); expect(await client.inspectLessonDelivery(f.lookup)).toEqual(f.job)
  expect(calls).toEqual(['http://127.0.0.1:43948/course/delivery/list','http://127.0.0.1:43948/course/delivery/inspect'])
})
it.each(uiLanguages)('renders %s library as explicit read-only discovery, not automatic verification', language => {
  const f = fixture(), html = renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: language, children: createElement(CourseDeliveryLibraryPanel, { project: f.project, dirty: false }) }))
  expect(html).toContain(translateUi(language, 'course.library.heading')); expect(html).toContain(translateUi(language, 'course.library.unavailable'))
  expect(html).toContain(`<button disabled="">${translateUi(language, 'course.library.load')}</button>`)
})
