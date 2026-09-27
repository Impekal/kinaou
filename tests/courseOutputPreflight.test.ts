import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { createProject } from '../src/core/project'
import { recordSuccessfulExport, projectCourseOutputIndex, forgetCourseOutputReference } from '../src/core/exportHistory'
import { CourseOutputPreflight, type CourseOutputCheckScope, type CourseOutputCheckFeedback } from '../src/core/courseOutputPreflight'
import type { PublishPreflightResult } from '../src/core/publishPackage'
import { CourseOutputFileCheckPanel } from '../src/components/CourseOutputFileCheckPanel'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import { uiLanguages } from '../src/core/uiLanguage'
import { translateUi } from '../src/core/uiMessages'

function fixture() {
  const project = recordSuccessfulExport(createProject('Check course file'), { jobId: 'job', label: 'Lesson', outputRelativePath: 'KINAOU/Renders/lesson.mp4', format: 'landscape', durationMs: 1000, range: { inMs: 5000, outMs: 6000 }, sceneIds: [], sizeBytes: 12345, completedAt: '2026-09-27T00:00:00Z', courseLesson: { courseId: 'course', moduleId: 'module', lessonId: 'lesson', outlineRevision: 1, courseTitle: 'Course', moduleTitle: 'Module', lessonTitle: 'Lesson', language: 'en' } })
  let scope: CourseOutputCheckScope = { project, jobId: 'job', connection: 'original', dirty: false }
  const receipt = projectCourseOutputIndex(project)[0]
  const result: PublishPreflightResult = { schemaVersion: 1, sourcePath: receipt.outputRelativePath, checkedAt: '2026-09-27T00:01:00Z', ready: true, durationToleranceMs: 250,
    expected: { jobId: receipt.jobId, format: receipt.format, width: 1920, height: 1080, durationMs: 1000, sizeBytes: 12345 },
    actual: { width: 1920, height: 1080, durationMs: 1000, sizeBytes: 12345, videoCodec: 'h264', audioCodec: 'aac' }, checks: { size: true, videoStream: true, dimensions: true, duration: true } }
  const client = { preflightPublishExport: vi.fn(async () => result) }, states: CourseOutputCheckFeedback[] = []
  const session = new CourseOutputPreflight(scope, { environment: () => scope, client, publish: value => states.push(value) })
  return { project, receipt, result, client, states, session, get scope() { return scope }, change: (next: CourseOutputCheckScope, observe = true) => { scope = next; if (observe) session.observe(scope) } }
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r }); return { promise, resolve } }

