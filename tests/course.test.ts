import { it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { courseLessonChoices, courseOutlineSchema, newCourseOutline, planCourseLessonExport, projectCourse, saveCourseOutline } from '../src/core/course'
import { createProject, parseProject } from '../src/core/project'
import { createRenderPlan, preview1080pPreset } from '../src/core/render'
import { projectExportHistory, recordSuccessfulExport } from '../src/core/exportHistory'
import { ProjectRepository, type KeyValueStore } from '../src/core/persistence'
import { PersistentVersionHistory } from '../src/core/versioning'
import { CoursePanel } from '../src/components/CoursePanel'
import { CourseLessonSelector } from '../src/components/CourseLessonSelector'

function fixture() {
  const project = parseProject({ ...createProject('My course'), metadata: { unrelated: 'keep' },
    assets: [{ id: 'video', kind: 'video', uri: 'KINAOU/Assets/demo.mp4', managed: true, metadata: { durationMs: 8000 } }],
    tracks: [{ id: 'visual', type: 'video', name: 'Video', clips: [{ id: 'c1', assetId: 'video', startMs: 0, durationMs: 4000, sourceOffsetMs: 0, speed: 2 }] }] })
  const outline = { ...newCourseOutline(project), modules: [{ id: 'module-a', title: 'Foundations', lessons: [{ id: 'lesson-a', title: 'Part A', objective: 'Learn A', range: { inMs: 0, outMs: 2000 } }, { id: 'lesson-b', title: 'Part B', objective: 'Apply B', range: { inMs: 2000, outMs: 4000 } }] }] }
  return { project, outline, saved: saveCourseOutline(project, outline) }
}
function memoryStore(): KeyValueStore { const map = new Map<string, string>(); return { getItem: (key) => map.get(key) ?? null, setItem: (key, value) => { map.set(key, value) }, removeItem: (key) => { map.delete(key) } } }

it('persists courses/modules/lessons through the normal project repository without mutating timeline or metadata', () => {
  const { project, outline, saved } = fixture()
  const repo = new ProjectRepository(memoryStore())
  repo.save(saved)
  expect(projectCourse(repo.load(project.id)!)).toEqual(outline)
  expect(saved.tracks).toEqual(project.tracks)
  expect(saved.assets).toEqual(project.assets)
  expect(saved.metadata.unrelated).toBe('keep')
  expect(projectCourse(project)).toBeNull()
  expect(saveCourseOutline(saved, outline)).toBe(saved)
})

it('increments revisions and rejects stale drafts or corrupt saved outlines without discarding data', () => {
  const { saved, outline } = fixture()
  const changed = saveCourseOutline(saved, { ...outline, title: 'Revised course' })
  expect(projectCourse(changed)?.revision).toBe(2)
  expect(() => saveCourseOutline(changed, outline)).toThrow(/changed/)
  const corrupted = { ...saved, metadata: { ...saved.metadata, courseOutline: { schemaVersion: 99 } } }
  expect(() => projectCourse(corrupted)).toThrow(/invalid/)
  expect(() => saveCourseOutline(corrupted, outline)).toThrow(/invalid/)
  expect(corrupted.metadata.courseOutline).toEqual({ schemaVersion: 99 })
})

it('restores previous course structure through persistent Version History and supports all three course languages', () => {
  const { saved, outline } = fixture()
  const store = memoryStore()
  const history = new PersistentVersionHistory(store)
  const checkpoint = history.snapshot(saved, 'Before course changes', 'system')
  const changed = saveCourseOutline(saved, { ...outline, modules: [], language: 'fr' })
  const restored = new PersistentVersionHistory(store).restoreReversibly(changed, checkpoint.id)
  expect(projectCourse(restored.project)).toEqual(outline)
  expect(projectCourse(restored.safetyVersion.project)?.language).toBe('fr')
  expect(restored.project.tracks).toEqual(saved.tracks)
  for (const language of ['de', 'en', 'fr'] as const) expect(projectCourse(saveCourseOutline(saved, { ...outline, language }))?.language).toBe(language)
})

it('bounds data and rejects duplicate identities, invalid languages and reversed/fractional ranges', () => {
  const { outline } = fixture()
  for (const changed of [{ ...outline, language: 'xx' }, { ...outline, modules: [...outline.modules, ...outline.modules] }, { ...outline, title: ' ' }, { ...outline, learningOutcomes: 'x'.repeat(8001) }]) expect(courseOutlineSchema.safeParse(changed).success).toBe(false)
  for (const range of [{ inMs: 1000, outMs: 1000 }, { inMs: -1, outMs: 2 }, { inMs: 0.5, outMs: 3 }, { inMs: 0, outMs: 86400001 }]) expect(courseOutlineSchema.safeParse({ ...outline, modules: [{ ...outline.modules[0], lessons: [{ ...outline.modules[0].lessons[0], range }] }] }).success).toBe(false)
  const tooMany = { ...outline, modules: Array.from({ length: 3 }, (_, m) => ({ id: `module-${m}`, title: 'Module', lessons: Array.from({ length: 100 }, (_, l) => ({ id: `lesson-${m}-${l}`, title: 'Lesson', objective: '', range: { inMs: 0, outMs: 1000 } })) })) }
  expect(courseOutlineSchema.safeParse(tooMany).success).toBe(false)
})

it('allows future lesson planning but disables exports outside the current active timeline', () => {
  const { saved } = fixture()
  const choices = courseLessonChoices(saved, 3000)
  expect(choices.map((entry) => entry.check.valid)).toEqual([true, false])
  const plan = createRenderPlan(saved, preview1080pPreset, 'KINAOU/Renders/full.mp4')
  expect(() => planCourseLessonExport(saved, 'missing', plan, 'KINAOU/Renders/missing.mp4')).toThrow(/not found/)
  expect(() => planCourseLessonExport(saved, 'lesson-b', { ...plan, projectId: 'other' }, 'KINAOU/Renders/lesson.mp4')).toThrow(/this project/)
  expect(() => planCourseLessonExport(saved, 'lesson-b', { ...plan, durationMs: 3000 }, 'KINAOU/Renders/lesson.mp4')).toThrow(/end of the timeline/)
})

it('exports the exact saved range with speed-aware source offsets and frozen course identity in receipts', () => {
  const { saved, outline } = fixture()
  const full = createRenderPlan(saved, preview1080pPreset, 'KINAOU/Renders/full.mp4')
  const result = planCourseLessonExport(saved, 'lesson-b', full, 'KINAOU/Renders/lesson-b.mp4')
  expect(result.plan.durationMs).toBe(2000)
  expect(result.plan.clips[0]).toMatchObject({ startMs: 0, durationMs: 2000, sourceOffsetMs: 4000, speed: 2 })
  expect(full.clips[0].sourceOffsetMs).toBe(0)
  const exported = recordSuccessfulExport(saved, { jobId: 'job-b', label: result.label, outputRelativePath: result.plan.outputRelativePath, format: 'landscape', range: result.range, durationMs: result.plan.durationMs, sceneIds: [], completedAt: new Date().toISOString(), courseLesson: result.context })
  const edited = saveCourseOutline(exported, { ...outline, title: 'Changed after export', modules: [] })
  expect(projectExportHistory(edited)[0].courseLesson).toMatchObject({ courseTitle: 'My course', moduleId: 'module-a', lessonId: 'lesson-b', outlineRevision: 1 })
  expect(projectExportHistory(edited)[0].range).toEqual({ inMs: 2000, outMs: 4000 })
  expect(edited.assets).toEqual(saved.assets)
})

it('remains backward-compatible with ordinary receipts and does not accept malformed course context', () => {
  const { saved } = fixture()
  const base = { schemaVersion: 1, jobId: 'j1', label: 'Whole timeline', outputRelativePath: 'KINAOU/Renders/a.mp4', format: 'landscape', range: { inMs: 0, outMs: 4000 }, durationMs: 4000, completedAt: new Date().toISOString() }
  expect(projectExportHistory({ ...saved, metadata: { exportHistory: [base] } })).toHaveLength(1)
  expect(projectExportHistory({ ...saved, metadata: { exportHistory: [{ ...base, courseLesson: {} }] } })).toHaveLength(0)
})

it('shows honest course authoring and review-only range selection UI', () => {
  const { saved } = fixture()
  const markup = renderToStaticMarkup(createElement(CoursePanel, { project: saved, history: new PersistentVersionHistory(memoryStore()), onProjectChange: () => {}, onOpenStudio: () => {} }))
  expect(markup).toContain('Foundations')
  expect(markup).toContain('Save course outline')
  expect(markup).toContain('not a complete course generator')
  expect(markup).toContain('Version History')
  const selector = renderToStaticMarkup(createElement(CourseLessonSelector, { lessons: courseLessonChoices(saved, 3000), selectedId: '', disabled: false, onSelect: () => {} }))
  expect(selector).toContain('Choosing a lesson only prepares its range')
  expect(selector).toContain('value="lesson-b" disabled=""')
  expect(selector).toContain('Out cannot be later')
})
