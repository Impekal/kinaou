import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { clearCourseOutputIndex, courseOutputIndexLimits, forgetCourseOutputReference, forgetExportReceipt, projectCourseOutputIndex, projectExportHistory, recordSuccessfulExport, retainRecentCourseOutputs, type SuccessfulExportReceiptInput } from '../src/core/exportHistory'
import { courseOutputState } from '../src/core/courseOutputState'
import { newCourseOutline, projectCourse, saveCourseOutline } from '../src/core/course'
import { createProject, parseProject } from '../src/core/project'
import { PersistentVersionHistory } from '../src/core/versioning'
import { ProjectRepository, type KeyValueStore } from '../src/core/persistence'
import { CourseOutputIndexPanel } from '../src/components/CourseOutputIndexPanel'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import { uiLanguages } from '../src/core/uiLanguage'
import { translateUi } from '../src/core/uiMessages'
import { SingleExportSession, type ExportFeedback } from '../src/core/singleExportSession'
import { createRenderPlan, preview1080pPreset } from '../src/core/render'

function fixture() {
  const project = createProject('Course index')
  return saveCourseOutline(project, { ...newCourseOutline(project), id: 'course', modules: [{ id: 'module', title: 'Module', lessons: [{ id: 'lesson', title: 'Lesson', objective: '', range: { inMs: 0, outMs: 1000 } }] }] })
}
function input(jobId: string): SuccessfulExportReceiptInput {
  return { jobId, label: 'Lesson', outputRelativePath: `KINAOU/Renders/${jobId}.mp4`, format: 'landscape', durationMs: 1000, range: { inMs: 0, outMs: 1000 }, sceneIds: [], completedAt: '2026-09-27T00:00:00Z', courseLesson: {
    courseId: 'course', moduleId: 'module', lessonId: 'lesson', outlineRevision: 1, courseTitle: 'Course index', moduleTitle: 'Module', lessonTitle: 'Lesson', language: 'en'
  } }
}
function store(): KeyValueStore { const data = new Map<string, string>(); return { getItem: k => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v) }, removeItem: k => { data.delete(k) } } }
function full() {
  const project = fixture()
  project.metadata.courseOutputIndex = { schemaVersion: 1, projectId: project.id, receipts: Array.from({ length: 1000 }, (_, i) => ({ schemaVersion: 1, ...input('job-' + i) })) }
  return project
}

