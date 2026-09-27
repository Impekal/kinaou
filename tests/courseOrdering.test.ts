import { it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createProject, parseProject } from '../src/core/project'
import { newCourseOutline, projectCourse, saveCourseOutline, courseLessonChoices, planCourseLessonExport, type CourseOutline } from '../src/core/course'
import { moveCourseLesson, reorderCourseModule } from '../src/core/courseOrdering'
import { createRenderPlan, preview1080pPreset } from '../src/core/render'
import { projectCourseOutputIndex, recordSuccessfulExport } from '../src/core/exportHistory'
import { courseOutputState } from '../src/core/courseOutputState'
import { courseInstructorSignature } from '../src/core/courseInstructorReview'
import { ProjectRepository, type KeyValueStore } from '../src/core/persistence'
import { PersistentVersionHistory } from '../src/core/versioning'
import { CourseModuleOrderControls, CourseLessonOrderControls } from '../src/components/CourseOrderControls'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import { uiLanguages } from '../src/core/uiLanguage'
import { translateUi } from '../src/core/uiMessages'
function fixture() {
  const base = parseProject({ ...createProject('Ordering'), metadata: { unrelated: 'KEEP' }, assets: [{ id: 'video', kind: 'video', uri: 'KINAOU/Assets/demo.mp4', managed: true }], tracks: [{ id: 'track', type: 'video', name: 'Demo', clips: [{ id: 'clip', assetId: 'video', startMs: 0, durationMs: 3000 }] }] })
  const lesson = (id: string, n: number) => ({ id, title: id, objective: 'Objective', script: '\ufeff  Literal script 🌍\r\nsecond line', range: { inMs: n * 1000, outMs: (n + 1) * 1000 }, sources: [], demonstrations: [], exercises: [{ id: 'exercise', title: 'Practice', prompt: 'Prompt', hint: 'Hint', solution: 'PRIVATE', criteria: 'Rubric' }], materials: [{ id: 'resource', title: 'Resource', body: 'Exact saved text', audience: 'learner' as const }] })
  const draft: CourseOutline = { ...newCourseOutline(base), modules: [{ id: 'module-a', title: 'A', lessons: [lesson('one', 0), lesson('two', 1)] }, { id: 'module-b', title: 'B', lessons: [lesson('three', 2)] }, { id: 'module-c', title: 'C', lessons: [] }] }
  const project = saveCourseOutline(base, draft), data = new Map<string,string>(), store: KeyValueStore = { getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value) }, removeItem: key => { data.delete(key) } }
  return { base, project, draft, store }
}
it('reorders modules without mutating draft, lesson identities/content, ranges or revision', () => {
  const f = fixture(), before = JSON.stringify(f.draft), next = reorderCourseModule(f.draft, 'module-a', 2)
  expect(next.modules.map(module => module.id)).toEqual(['module-b','module-c','module-a']); expect(next.modules[2]).toBe(f.draft.modules[0])
  expect(next.revision).toBe(f.draft.revision); expect(JSON.stringify(f.draft)).toBe(before)
  expect(reorderCourseModule(f.draft, 'module-a', 0)).toBe(f.draft)
})
it('moves lessons in either direction using final index and preserves exact authored objects', () => {
  const f = fixture(), before = JSON.stringify(f.draft), moved = moveCourseLesson(f.draft, 'module-a', 'one', 'module-a', 1)
  expect(moved.modules[0].lessons.map(lesson => lesson.id)).toEqual(['two','one']); expect(moved.modules[0].lessons[1]).toBe(f.draft.modules[0].lessons[0])
  expect(moveCourseLesson(moved, 'module-a', 'one', 'module-a', 0)).toEqual(f.draft)
  expect(moveCourseLesson(f.draft, 'module-a', 'one', 'module-a', 0)).toBe(f.draft); expect(JSON.stringify(f.draft)).toBe(before)
})
it('cross-module movement supports empty/end/beginning destinations with no duplication or dropped fields', () => {
  const f = fixture(), original = f.draft.modules[0].lessons[0]
  const moved = moveCourseLesson(f.draft, 'module-a', 'one', 'module-c', 0)
  expect(moved.modules[0].lessons.map(l => l.id)).toEqual(['two']); expect(moved.modules[2].lessons).toEqual([original]); expect(moved.modules[2].lessons[0]).toBe(original)
  const atEnd = moveCourseLesson(moved, 'module-c', 'one', 'module-b', 1)
  expect(atEnd.modules[1].lessons.map(l => l.id)).toEqual(['three','one']); expect(atEnd.modules[2].lessons).toEqual([])
  expect(moveCourseLesson(atEnd, 'module-b', 'one', 'module-a', 0)).toEqual(f.draft)
})
it('does not normalize invalid in-progress titles/ranges during ordering; ordinary save still refuses them', () => {
  const f = fixture(); f.draft.title = ''; f.draft.modules[0].lessons[0].range.inMs = NaN; f.draft.modules[0].lessons[0].script = ' \r\n '
  const moved = moveCourseLesson(f.draft, 'module-a', 'one', 'module-b', 1)
  expect(moved.title).toBe(''); expect(Number.isNaN(moved.modules[1].lessons[1].range.inMs)).toBe(true); expect(moved.modules[1].lessons[1].script).toBe(' \r\n ')
  expect(() => saveCourseOutline(f.project, moved)).toThrow(); expect(projectCourse(f.project)!.title).toBe('Ordering')
})
it.each(['missingModule','missingLesson','wrongModule','missingDestination','negative','fraction','pastEnd','duplicate'])('rejects unsafe lesson movement %s without mutation', kind => {
  const f = fixture(); let source = 'module-a', lesson = 'one', target = 'module-b', index = 1
  if (kind === 'missingModule') source = 'missing'
  if (kind === 'missingLesson') lesson = 'missing'
  if (kind === 'wrongModule') source = 'module-b'
  if (kind === 'missingDestination') target = 'missing'
  if (kind === 'negative') index = -1
  if (kind === 'fraction') index = 0.5
  if (kind === 'pastEnd') index = 2
  if (kind === 'duplicate') f.draft.modules[1].lessons.push(f.draft.modules[0].lessons[0])
  const before = JSON.stringify(f.draft); expect(() => moveCourseLesson(f.draft, source, lesson, target, index)).toThrow(); expect(JSON.stringify(f.draft)).toBe(before)
})
it('rejects invalid module position/identity and duplicate module IDs', () => {
  const f = fixture()
  for (const index of [-1,0.5,3,Infinity]) expect(() => reorderCourseModule(f.draft, 'module-a', index)).toThrow()
  expect(() => reorderCourseModule(f.draft, 'missing', 0)).toThrow()
  f.draft.modules[1].id = 'module-a'; expect(() => reorderCourseModule(f.draft, 'module-a', 1)).toThrow()
})
it('rejects transfers to a full module but permits reordering its existing lessons', () => {
  const f = fixture(), template = f.draft.modules[1].lessons[0]
  f.draft.modules[1].lessons = Array.from({ length: 100 }, (_, n) => ({ ...template, id: `full-${n}` }))
  expect(() => moveCourseLesson(f.draft, 'module-a', 'one', 'module-b', 100)).toThrow(/100/)
  expect(moveCourseLesson(f.draft, 'module-b', 'full-0', 'module-b', 99).modules[1].lessons[99].id).toBe('full-0')
})
it('explicit save/reload/history restore retains media and old receipts; changed module is not falsely called removed', async () => {
  const f = fixture(), full = createRenderPlan(f.project, preview1080pPreset, 'KINAOU/Renders/full.mp4'), before = planCourseLessonExport(f.project, 'one', full, 'KINAOU/Renders/one.mp4')
  const exported = recordSuccessfulExport(f.project, { jobId: 'job', label: before.label, outputRelativePath: before.plan.outputRelativePath, format: 'landscape', range: before.range, durationMs: before.plan.durationMs, completedAt: '2026-09-27T00:00:00.000Z', sceneIds: [], courseLesson: before.context })
  const history = new PersistentVersionHistory(f.store), checkpoint = history.snapshot(exported, 'Before course ordering', 'system')
  const changed = saveCourseOutline(exported, moveCourseLesson(projectCourse(exported)!, 'module-a', 'one', 'module-b', 1))
  const repo = new ProjectRepository(f.store); repo.save(changed); const reloaded = repo.load(changed.id)!
  expect(projectCourse(reloaded)!.revision).toBe(2); expect(courseLessonChoices(reloaded, 3000).map(l => l.id)).toEqual(['two','three','one'])
  const after = planCourseLessonExport(reloaded, 'one', full, 'KINAOU/Renders/one.mp4')
  expect(after.plan).toEqual(before.plan); expect(after.range).toEqual(before.range); expect(after.context.moduleId).toBe('module-b')
  expect(projectCourseOutputIndex(reloaded)).toEqual(projectCourseOutputIndex(exported)); expect(courseOutputState(reloaded, projectCourseOutputIndex(exported)[0])).toBe('changed')
  expect(reloaded.tracks).toEqual(exported.tracks); expect(reloaded.assets).toEqual(exported.assets); expect(reloaded.metadata.unrelated).toBe('KEEP')
  expect(await courseInstructorSignature(reloaded)).not.toBe(await courseInstructorSignature(exported))
  const restored = history.restoreReversibly(reloaded, checkpoint.id).project
  expect(projectCourse(restored)).toEqual(projectCourse(exported)); expect(restored.tracks).toEqual(exported.tracks)
})
it.each(uiLanguages)('shows localized %s ordering limits and explicit transfer controls', language => {
  const f = fixture(), render = (children: ReturnType<typeof createElement>) => renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: language, children }))
  const module = render(createElement(CourseModuleOrderControls, { index: 0, count: 3, onMove: () => {} }))
  expect(module).toContain(`disabled="">${translateUi(language, 'course.order.moduleUp')}`)
  const lesson = render(createElement(CourseLessonOrderControls, { draft: f.draft, moduleId: 'module-a', lessonId: 'one', onMove: () => {} }))
  expect(lesson).toContain(`disabled="">${translateUi(language, 'course.order.lessonUp')}`); expect(lesson).toContain(`disabled="">${translateUi(language, 'course.order.transfer')}`)
  expect(lesson).toContain('B'); expect(lesson).toContain('C'); expect(lesson).not.toContain('value="module-a"')
})
