import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { it, expect, vi } from 'vitest'
import { CourseOutputPlayback, maxCoursePlaybackBytes } from '../src/core/courseOutputPlayback'
import { createProject } from '../src/core/project'
import { recordSuccessfulExport } from '../src/core/exportHistory'
import { WorkerClient } from '../src/core/workerClient'
import { CourseOutputPlaybackControl } from '../src/components/CourseOutputPlaybackControl'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import { uiLanguages } from '../src/core/uiLanguage'
import { translateUi } from '../src/core/uiMessages'
import { MAX_COURSE_PLAYBACK_BYTES } from '../worker/course-output-media.mjs'

const receipt = { schemaVersion: 1 as const, jobId: 'job', label: 'Lesson', outputRelativePath: 'KINAOU/Renders/lesson.mp4', format: 'landscape' as const, range: { inMs: 0, outMs: 1000 }, sceneIds: [], durationMs: 1000, completedAt: '2026-09-27T00:00:00.000Z', courseLesson: { courseId: 'course', moduleId: 'module', lessonId: 'lesson', outlineRevision: 1, courseTitle: 'Course', moduleTitle: 'Module', lessonTitle: 'Lesson', language: 'en' as const } }
function fixture() {
  let scope = { project: recordSuccessfulExport(createProject('Playback'), receipt), jobId: 'job', dirty: false, connection: 'original' }
  const deps = { environment: () => scope, load: vi.fn(async (_receipt, _signal) => new Blob(['file'], { type: 'video/mp4' })), createUrl: vi.fn(() => 'blob:test'), revokeUrl: vi.fn(), publish: vi.fn() }
  const session = new CourseOutputPlayback(scope, deps)
  return { session, deps, get scope() { return scope }, change: (next: typeof scope) => { scope = next; session.observe(scope) } }
}
it('does not read automatically; explicit load owns one URL and detach frees it exactly once', async () => {
  const f = fixture(), before = JSON.stringify(f.scope.project)
  expect(f.deps.load).not.toHaveBeenCalled(); await f.session.load()
  expect(f.deps.load.mock.calls[0][0]).toMatchObject(receipt)
  expect(f.deps.publish.mock.calls.map(call => call[0].phase)).toEqual(['loading', 'loaded'])
  f.session.detach(); f.session.detach()
  expect(f.deps.revokeUrl).toHaveBeenCalledExactlyOnceWith('blob:test')
  expect(f.deps.load.mock.calls[0][1].aborted).toBe(true)
  expect(JSON.stringify(f.scope.project)).toBe(before)
})
it.each(['project', 'selection', 'dirty', 'connection', 'leave'])('drops late blobs and aborts after %s, including round trip', async kind => {
  const f = fixture(), original = f.scope
  let finish!: (blob: Blob) => void
  f.deps.load.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const pending = f.session.load(); await f.session.load(); expect(f.deps.load).toHaveBeenCalledTimes(1)
  if (kind === 'leave') f.session.detach()
  else f.change({ ...original, ...(kind === 'project' ? { project: { ...original.project, title: 'Changed' } } : kind === 'selection' ? { jobId: 'other' } : kind === 'dirty' ? { dirty: true } : { connection: 'other' }) })
  f.change(original); finish(new Blob(['late'], { type: 'video/mp4' })); await pending
  expect(f.deps.createUrl).not.toHaveBeenCalled(); expect(f.deps.load.mock.calls[0][1].aborted).toBe(true)
  expect(f.deps.publish.mock.calls.map(call => call[0].phase)).toEqual(['loading'])
})
it('releases an already loaded video on changes; browser decode failure also releases it', async () => {
  const f = fixture(); await f.session.load(); f.session.playbackFailed()
  expect(f.deps.revokeUrl).toHaveBeenCalledOnce(); expect(f.deps.publish).toHaveBeenLastCalledWith({ phase: 'failed' })
  await f.session.load(); f.change({ ...f.scope, dirty: true }); expect(f.deps.revokeUrl).toHaveBeenCalledTimes(2)
})
it('failed reads require explicit retry; malformed blobs never create a URL', async () => {
  const f = fixture(); f.deps.load.mockRejectedValueOnce(Error('Read failed'))
  await f.session.load(); expect(f.deps.publish).toHaveBeenLastCalledWith({ phase: 'failed', detail: 'Read failed' })
  f.deps.load.mockResolvedValueOnce(new Blob(['wrong'], { type: 'text/plain' })); await f.session.load(); expect(f.deps.createUrl).not.toHaveBeenCalled()
  await f.session.load(); expect(f.deps.createUrl).toHaveBeenCalledOnce()
})
it.each(['dirty', 'missing', 'corrupt'])('blocks %s before reading a file', async kind => {
  const f = fixture(), scope = { ...f.scope, ...(kind === 'dirty' ? { dirty: true } : kind === 'missing' ? { jobId: 'missing' } : { project: { ...f.scope.project, metadata: { courseOutputIndex: {} } } }) }
  const task = new CourseOutputPlayback(scope, { ...f.deps, environment: () => scope })
  await task.load(); expect(f.deps.load).not.toHaveBeenCalled(); expect(f.deps.createUrl).not.toHaveBeenCalled()
})
function clientWith(response: Response) { return new WorkerClient({ baseUrl: 'http://127.0.0.1:43948', token: 'test', fetchImpl: vi.fn(async () => response) }) }
it('loads exact authenticated original bytes with no redirect and shared bounded size', async () => {
  expect(maxCoursePlaybackBytes).toBe(MAX_COURSE_PLAYBACK_BYTES)
  const abort = new AbortController(), fetchImpl = vi.fn(async () => new Response('file', { headers: { 'content-type': 'video/mp4', 'content-length': '4' } }))
  const client = new WorkerClient({ baseUrl: 'http://127.0.0.1:43948', token: 'test', fetchImpl })
  const blob = await client.loadCourseOutput({ ...receipt, sizeBytes: 4 }, abort.signal)
  expect(await blob.text()).toBe('file'); expect(blob.type).toBe('video/mp4')
  expect(fetchImpl.mock.calls[0]).toMatchObject(['http://127.0.0.1:43948/course/output-media', { method: 'POST', redirect: 'error', signal: abort.signal, headers: { authorization: 'Bearer test' } }])
})
it.each(['missing-length', 'invalid-length', 'too-large', 'empty', 'wrong-type', 'truncated', 'extra', 'http', 'changed-size', 'non-course'])('rejects %s media responses', async kind => {
  const headers = { 'content-type': kind === 'wrong-type' ? 'text/plain' : 'video/mp4', 'content-length': kind === 'missing-length' ? '' : kind === 'invalid-length' ? '4.0' : kind === 'too-large' ? String(maxCoursePlaybackBytes + 1) : kind === 'empty' ? '0' : kind === 'truncated' ? '5' : kind === 'extra' ? '3' : '4' }
  const client = clientWith(new Response('file', { status: kind === 'http' ? 403 : 200, headers }))
  await expect(client.loadCourseOutput({ ...receipt, ...(kind === 'changed-size' ? { sizeBytes: 9 } : kind === 'non-course' ? { courseLesson: undefined } : {}) })).rejects.toThrow()
})
it('cancels body reading on failure and respects an already aborted signal', async () => {
  const cancel = vi.fn(), stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([1, 2])) }, cancel })
  await expect(clientWith(new Response(stream, { headers: { 'content-type': 'video/mp4', 'content-length': '1' } })).loadCourseOutput(receipt)).rejects.toThrow(/exceeded/)
  expect(cancel).toHaveBeenCalledOnce()
  const abort = new AbortController(); abort.abort()
  await expect(clientWith(new Response('file', { headers: { 'content-type': 'video/mp4', 'content-length': '4' } })).loadCourseOutput(receipt, abort.signal)).rejects.toThrow()
})
it.each(uiLanguages)('renders explicit-only disabled unavailable playback in %s', language => {
  const f = fixture(), html = renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: language, children: createElement(CourseOutputPlaybackControl, { project: f.scope.project, jobId: 'job', dirty: false }) }))
  expect(html).toContain(translateUi(language, 'course.playback.heading')); expect(html).toContain(translateUi(language, 'course.playback.unavailable'))
  expect(html).not.toContain('<video'); expect(html).toContain(`<button disabled="">${translateUi(language, 'course.playback.load')}</button>`)
})