it('automatically retains course outputs beyond the newest fifty, across serialization and ordinary receipt removal', () => {
  let project = fixture()
  for (let i = 0; i < 65; i++) project = recordSuccessfulExport(project, input('job-' + i))
  expect(projectExportHistory(project)).toHaveLength(50)
  expect(projectCourseOutputIndex(project)).toHaveLength(65)
  project = forgetExportReceipt(project, 'job-64')
  const storage = store(), repo = new ProjectRepository(storage); repo.save(parseProject(JSON.parse(JSON.stringify(project))))
  expect(projectCourseOutputIndex(repo.load(project.id)!)).toEqual(projectCourseOutputIndex(project))
  expect(projectCourseOutputIndex(project).at(-1)?.jobId).toBe('job-0')
  expect(recordSuccessfulExport(project, input('job-0'))).not.toBe(project) // recent list can receive it again, index never duplicates
  expect(projectCourseOutputIndex(recordSuccessfulExport(project, input('job-0')))).toHaveLength(65)
})
it('keeps ordinary exports unchanged and does not inspect unrelated corrupt course metadata', () => {
  const project = fixture(); project.metadata.courseOutputIndex = { invalid: true }
  const ordinary = { ...input('ordinary'), courseLesson: undefined }
  expect(projectExportHistory(recordSuccessfulExport(project, ordinary))).toHaveLength(1)
  expect(() => recordSuccessfulExport(project, input('course'))).toThrow(/Invalid/)
})
it('idempotently retains a course job and rejects conflicting IDs without mutations', () => {
  const project = recordSuccessfulExport(fixture(), input('job'))
  expect(recordSuccessfulExport(project, input('job'))).toBe(project)
  const before = JSON.stringify(project)
  expect(() => recordSuccessfulExport(project, { ...input('job'), outputRelativePath: 'KINAOU/Renders/different.mp4' })).toThrow(/Conflicting/)
  const noRecent = forgetExportReceipt(project, 'job')
  expect(() => recordSuccessfulExport(noRecent, { ...input('job'), courseLesson: { ...input('job').courseLesson!, lessonId: 'different' } })).toThrow(/Conflicting/)
  expect(JSON.stringify(project)).toBe(before)
})
it('explicitly imports only still-retained legacy course receipts and never fabricates missing references', () => {
  const project = fixture()
  project.metadata.exportHistory = [{ schemaVersion: 1, ...input('legacy') }, { schemaVersion: 1, ...input('ordinary'), courseLesson: undefined }]
  const next = retainRecentCourseOutputs(project)
  expect(projectCourseOutputIndex(next).map(r => r.jobId)).toEqual(['legacy'])
  expect(retainRecentCourseOutputs(next)).toBe(next)
  expect(projectExportHistory(next)).toEqual(projectExportHistory(project))
  const removed = forgetCourseOutputReference(next, 'legacy')
  expect(projectCourseOutputIndex(retainRecentCourseOutputs(removed))).toHaveLength(1)
  expect(projectCourseOutputIndex(project)).toEqual([])
})
it.each(['shape', 'foreign', 'duplicate', 'path', 'non-course', 'too-many', 'too-large'] as const)('fails closed for %s index data without silently dropping it', kind => {
  const project = recordSuccessfulExport(fixture(), input('job'))
  const valid = structuredClone(project.metadata.courseOutputIndex) as { projectId: string; receipts: unknown[] }
  if (kind === 'shape') project.metadata.courseOutputIndex = null
  if (kind === 'foreign') valid.projectId = 'foreign'
  if (kind === 'duplicate') valid.receipts.push(valid.receipts[0])
  if (kind === 'path') valid.receipts = [{ schemaVersion: 1, ...input('job'), outputRelativePath: 'KINAOU/Renders/../Assets/escape.mp4' }]
  if (kind === 'non-course') valid.receipts = [{ schemaVersion: 1, ...input('job'), courseLesson: undefined }]
  if (kind === 'too-many') valid.receipts = Array.from({ length: 1001 }, (_, i) => ({ schemaVersion: 1, ...input('job-' + i) }))
  if (kind === 'too-large') valid.receipts = ['x'.repeat(courseOutputIndexLimits.bytes)]
  if (kind !== 'shape') project.metadata.courseOutputIndex = valid
  const before = JSON.stringify(project)
  expect(() => projectCourseOutputIndex(project)).toThrow()
  expect(() => retainRecentCourseOutputs(project)).toThrow()
  expect(JSON.stringify(project)).toBe(before)
  expect(projectCourseOutputIndex(clearCourseOutputIndex(project))).toEqual([])
})
it('refuses index capacity overflow atomically, permitting an explicit metadata-only removal and retry', () => {
  const project = full(), before = JSON.stringify(project)
  expect(() => recordSuccessfulExport(project, input('new'))).toThrow(/full/)
  expect(JSON.stringify(project)).toBe(before); expect(projectExportHistory(project)).toHaveLength(0)
  const next = recordSuccessfulExport(forgetCourseOutputReference(project, 'job-0'), input('new'))
  expect(projectCourseOutputIndex(next)).toHaveLength(1000)
  expect(projectCourseOutputIndex(next)[0].jobId).toBe('new')
  expect(next.assets).toEqual(project.assets); expect(next.tracks).toEqual(project.tracks)
})
it('refuses byte-size overflow and an oversized legacy import without partial updates', () => {
  const project = fixture()
  const large = { schemaVersion: 1, ...input('base'), sceneIds: Array.from({ length: 100 }, (_, i) => String(i).padEnd(200, 'x')) }
  const receipts: typeof large[] = []
  const bytes = (items: typeof receipts) => new TextEncoder().encode(JSON.stringify({ schemaVersion: 1, projectId: project.id, receipts: items })).length
  while (bytes([...receipts, large]) <= courseOutputIndexLimits.bytes) receipts.push({ ...large, jobId: 'job-' + receipts.length })
  project.metadata.courseOutputIndex = { schemaVersion: 1, projectId: project.id, receipts }
  const before = JSON.stringify(project)
  expect(() => recordSuccessfulExport(project, { ...large, jobId: 'overflow' })).toThrow(/size limit/)
  expect(JSON.stringify(project)).toBe(before)
  const capacity = full(); capacity.metadata.exportHistory = [{ schemaVersion: 1, ...input('legacy-1') }, { schemaVersion: 1, ...input('legacy-2') }]
  const capacityBefore = JSON.stringify(capacity)
  expect(() => retainRecentCourseOutputs(capacity)).toThrow(/full/)
  expect(JSON.stringify(capacity)).toBe(capacityBefore)
})

