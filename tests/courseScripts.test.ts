import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { CoursePanel } from '../src/components/CoursePanel'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import { courseLessonChoices, courseLessonScriptExport, courseOutlineSchema, courseScriptLimits, newCourseOutline, projectCourse, saveCourseOutline } from '../src/core/course'
import { resolveCourseExportReview, reviewCourseExport } from '../src/core/courseExportReview'
import { createProject, parseProject } from '../src/core/project'
import { ProjectRepository, type KeyValueStore } from '../src/core/persistence'
import { PersistentVersionHistory } from '../src/core/versioning'
import { uiLanguages } from '../src/core/uiLanguage'
import { translateUi } from '../src/core/uiMessages'

const script = '  Bonjour !\n\nÜberblick – “quoted” 🌍\n  Beispiel\n'
function store(): KeyValueStore {
  const values = new Map<string, string>()
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value) }, removeItem: key => { values.delete(key) } }
}
function fixture() {
  const project = createProject('Original course')
  project.metadata.keep = 'unrelated'
  const outline = newCourseOutline(project)
  outline.modules = [{ id: 'module-a', title: 'Module', lessons: [
    { id: 'lesson-a', title: 'First', objective: 'Learn', range: { inMs: 0, outMs: 1000 } },
    { id: 'lesson-b', title: 'Second', objective: 'Apply', range: { inMs: 1000, outMs: 2000 } }
  ] }]
  return { project, outline, saved: saveCourseOutline(project, outline) }
}

it('keeps legacy outlines byte-shape compatible and does not add empty scripts on load', () => {
  const { saved, outline } = fixture()
  expect(projectCourse(saved)).toEqual(outline)
  expect(projectCourse(saved)!.modules[0].lessons[0]).not.toHaveProperty('script')
  expect(saveCourseOutline(saved, outline)).toBe(saved)
})

it('persists the exact authored script through project serialization and repository reload', () => {
  const { saved, outline } = fixture()
  outline.modules[0].lessons[0].script = script
  const changed = saveCourseOutline(saved, outline)
  const repository = new ProjectRepository(store())
  repository.save(parseProject(JSON.parse(JSON.stringify(changed))))
  expect(projectCourse(repository.load(saved.id)!)!.modules[0].lessons[0].script).toBe(script)
  expect(projectCourse(changed)!.revision).toBe(2)
  expect(projectCourse(saved)!.modules[0].lessons[0].script).toBeUndefined()
  expect(changed.assets).toEqual(saved.assets)
  expect(changed.tracks).toEqual(saved.tracks)
  expect(changed.metadata.keep).toBe('unrelated')
  expect(saveCourseOutline(changed, projectCourse(changed)!)).toBe(changed)
})

it('restores the previous script using persistent history while retaining a reversible safety version', () => {
  const { saved, outline } = fixture()
  outline.modules[0].lessons[0].script = script
  const first = saveCourseOutline(saved, outline)
  const storage = store()
  const history = new PersistentVersionHistory(storage)
  const checkpoint = history.snapshot(first, 'Before saving course outline', 'system')
  const draft = projectCourse(first)!
  draft.modules[0].lessons[0].script = 'New take'
  const next = saveCourseOutline(first, draft)
  const restored = new PersistentVersionHistory(storage).restoreReversibly(next, checkpoint.id)
  expect(projectCourse(restored.project)!.modules[0].lessons[0].script).toBe(script)
  expect(projectCourse(restored.safetyVersion.project)!.modules[0].lessons[0].script).toBe('New take')
})

it('invalidates the existing export review after a script edit without changing lesson ranges', () => {
  const { saved, outline } = fixture()
  const choice = courseLessonChoices(saved, 2000)[0]
  const review = reviewCourseExport(saved.id, choice)
  outline.modules[0].lessons[0].script = script
  const changed = saveCourseOutline(saved, outline)
  expect(resolveCourseExportReview(changed.id, review, courseLessonChoices(changed, 2000), choice.range).stale).toBe(true)
  expect(projectCourse(changed)!.modules[0].lessons[0].range).toEqual(choice.range)
  expect(() => saveCourseOutline(changed, outline)).toThrow(/changed/)
})

