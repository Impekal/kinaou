import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { courseLessonChoices, courseLessonExercisesExport, courseOutlineSchema, newCourseOutline, projectCourse, saveCourseOutline } from '../src/core/course'
import { canExportCourseExercises, courseExerciseLimits, type CourseExercise } from '../src/core/courseExercises'
import { createProject, parseProject } from '../src/core/project'
import { ProjectRepository, type KeyValueStore } from '../src/core/persistence'
import { PersistentVersionHistory } from '../src/core/versioning'
import { resolveCourseExportReview, reviewCourseExport } from '../src/core/courseExportReview'
import { CourseLessonExercisesEditor } from '../src/components/CourseLessonExercisesEditor'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import { uiLanguages } from '../src/core/uiLanguage'
import { translateUi } from '../src/core/uiMessages'

const exercise: CourseExercise = { id: 'exercise-a', title: 'Practice', prompt: '  Bonjour\nÜberblick 🌍  ', hint: 'A learner hint', solution: 'SECRET ANSWER\n  original spacing  ', criteria: 'SECRET RUBRIC' }
function memory(): KeyValueStore {
  const values = new Map<string, string>()
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value) }, removeItem: key => { values.delete(key) } }
}
function fixture(withExercises = true) {
  const project = createProject('Course')
  const outline = newCourseOutline(project)
  outline.modules = [{ id: 'module', title: 'Module', lessons: [{ id: 'lesson', title: 'Lesson', objective: '', range: { inMs: 0, outMs: 1000 }, ...(withExercises ? { exercises: [structuredClone(exercise)] } : {}) }] }]
  return { project, outline, saved: saveCourseOutline(project, outline) }
}

it('leaves legacy outlines unchanged and allows incomplete drafts without export claims', () => {
  const { saved, outline } = fixture(false)
  expect(projectCourse(saved)).toEqual(outline)
  expect(projectCourse(saved)!.modules[0].lessons[0]).not.toHaveProperty('exercises')
  expect(saveCourseOutline(saved, outline)).toBe(saved)
  outline.modules[0].lessons[0].exercises = [{ ...exercise, prompt: '', solution: '' }]
  const next = saveCourseOutline(saved, outline)
  expect(projectCourse(next)!.modules[0].lessons[0].exercises![0].solution).toBe('')
  expect(() => courseLessonExercisesExport(next, 'lesson', 'worksheet')).toThrow()
})

it('persists exact authored content and restores an earlier answer through reversible history', () => {
  const { project, saved } = fixture()
  const storage = memory(), repository = new ProjectRepository(storage), history = new PersistentVersionHistory(storage)
  repository.save(parseProject(JSON.parse(JSON.stringify(saved))))
  expect(projectCourse(repository.load(saved.id)!)!.modules[0].lessons[0].exercises).toEqual([exercise])
  const checkpoint = history.snapshot(saved, 'Before saving course outline', 'system')
  const draft = projectCourse(saved)!
  draft.modules[0].lessons[0].exercises![0].solution = 'Revised answer'
  const next = saveCourseOutline(saved, draft)
  const restored = history.restoreReversibly(next, checkpoint.id)
  expect(projectCourse(restored.project)!.modules[0].lessons[0].exercises![0]).toEqual(exercise)
  expect(projectCourse(restored.safetyVersion.project)!.modules[0].lessons[0].exercises![0].solution).toBe('Revised answer')
  expect(next.assets).toEqual(project.assets)
  expect(next.tracks).toEqual(project.tracks)
  expect(() => saveCourseOutline(next, draft)).toThrow(/changed/)
})

it('invalidates lesson-export review after exercise changes, including only criteria edits', () => {
  const { saved } = fixture()
  const choice = courseLessonChoices(saved, 1000)[0], review = reviewCourseExport(saved.id, choice)
  const draft = projectCourse(saved)!
  draft.modules[0].lessons[0].exercises![0].criteria += ' Revised'
  const next = saveCourseOutline(saved, draft)
  expect(resolveCourseExportReview(next.id, review, courseLessonChoices(next, 1000), choice.range).stale).toBe(true)
  expect(projectCourse(next)!.revision).toBe(2)
})

it('exports only saved worksheet fields, without hidden answers, rubric, sources or scripts', () => {
  const { saved, outline } = fixture()
  outline.modules[0].lessons[0].exercises![0].prompt = 'Unsaved'
  const before = JSON.stringify(saved)
  const worksheet = courseLessonExercisesExport(saved, 'lesson', 'worksheet')
  expect(worksheet.filename).toBe('lesson-lesson-worksheet-r1.txt')
  expect(worksheet.mimeType).toBe('text/plain;charset=utf-8')
  expect(worksheet.text).toContain(exercise.prompt)
  expect(worksheet.text).toContain(exercise.hint)
  expect(worksheet.text).not.toContain('SECRET')
  expect(worksheet.text).not.toContain('Unsaved')
  const answers = courseLessonExercisesExport(saved, 'lesson', 'answer-key')
  expect(answers.filename).toBe('lesson-lesson-answer-key-r1.txt')
  expect(answers.text).toContain(exercise.solution)
  expect(answers.text).toContain(exercise.criteria)
  expect(JSON.stringify(saved)).toBe(before)
})