it('recovers a full-index save failure without rerendering the completed job', async () => {
  let project = full()
  const receipt = input('new'), states: ExportFeedback[] = []
  const client = { startRender: vi.fn(async () => ({ id: 'new', state: 'succeeded' as const, progress: 1, createdAt: receipt.completedAt, updatedAt: receipt.completedAt, outputPath: receipt.outputRelativePath, durationMs: 1000 })), renderStatus: vi.fn(), cancelRender: vi.fn() }
  const plan = { ...createRenderPlan(project, preview1080pPreset, receipt.outputRelativePath), durationMs: 1000 }
  const session = new SingleExportSession(plan, receipt, { client, current: () => true, record: r => { project = recordSuccessfulExport(project, r) }, publish: state => states.push(state) })
  await session.run(); expect(states.at(-1)?.phase).toBe('saveFailed')
  project = forgetCourseOutputReference(project, 'job-0')
  await session.run(); expect(states.at(-1)?.phase).toBe('succeeded')
  expect(client.startRender).toHaveBeenCalledTimes(1)
  expect(projectExportHistory(project)[0].jobId).toBe('new')
})
it('preserves historical course context and reports only outline metadata agreement', () => {
  let project = recordSuccessfulExport(fixture(), input('job'))
  const receipt = projectCourseOutputIndex(project)[0]
  // Default new-course content language may follow its profile; use the saved value explicitly.
  const outline = projectCourse(project)!; outline.language = 'en'; project.metadata.courseOutline = outline
  expect(courseOutputState(project, receipt)).toBe('matches')
  const changed = structuredClone(project); changed.tracks = []
  expect(courseOutputState(changed, receipt)).toBe('matches') // not a timeline-byte/quality check
  outline.modules[0].lessons[0].title = 'Changed'
  project = saveCourseOutline(project, outline)
  expect(courseOutputState(project, receipt)).toBe('changed')
  const removed = projectCourse(project)!; removed.modules = []
  project = saveCourseOutline(project, removed)
  expect(courseOutputState(project, receipt)).toBe('removed')
  delete project.metadata.courseOutline
  expect(courseOutputState(project, receipt)).toBe('otherCourse')
  expect(receipt.courseLesson?.lessonTitle).toBe('Lesson')
})
it('restores explicitly removed or cleared references through safety history without file actions', () => {
  const project = recordSuccessfulExport(fixture(), input('job')), history = new PersistentVersionHistory(store())
  const version = history.snapshot(project, 'Before changing retained lesson outputs', 'system')
  const removed = forgetCourseOutputReference(project, 'job')
  expect(projectCourseOutputIndex(removed)).toHaveLength(0)
  expect(projectExportHistory(removed)).toHaveLength(1)
  expect(projectCourseOutputIndex(history.restoreReversibly(removed, version.id).project)).toHaveLength(1)
  expect(projectCourseOutputIndex(clearCourseOutputIndex(project))).toHaveLength(0)
  expect(forgetCourseOutputReference(project, 'missing')).toBe(project)
})
it.each(uiLanguages)('renders safe, bounded, localized index controls in %s', language => {
  const project = recordSuccessfulExport(fixture(), input('job'))
  const html = renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: language, children: createElement(CourseOutputIndexPanel, { project, dirty: true, history: new PersistentVersionHistory(store()), onProjectChange: vi.fn() }) }))
  expect(html).toContain(translateUi(language, 'course.outputs.heading'))
  expect(html).toContain(translateUi(language, 'course.outputs.help'))
  expect(html).toContain('<button disabled="">' + translateUi(language, 'course.outputs.forget'))
  expect(html).not.toContain(translateUi(language, 'course.outputs.confirmButton'))
})