it('bounds individual scripts and total course text without truncating or silently accepting malformed data', () => {
  const { outline } = fixture()
  const lesson = outline.modules[0].lessons[0]
  lesson.script = 'x'.repeat(courseScriptLimits.lesson)
  expect(courseOutlineSchema.safeParse(outline).success).toBe(true)
  lesson.script += 'x'
  expect(courseOutlineSchema.safeParse(outline).success).toBe(false)
  expect(courseOutlineSchema.safeParse({ ...outline, modules: [{ ...outline.modules[0], lessons: [{ ...lesson, script: 123 }] }] }).success).toBe(false)
  outline.modules[0].lessons = Array.from({ length: 10 }, (_, index) => ({ ...lesson, id: `lesson-${index}`, script: 'x'.repeat(courseScriptLimits.lesson) }))
  expect(courseOutlineSchema.safeParse(outline).success).toBe(true)
  outline.modules[0].lessons.push({ ...lesson, id: 'one-too-many', script: 'x' })
  expect(courseOutlineSchema.safeParse(outline).success).toBe(false)
})

it('exports only exact saved UTF-8 text using a safe lesson-id filename', () => {
  const { saved, outline } = fixture()
  outline.modules[0].lessons[0].script = script
  outline.modules[0].lessons[0].title = '../../not-a-filename'
  const changed = saveCourseOutline(saved, outline)
  const before = JSON.stringify(changed)
  expect(courseLessonScriptExport(changed, 'lesson-a')).toEqual({ filename: 'lesson-lesson-a.txt', text: script, mimeType: 'text/plain;charset=utf-8' })
  outline.modules[0].lessons[0].script = 'Unsaved draft'
  expect(courseLessonScriptExport(changed, 'lesson-a').text).toBe(script)
  expect(JSON.stringify(changed)).toBe(before)
  expect(() => courseLessonScriptExport(changed, 'missing')).toThrow()
  expect(() => courseLessonScriptExport(changed, '../lesson-a')).toThrow()
  expect(() => courseLessonScriptExport(changed, 'lesson-b')).toThrow()
})

it.each(['', ' \n\t '])('does not export an empty/whitespace-only script: %j', empty => {
  const { saved, outline } = fixture()
  outline.modules[0].lessons[0].script = empty
  const changed = saveCourseOutline(saved, outline)
  expect(projectCourse(changed)!.modules[0].lessons[0].script).toBe(empty)
  expect(() => courseLessonScriptExport(changed, 'lesson-a')).toThrow()
})

it('rejects corrupt stored scripts without overwriting the course', () => {
  const { saved, outline } = fixture()
  const corrupted = structuredClone(saved)
  const badOutline = structuredClone(outline)
  badOutline.modules[0].lessons[0].script = 'x'.repeat(courseScriptLimits.lesson + 1)
  corrupted.metadata.courseOutline = badOutline
  expect(() => projectCourse(corrupted)).toThrow(/invalid/)
  expect(() => courseLessonScriptExport(corrupted, 'lesson-a')).toThrow()
  expect(() => saveCourseOutline(corrupted, outline)).toThrow()
  expect(corrupted.metadata.courseOutline).toEqual(badOutline)
})

it.each(uiLanguages)('renders localized script editing in %s without translation, mutation or execution', language => {
  const { saved, outline } = fixture()
  outline.modules[0].lessons[0].script = script + '<script>doNotExecute()</script>'
  const changed = saveCourseOutline(saved, outline)
  const before = JSON.stringify(changed)
  const persist = vi.fn()
  const fetchSpy = vi.spyOn(globalThis, 'fetch')
  try {
    const html = renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: language,
      children: createElement(CoursePanel, { project: changed, history: new PersistentVersionHistory(store()), onProjectChange: persist, onOpenStudio: vi.fn() }) }))
    expect(html).toContain(translateUi(language, 'course.script'))
    expect(html).toContain(translateUi(language, 'course.scriptDownload'))
    expect(html).toContain('Überblick')
    expect(html).toContain('&lt;script&gt;doNotExecute()&lt;/script&gt;')
    expect(html).not.toContain('<script>')
    expect(JSON.stringify(changed)).toBe(before)
    expect(persist).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
  } finally { fetchSpy.mockRestore() }
})