it.each(['prompt', 'solution'] as const)('never drops incomplete exercise items from an answer key: %s', field => {
  const { saved } = fixture()
  const draft = projectCourse(saved)!
  draft.modules[0].lessons[0].exercises!.push({ ...exercise, id: 'second', [field]: ' \n ' })
  const next = saveCourseOutline(saved, draft)
  expect(() => courseLessonExercisesExport(next, 'lesson', 'answer-key')).toThrow()
  if (field === 'prompt') expect(() => courseLessonExercisesExport(next, 'lesson', 'worksheet')).toThrow()
  else expect(courseLessonExercisesExport(next, 'lesson', 'worksheet').text).toContain('2. Practice')
})

it('rejects empty/missing lessons, forged document types and corrupt data without mutation', () => {
  const { saved } = fixture()
  expect(() => courseLessonExercisesExport(saved, '../lesson', 'worksheet')).toThrow()
  expect(() => courseLessonExercisesExport(saved, 'lesson', 'html' as never)).toThrow()
  expect(() => courseLessonExercisesExport(createProject('Empty'), 'lesson', 'worksheet')).toThrow()
  const broken = structuredClone(saved)
  const outline = projectCourse(saved)!
  outline.modules[0].lessons[0].exercises![0].prompt = 123 as never
  broken.metadata.courseOutline = outline
  expect(() => courseLessonExercisesExport(broken, 'lesson', 'worksheet')).toThrow(/invalid/)
  expect(broken.metadata.courseOutline).toEqual(outline)
  expect(canExportCourseExercises([], 'worksheet')).toBe(false)
})

it.each(uiLanguages)('uses saved course language for draft headers and safe filenames in %s', language => {
  const { saved } = fixture()
  const draft = projectCourse(saved)!; draft.language = language
  draft.modules[0].lessons[0].title = '../../not-a-file'
  const next = saveCourseOutline(saved, draft)
  const file = courseLessonExercisesExport(next, 'lesson', 'worksheet')
  expect(file.filename).toBe('lesson-lesson-worksheet-r2.txt')
  expect(file.text).toContain({ de: 'ENTWURF', en: 'DRAFT', fr: 'BROUILLON' }[language])
  expect(file.text).toContain(exercise.prompt)
})

it('bounds exercise counts, IDs, individual fields and aggregate course size without truncation', () => {
  const { outline } = fixture()
  const lesson = outline.modules[0].lessons[0]
  for (const field of ['prompt', 'hint', 'solution', 'criteria'] as const) {
    lesson.exercises = [{ ...exercise, [field]: 'x'.repeat(courseExerciseLimits.field) }]
    expect(courseOutlineSchema.safeParse(outline).success).toBe(true)
    lesson.exercises[0][field] += 'x'
    expect(courseOutlineSchema.safeParse(outline).success).toBe(false)
  }
  lesson.exercises = [exercise, exercise]
  expect(courseOutlineSchema.safeParse(outline).success).toBe(false)
  lesson.exercises = [{ ...exercise, id: '../unsafe' }]
  expect(courseOutlineSchema.safeParse(outline).success).toBe(false)
  lesson.exercises = Array.from({ length: 21 }, (_, i) => ({ ...exercise, id: 'e-' + i }))
  expect(courseOutlineSchema.safeParse(outline).success).toBe(false)
  lesson.exercises = Array.from({ length: 20 }, (_, i) => ({ ...exercise, id: 'e-' + i, prompt: 'x'.repeat(4000), hint: 'x'.repeat(4000), solution: 'x'.repeat(4000) }))
  expect(courseOutlineSchema.safeParse(outline).success).toBe(false)
})

it.each(uiLanguages)('renders escaped content and keeps downloads disabled for unsaved drafts in %s', language => {
  const { saved } = fixture()
  const lesson = projectCourse(saved)!.modules[0].lessons[0]
  lesson.exercises![0].prompt = '<script>noExecution()</script>'
  const changed = vi.fn(), download = vi.fn(), fetch = vi.spyOn(globalThis, 'fetch')
  const before = JSON.stringify(lesson)
  try {
    const html = renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: language, children: createElement(CourseLessonExercisesEditor, { lesson, dirty: true, onChange: changed, onDownload: download }) }))
    expect(html).toContain(translateUi(language, 'course.exercises.add'))
    expect(html).toContain('&lt;script&gt;noExecution()&lt;/script&gt;')
    expect(html).toContain('<button disabled="">' + translateUi(language, 'course.exercises.worksheet'))
    expect(html).toContain('<button disabled="">' + translateUi(language, 'course.exercises.answers'))
    expect(JSON.stringify(lesson)).toBe(before)
    expect(changed).not.toHaveBeenCalled(); expect(download).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled()
  } finally { fetch.mockRestore() }
})