it('explicitly reads exactly the retained receipt and publishes only validated measured facts without writes', async () => {
  const f = fixture(), before = JSON.stringify(f.project)
  expect(f.client.preflightPublishExport).not.toHaveBeenCalled()
  await f.session.check()
  expect(f.client.preflightPublishExport).toHaveBeenCalledExactlyOnceWith(f.receipt)
  expect(f.states.map(state => state.phase)).toEqual(['checking', 'matched'])
  expect(f.states[1].result).toEqual(f.result)
  expect(JSON.stringify(f.project)).toBe(before); expect(f.session.busy).toBe(false)
})
it('reports real mismatches without relabelling them passed', async () => {
  const f = fixture(); f.result.ready = false; f.result.actual.width = 320; f.result.checks.dimensions = false
  await f.session.check(); expect(f.states.at(-1)?.phase).toBe('mismatch')
  expect(f.states.at(-1)?.result?.checks.dimensions).toBe(false)
})
it.each(['path', 'job', 'format', 'duration', 'size', 'inconsistent'])('rejects a %s-mismatched worker reply', async kind => {
  const f = fixture()
  if (kind === 'path') f.result.sourcePath = 'KINAOU/Renders/other.mp4'
  if (kind === 'job') f.result.expected.jobId = 'other'
  if (kind === 'format') f.result.expected.format = 'vertical'
  if (kind === 'duration') f.result.expected.durationMs = 2000
  if (kind === 'size') f.result.expected.sizeBytes = 999
  if (kind === 'inconsistent') f.result.ready = false
  await f.session.check(); expect(f.states.at(-1)?.phase).toBe('failed')
  expect(f.states.some(state => state.phase === 'matched')).toBe(false)
})
it('explicitly retries a failed read, without background retries or mutations', async () => {
  const f = fixture(); f.client.preflightPublishExport.mockRejectedValueOnce(Error('TEST missing MP4'))
  await f.session.check(); expect(f.states.at(-1)).toMatchObject({ phase: 'failed', detail: 'TEST missing MP4' })
  expect(f.client.preflightPublishExport).toHaveBeenCalledTimes(1)
  await f.session.check(); expect(f.states.at(-1)?.phase).toBe('matched'); expect(f.client.preflightPublishExport).toHaveBeenCalledTimes(2)
})
it('serializes duplicate clicks while a read is pending', async () => {
  const f = fixture(), pending = deferred<PublishPreflightResult>(); f.client.preflightPublishExport.mockReturnValueOnce(pending.promise)
  const task = f.session.check(); await f.session.check()
  expect(f.session.busy).toBe(true); expect(f.client.preflightPublishExport).toHaveBeenCalledTimes(1)
  pending.resolve(f.result); await task; expect(f.session.busy).toBe(false)
})
it.each(['project', 'selection', 'connection', 'dirty', 'removed', 'leave'])('drops late results after %s changes, including scope round trips', async kind => {
  const f = fixture(), original = f.scope, pending = deferred<PublishPreflightResult>(); f.client.preflightPublishExport.mockReturnValueOnce(pending.promise)
  const task = f.session.check()
  if (kind === 'project') f.change({ ...original, project: { ...original.project, title: 'Changed' } })
  if (kind === 'selection') f.change({ ...original, jobId: 'other' })
  if (kind === 'connection') f.change({ ...original, connection: 'other' })
  if (kind === 'dirty') f.change({ ...original, dirty: true })
  if (kind === 'removed') f.change({ ...original, project: forgetCourseOutputReference(original.project, 'job') })
  if (kind === 'leave') f.session.detach()
  f.change(original); pending.resolve(f.result); await task
  expect(f.session.wasDetached).toBe(true); expect(f.states.map(state => state.phase)).toEqual(['checking'])
  await f.session.check(); expect(f.client.preflightPublishExport).toHaveBeenCalledTimes(1)
})
it('rechecks the actual environment after await even without a render-time observe call', async () => {
  const f = fixture(), pending = deferred<PublishPreflightResult>(); f.client.preflightPublishExport.mockReturnValueOnce(pending.promise)
  const task = f.session.check(); f.change({ ...f.scope, connection: 'changed' }, false)
  pending.resolve(f.result); await task
  expect(f.states.map(state => state.phase)).toEqual(['checking']); expect(f.session.wasDetached).toBe(true)
})
it.each(['dirty', 'missing', 'corrupt', 'wrong-project'] as const)('does not read a file for %s selection state', async kind => {
  const f = fixture(), scope = { ...f.scope, project: structuredClone(f.project) }
  if (kind === 'dirty') scope.dirty = true
  if (kind === 'missing') scope.jobId = 'missing'
  if (kind === 'corrupt') scope.project.metadata.courseOutputIndex = { bad: true }
  if (kind === 'wrong-project') scope.project.id = 'another'
  const states: CourseOutputCheckFeedback[] = []
  await new CourseOutputPreflight(scope, { environment: () => scope, client: f.client, publish: value => states.push(value) }).check()
  expect(f.client.preflightPublishExport).not.toHaveBeenCalled(); expect(states.at(-1)?.phase).toBe('failed')
})
it('does not invent size or audio evidence when historical size/audio stream is absent', async () => {
  const f = fixture()
  const receipts = projectCourseOutputIndex(f.project); delete receipts[0].sizeBytes
  const scope = { ...f.scope, project: { ...f.project, metadata: { ...f.project.metadata, courseOutputIndex: { schemaVersion: 1, projectId: f.project.id, receipts } } } }
  delete f.result.expected.sizeBytes; delete f.result.actual.audioCodec
  const states: CourseOutputCheckFeedback[] = []
  await new CourseOutputPreflight(scope, { environment: () => scope, client: f.client, publish: value => states.push(value) }).check()
  expect(states.at(-1)?.phase).toBe('matched'); expect(states.at(-1)?.result?.actual.audioCodec).toBeUndefined()
  expect(states.at(-1)?.result?.expected.sizeBytes).toBeUndefined()
})
it.each(uiLanguages)('renders read-only source choices and honest disconnected state in %s', language => {
  const f = fixture()
  const html = renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: language, children: createElement(CourseOutputFileCheckPanel, { project: f.project, dirty: false }) }))
  expect(html).toContain(translateUi(language, 'course.fileCheck.heading'))
  expect(html).toContain(translateUi(language, 'course.fileCheck.unavailable'))
  expect(html).toContain(`<button disabled="">${translateUi(language, 'course.fileCheck.check')}</button>`)
  expect(f.client.preflightPublishExport).not.toHaveBeenCalled()
})
