import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { createProject } from '../src/core/project'
import { courseLessonChoices, newCourseOutline, saveCourseOutline } from '../src/core/course'
import { reviewCourseExport, resolveCourseExportReview } from '../src/core/courseExportReview'
import { validateRenderRange } from '../src/core/renderRange'
import { CourseLessonSelector } from '../src/components/CourseLessonSelector'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import { uiLanguages } from '../src/core/uiLanguage'
import { translateUi } from '../src/core/uiMessages'

function fixture() {
  const project = createProject('Original course')
  const outline = { ...newCourseOutline(project), modules: [{ id: 'module', title: '<Original module>', lessons: [{ id: 'lesson', title: 'Original lesson', objective: 'Keep words', range: { inMs: 1000, outMs: 3000 } }] }] }
  const saved = saveCourseOutline(project, outline)
  const choices = courseLessonChoices(saved, 5000)
  return { saved, outline, choices, review: reviewCourseExport(saved.id, choices[0]) }
}
it('binds review to the exact project, saved lesson range and course revision', () => {
  const { saved, choices, review } = fixture()
  expect(resolveCourseExportReview(saved.id, review, choices, choices[0].range)).toEqual({ stale: false, lesson: choices[0] })
  expect(resolveCourseExportReview('different-project', review, choices, choices[0].range).stale).toBe(true)
  expect(resolveCourseExportReview(saved.id, review, choices, { inMs: 0, outMs: 3000 }).stale).toBe(true)
  expect(resolveCourseExportReview(saved.id, null, choices, { inMs: 0, outMs: 3000 })).toEqual({ stale: false, lesson: undefined })
})
it.each(['rename', 'move', 'remove', 'revision'] as const)('blocks implicit custom fallback after saved lesson change: %s', kind => {
  const { saved, choices, outline, review } = fixture()
  const changed = structuredClone(outline)
  if (kind === 'rename') changed.modules[0].lessons[0].title = 'Renamed'
  if (kind === 'move') changed.modules[0].lessons[0].range = { inMs: 2000, outMs: 4000 }
  if (kind === 'remove') changed.modules[0].lessons = []
  if (kind === 'revision') changed.learningOutcomes = 'New requirements'
  const next = saveCourseOutline(saved, changed)
  const latest = courseLessonChoices(next, 5000)
  expect(resolveCourseExportReview(next.id, review, latest, choices[0].range)).toEqual({ stale: true, lesson: undefined })
  if (latest.length) expect(resolveCourseExportReview(next.id, reviewCourseExport(next.id, latest[0]), latest, latest[0].range).stale).toBe(false)
})
it('requires explicit release/review when the timeline no longer contains the lesson', () => {
  const { saved, review, choices } = fixture()
  const shorter = courseLessonChoices(saved, 2000)
  expect(resolveCourseExportReview(saved.id, review, shorter, choices[0].range).stale).toBe(true)
  expect(() => reviewCourseExport(saved.id, shorter[0])).toThrow(/end of the timeline/)
  expect(resolveCourseExportReview(saved.id, review, [], choices[0].range).stale).toBe(true)
})
it.each(uiLanguages)('localizes lesson selection, range eligibility and stale recovery in %s without rewriting names', language => {
  const { saved, choices } = fixture()
  const html = renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: language, children: createElement(CourseLessonSelector, { lessons: choices, selectedId: 'lesson', stale: true, disabled: false, onSelect: vi.fn() }) }))
  for (const key of ['lessonExport.heading', 'lessonExport.select', 'lessonExport.stale', 'lessonExport.review', 'lessonExport.clear', 'lessonExport.receipt'] as const) expect(html).toContain(translateUi(language, key))
  expect(html).toContain('&lt;Original module&gt; / Original lesson')
  const blocked = renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: language, children: createElement(CourseLessonSelector, { lessons: courseLessonChoices(saved, 2000), selectedId: '', disabled: false, onSelect: vi.fn() }) }))
  expect(blocked).toContain(translateUi(language, 'range.afterEnd')); expect(blocked).toContain('value="lesson" disabled=""')
})
it.each(uiLanguages)('keeps missing lesson recovery visible and disabled during a job in %s', language => {
  const html = renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: language, children: createElement(CourseLessonSelector, { lessons: [], selectedId: 'removed', stale: true, disabled: true, onSelect: vi.fn() }) }))
  expect(html).toContain(translateUi(language, 'lessonExport.unavailable'))
  expect(html).toContain('select disabled=""'); expect(html).toContain('button disabled=""')
  expect(html).not.toContain(translateUi(language, 'lessonExport.review'))
})
it.each([
  { range: { inMs: 0.5, outMs: 3000 }, code: 'milliseconds' },
  { range: { inMs: -1, outMs: 3000 }, code: 'beforeStart' },
  { range: { inMs: 3000, outMs: 3000 }, code: 'order' },
  { range: { inMs: 0, outMs: 5001 }, code: 'afterEnd' }
])('retains stable range reason code $code and legacy diagnostics', ({ range, code }) => {
  expect(validateRenderRange(range, 5000)).toMatchObject({ valid: false, code, reason: expect.any(String) })
})
