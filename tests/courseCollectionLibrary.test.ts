import { it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createProject } from '../src/core/project'
import { CollectionLibrarySession, type CollectionLibraryQuery, type CollectionLibraryLookup, type CollectionLibraryPage } from '../src/core/courseCollectionLibrary'
import { validateCollectionLibraryPage, validateCollectionLibraryInspection } from '../worker/course-collection-library-protocol.mjs'
import type { CourseCollectionRequest, CourseCollectionJob } from '../src/core/courseDeliveryCollection'
import { WorkerClient } from '../src/core/workerClient'
import { CourseCollectionLibraryPanel } from '../src/components/CourseCollectionLibraryPanel'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import { uiLanguages } from '../src/core/uiLanguage'
import { translateUi } from '../src/core/uiMessages'
function fixture() {
  const project = createProject('Collections'), request: CourseCollectionRequest = { schemaVersion: 1, requestId: crypto.randomUUID(), projectId: project.id, acknowledgePrivateMetadata: true,
    course: { courseId: 'course', title: 'Historical course', language: 'fr', outlineRevision: 2, lessonCount: 3 }, lessons: [{ sourceRequestId: crypto.randomUUID(), sourceFingerprint: 'a'.repeat(64), moduleId: 'module', lessonId: 'lesson', moduleTitle: 'Module', lessonTitle: 'Lesson', range: { inMs: 0, outMs: 1000 } }] }
  const lookup = { projectId: project.id, requestId: request.requestId }, query = { projectId: project.id }
  const page: CollectionLibraryPage = { schemaVersion: 1, ...query, scanned: 1, skipped: 0, entries: [{ ...lookup, course: request.course, selectedLessons: 1, hasCompletionRecord: true }] }
  const job: CourseCollectionJob = { schemaVersion: 1, request, state: 'integrityFailed', error: 'Changed copy' }
  const client = { listCourseCollections: vi.fn(async (_query: CollectionLibraryQuery) => page), inspectCourseCollection: vi.fn(async (_lookup: CollectionLibraryLookup) => job) }, publish = vi.fn()
  let current = true
  const session = new CollectionLibrarySession(project.id, { current: () => current, client, publish })
  return { project, request, lookup, query, page, job, client, publish, session, invalidate: () => { current = false } }
}
it('explicit reads only; discovery does not inspect and inspection never changes project data', async () => {
  const f = fixture(), before = JSON.stringify(f.project)
  expect(f.client.listCourseCollections).not.toHaveBeenCalled(); expect(f.client.inspectCourseCollection).not.toHaveBeenCalled()
  await f.session.list(); expect(f.publish).toHaveBeenLastCalledWith({ phase: 'page', page: f.page }); expect(f.client.inspectCourseCollection).not.toHaveBeenCalled()
  await f.session.inspect(f.request.requestId); expect(f.publish).toHaveBeenLastCalledWith({ phase: 'job', job: f.job }); expect(JSON.stringify(f.project)).toBe(before)
})
it.each(['detach','context'])('discards delayed page after %s, never automatically resumes', async kind => {
  const f = fixture(); let resolve!: (page: CollectionLibraryPage) => void
  f.client.listCourseCollections.mockImplementationOnce(() => new Promise(done => { resolve = done }))
  const pending = f.session.list(); await f.session.list()
  if (kind === 'detach') f.session.detach(); else f.invalidate()
  resolve(f.page); await pending; await f.session.inspect(f.request.requestId)
  expect(f.client.listCourseCollections).toHaveBeenCalledTimes(1); expect(f.client.inspectCourseCollection).not.toHaveBeenCalled(); expect(f.publish.mock.calls.map(call => call[0].phase)).toEqual(['listing'])
})
it('discards delayed inspection after selection change', async () => {
  const f = fixture(); let resolve!: (job: CourseCollectionJob) => void
  f.client.inspectCourseCollection.mockImplementationOnce(() => new Promise(done => { resolve = done }))
  const pending = f.session.inspect(f.request.requestId); f.session.detach(); resolve(f.job); await pending
  expect(f.publish.mock.calls.map(call => call[0].phase)).toEqual(['checking'])
})
it('failure permits explicit read retry, never an automatic request', async () => {
  const f = fixture(); f.client.listCourseCollections.mockRejectedValueOnce(Error('Offline'))
  await f.session.list(); expect(f.publish.mock.calls.at(-1)![0].phase).toBe('failed'); expect(f.client.listCourseCollections).toHaveBeenCalledTimes(1)
  await f.session.list(); expect(f.publish.mock.calls.at(-1)![0].phase).toBe('page')
})
it.each(['project','entryProject','cursor','counts','duplicate','subset','language','record'])('rejects malformed library %s', kind => {
  const f = fixture(), page = structuredClone(f.page)
  if (kind === 'project') page.projectId = 'other'
  if (kind === 'entryProject') page.entries[0].projectId = 'other'
  if (kind === 'cursor') page.nextCursor = f.request.requestId
  if (kind === 'counts') page.skipped = 1
  if (kind === 'duplicate') { page.entries.push(page.entries[0]); page.scanned = 2 }
  if (kind === 'subset') page.entries[0].selectedLessons = 4
  if (kind === 'language') Object.assign(page.entries[0].course, { language: 'xx' })
  if (kind === 'record') Object.assign(page.entries[0], { hasCompletionRecord: 'yes' })
  expect(() => validateCollectionLibraryPage(page, f.query)).toThrow()
})
it('validates empty inter-project pages and exact pagination scope', () => {
  const f = fixture(), after = '00000000-0000-0000-0000-000000000020', nextCursor = '00000000-0000-0000-0000-000000000040'
  const page = { schemaVersion: 1, ...f.query, after, nextCursor, entries: [], scanned: 20, skipped: 0 }
  expect(validateCollectionLibraryPage(page, { ...f.query, after })).toEqual(page)
  expect(() => validateCollectionLibraryPage(page, f.query)).toThrow(); expect(() => validateCollectionLibraryPage({ ...page, nextCursor: after }, { ...f.query, after })).toThrow()
})
it('inspection binds project and ID, validates full ready envelope rather than trusting listing record', () => {
  const f = fixture(); expect(validateCollectionLibraryInspection(f.job, f.lookup)).toEqual(f.job)
  expect(() => validateCollectionLibraryInspection(f.job, { ...f.lookup, projectId: 'other' })).toThrow()
  expect(() => validateCollectionLibraryInspection(f.job, { ...f.lookup, requestId: crypto.randomUUID() })).toThrow()
  expect(() => validateCollectionLibraryInspection({ ...f.job, state: 'ready', error: undefined }, f.lookup)).toThrow()
})
it('WorkerClient sends authenticated read-only routes with exact query/lookup', async () => {
  const f = fixture(), calls: string[] = []
  const client = new WorkerClient({ baseUrl: 'http://127.0.0.1:43948', token: 'test-only', fetchImpl: async (url, init) => {
    calls.push(String(url)); expect(new Headers(init?.headers).get('authorization')).toBe('Bearer test-only')
    const list = String(url).endsWith('/list'); expect(JSON.parse(String(init?.body))).toEqual(list ? f.query : f.lookup)
    return new Response(JSON.stringify(list ? { ok: true, type: 'course-collection-library', page: f.page } : { ok: true, type: 'course-collection-inspection', job: f.job }))
  } })
  expect(await client.listCourseCollections(f.query)).toEqual(f.page); expect(await client.inspectCourseCollection(f.lookup)).toEqual(f.job)
  expect(calls).toEqual(['http://127.0.0.1:43948/course/collection/list','http://127.0.0.1:43948/course/collection/inspect'])
})
it.each(uiLanguages)('renders %s collection library without auto-loading; read-only capability does not require FFprobe', language => {
  const f = fixture()
  const html = renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: language, children: createElement(CourseCollectionLibraryPanel, { project: f.project, dirty: false, workerConnected: true, workerToken: 'fixture', workerCapabilities: ['course-collection-library'] }) }))
  expect(html).toContain(translateUi(language, 'course.collections.heading')); expect(html).toContain(translateUi(language, 'course.collections.boundary'))
  expect(html).not.toContain(translateUi(language, 'course.collections.unavailable')); expect(html).toContain(`<button>${translateUi(language, 'course.collections.load')}</button>`)
})
