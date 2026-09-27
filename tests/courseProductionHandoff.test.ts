import { expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createProject, parseProject } from '../src/core/project'
import { newCourseOutline, projectCourse, saveCourseOutline, planCourseLessonExport } from '../src/core/course'
import { createCourseProductionHandoff, resolveCourseProductionHandoff, courseProductionChoices } from '../src/core/courseProductionHandoff'
import { bindCourseNarration } from '../src/core/courseNarration'
import { createRenderPlan, preview1080pPreset } from '../src/core/render'
import { CourseProductionLauncher } from '../src/components/CourseProductionLauncher'
import { CourseProductionHandoffControl } from '../src/components/CourseProductionHandoffControl'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import { uiLanguages } from '../src/core/uiLanguage'
import { translateUi } from '../src/core/uiMessages'

function fixture() {
  const project = parseProject({ ...createProject('Handoff'), script: 'MAIN_SCRIPT', assets: [{ id: 'video', kind: 'video', uri: 'KINAOU/Assets/source.mp4', managed: true, metadata: { durationMs: 5000 } }], tracks: [{ id: 'video-track', type: 'video', name: 'Video', clips: [{ id: 'clip', assetId: 'video', startMs: 0, durationMs: 5000 }] }] })
  return saveCourseOutline(project, { ...newCourseOutline(project), id: 'course', language: 'fr', modules: [{ id: 'module', title: 'Module <source>', lessons: [
    { id: 'lesson', title: 'Leçon 🌍', objective: '', script: ' Bonjour\nle monde ', range: { inMs: 1000, outMs: 4000 } },
    { id: 'empty', title: 'No script', objective: '', range: { inMs: 4000, outMs: 5000 } },
    { id: 'outside', title: 'Outside timeline', objective: '', script: 'Later lesson', range: { inMs: 6000, outMs: 7000 } }
  ] }] })
}
it('hands a saved lesson to real narration binding and range plan without mutating the project', () => {
  const project = fixture(), before = JSON.stringify(project)
  const audio = createCourseProductionHandoff(project, 'lesson', 'narration'), video = createCourseProductionHandoff(project, 'lesson', 'export')
  const speech = bindCourseNarration(project, resolveCourseProductionHandoff(project, audio, 'narration').id)
  expect(speech.script).toBe('Bonjour\nle monde'); expect(speech.course.language).toBe('fr')
  const selected = resolveCourseProductionHandoff(project, video, 'export')
  const plan = planCourseLessonExport(project, selected.id, createRenderPlan(project, preview1080pPreset, 'KINAOU/Renders/full.mp4'), 'KINAOU/Renders/lesson.mp4')
  expect(plan.range).toEqual({ inMs: 1000, outMs: 4000 }); expect(plan.plan.durationMs).toBe(3000)
  expect(plan.plan.clips[0]).toMatchObject({ startMs: 0, sourceOffsetMs: 1000, durationMs: 3000 })
  expect(plan.context).toMatchObject({ lessonId: 'lesson', language: 'fr', outlineRevision: 1 })
  expect(Object.isFrozen(audio)).toBe(true); expect(JSON.stringify(project)).toBe(before)
})
it('does not persist or accept copied/forged handoffs; reload loses the in-memory capability', () => {
  const project = fixture(), handoff = createCourseProductionHandoff(project, 'lesson', 'narration')
  expect(() => resolveCourseProductionHandoff(project, { ...handoff }, 'narration')).toThrow()
  expect(() => resolveCourseProductionHandoff(project, JSON.parse(JSON.stringify(handoff)), 'narration')).toThrow()
  expect(resolveCourseProductionHandoff(structuredClone(project), handoff, 'narration').id).toBe('lesson')
})
it.each(['project', 'course', 'revision', 'script', 'range', 'removed', 'timeline', 'metadata', 'destination'] as const)('permanently rejects changed %s and never falls back to another lesson', kind => {
  const project = fixture(), changed = structuredClone(project), handoff = createCourseProductionHandoff(project, 'lesson', 'export')
  const course = projectCourse(changed)!
  if (kind === 'project') changed.id = 'other'
  if (kind === 'course') course.id = 'other'
  if (kind === 'revision') course.revision++
  if (kind === 'script') course.modules[0].lessons[0].script = 'Changed same-revision words'
  if (kind === 'range') course.modules[0].lessons[0].range.inMs = 1500
  if (kind === 'removed') course.modules[0].lessons.shift()
  if (kind === 'timeline') changed.tracks[0].muted = true
  if (kind === 'metadata') changed.metadata.note = 'new'
  changed.metadata.courseOutline = course
  expect(() => resolveCourseProductionHandoff(changed, handoff, kind === 'destination' ? 'narration' : 'export')).toThrow()
  expect(() => resolveCourseProductionHandoff(project, handoff, 'export')).toThrow()
})
it('validates narration and export eligibility separately, including muted tracks', () => {
  const project = fixture()
  expect(() => createCourseProductionHandoff(project, 'empty', 'narration')).toThrow()
  expect(() => createCourseProductionHandoff(project, 'outside', 'export')).toThrow()
  expect(createCourseProductionHandoff(project, 'outside', 'narration').lessonId).toBe('outside')
  expect(createCourseProductionHandoff(project, 'empty', 'export').lessonId).toBe('empty')
  expect(() => createCourseProductionHandoff(project, 'missing', 'export')).toThrow()
  project.tracks[0].muted = true
  expect(courseProductionChoices(project).every(entry => !entry.check.valid)).toBe(true)
})
it('rejects corrupt saved outline data instead of silently creating a blank course', () => {
  const project = fixture(); project.metadata.courseOutline = { broken: true }
  expect(() => courseProductionChoices(project)).toThrow()
  expect(() => createCourseProductionHandoff(project, 'lesson', 'narration')).toThrow()
})
it.each(uiLanguages)('renders %s explicit launcher and guarded recipient without starting or writing on render', language => {
  const project = fixture(), onOpen = vi.fn(), onApply = vi.fn(), fetch = vi.spyOn(globalThis, 'fetch')
  const handoff = createCourseProductionHandoff(project, 'lesson', 'narration')
  const render = (child: ReturnType<typeof createElement>) => renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: language, children: child }))
  try {
    const launcher = render(createElement(CourseProductionLauncher, { project, dirty: true, onOpen }))
    expect(launcher).toContain('select disabled=""'); expect(launcher.match(/button disabled=""/g)).toHaveLength(2)
    expect(launcher).toContain('Module &lt;source&gt; / Leçon 🌍')
    const receiver = render(createElement(CourseProductionHandoffControl, { project, handoff, target: 'narration', disabled: true, onApply }))
    expect(receiver).toContain(translateUi(language, 'course.handoff.applyNarration')); expect(receiver).toContain('button disabled=""')
    project.title = 'Changed'
    const stale = render(createElement(CourseProductionHandoffControl, { project, handoff, target: 'narration', disabled: false, onApply }))
    expect(stale).toContain(translateUi(language, 'course.handoff.stale')); expect(stale).not.toContain('<button')
    expect(onOpen).not.toHaveBeenCalled(); expect(onApply).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled()
  } finally { fetch.mockRestore() }
})
