import { it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createProject } from '../src/core/project'
import { newCourseOutline, saveCourseOutline, type CourseOutline } from '../src/core/course'
import { resolveCourseOutlineFocus, courseOutlineIssueFocus } from '../src/core/courseOutlineFocus'
import { moveCourseLesson, reorderCourseModule } from '../src/core/courseOrdering'
import { CourseOutlineNavigator } from '../src/components/CourseOutlineNavigator'
import { CoursePanel } from '../src/components/CoursePanel'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import { uiLanguages } from '../src/core/uiLanguage'
import { translateUi } from '../src/core/uiMessages'
import { PersistentVersionHistory } from '../src/core/versioning'

function fixture() {
  const project = createProject('Focused course')
  const lesson = (id: string) => ({ id, title: id, objective: '', script: 'EXACT '+id, range: { inMs: 0, outMs: 1000 } })
  const draft: CourseOutline = { ...newCourseOutline(project), modules: [{ id: 'a', title: 'A', lessons: [lesson('one'),lesson('two')] }, { id: 'b', title: 'B', lessons: [lesson('three')] }, { id: 'empty', title: 'Empty', lessons: [] }] }
  return { project, draft }
}
it('starts at first item and preserves explicit empty-module focus', () => {
  const { draft } = fixture()
  expect(resolveCourseOutlineFocus(draft)).toEqual({ moduleId: 'a', lessonId: 'one' })
  expect(resolveCourseOutlineFocus(draft, { moduleId: 'empty', lessonId: '' })).toEqual({ moduleId: 'empty', lessonId: '' })
  expect(resolveCourseOutlineFocus({ ...draft, modules: [] })).toEqual({ moduleId: '', lessonId: '' })
})
it('follows stable lesson identity through lesson moves and module reordering without changing content', () => {
  const { draft } = fixture(), focus = { moduleId: 'a', lessonId: 'two' }, before = JSON.stringify(draft)
  const moved = moveCourseLesson(draft, 'a', 'two', 'b', 1), reordered = reorderCourseModule(moved, 'b', 0)
  expect(resolveCourseOutlineFocus(reordered, focus)).toEqual({ moduleId: 'b', lessonId: 'two' })
  expect(reordered.modules[0].lessons[1]).toBe(draft.modules[0].lessons[1]); expect(JSON.stringify(draft)).toBe(before)
})
it('removed lesson falls back in its module; removed module falls back to first module', () => {
  const { draft } = fixture(), focus = { moduleId: 'b', lessonId: 'missing' }
  expect(resolveCourseOutlineFocus(draft, focus)).toEqual({ moduleId: 'b', lessonId: 'three' })
  expect(resolveCourseOutlineFocus(draft, { moduleId: 'removed', lessonId: 'missing' })).toEqual({ moduleId: 'a', lessonId: 'one' })
})
it('leaves incomplete draft fields, NaN ranges and all hidden authored material untouched', () => {
  const { draft } = fixture(); draft.modules[0].lessons[1].title = ''; draft.modules[0].lessons[1].range.inMs = NaN
  Object.freeze(draft.modules[0].lessons[1]); Object.freeze(draft.modules[0].lessons); Object.freeze(draft.modules[0]); Object.freeze(draft.modules); Object.freeze(draft)
  expect(resolveCourseOutlineFocus(draft, { moduleId: 'a', lessonId: 'two' }).lessonId).toBe('two')
  expect(Number.isNaN(draft.modules[0].lessons[1].range.inMs)).toBe(true); expect(draft.modules[0].lessons[1].title).toBe('')
})
it.each([['modules',1,'lessons',0,'script'],['modules',1,'title'],['modules',1,'lessons',0,'range','inMs']])('maps hidden field error %j to exact visible authored item', (...path) => {
  expect(courseOutlineIssueFocus(fixture().draft, path)).toEqual({ moduleId: 'b', lessonId: 'three' })
})
it.each([[],['title'],['modules'],['modules',-1],['modules',1.5],['modules',99],['modules','1']])('keeps general or invalid error path %j from choosing an unrelated item', (...path) => {
  expect(courseOutlineIssueFocus(fixture().draft, path)).toBeNull()
})
it.each(uiLanguages)('renders bounded %s navigation and exactly one editor for a 200-lesson course without any side effects', language => {
  const { project, draft } = fixture()
  draft.modules = Array.from({ length: 50 }, (_, m) => ({ id: 'm'+m, title: 'Module '+m, lessons: Array.from({ length: 4 }, (_, l) => ({ id: `l${m}-${l}`, title: `Lesson ${m}-${l}`, objective: '', script: `HIDDEN_SCRIPT_${m}_${l}`, range: { inMs: 0, outMs: 1000 } })) }))
  const saved = saveCourseOutline(project, draft), before = JSON.stringify(saved), persist = vi.fn(), write = vi.fn(), fetch = vi.spyOn(globalThis,'fetch')
  try {
    const history = new PersistentVersionHistory({ getItem: () => null, setItem: write, removeItem: write })
    const html = renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: language, children: createElement(CoursePanel, { project: saved, history, onProjectChange: persist, onOpenStudio: vi.fn() }) }))
    expect(html).toContain(translateUi(language,'course.focus.heading')); expect(html).toContain('HIDDEN_SCRIPT_0_0'); expect(html).not.toContain('HIDDEN_SCRIPT_0_1'); expect(html).not.toContain('HIDDEN_SCRIPT_49_3')
    expect(html.match(/rows="8"/g)).toHaveLength(1); expect(html).toContain('Lesson 0-3'); expect(html).toContain('Module 49'); expect(html).toContain(translateUi(language,'course.focus.position',{current:1,total:200}))
    expect(persist).not.toHaveBeenCalled(); expect(write).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled(); expect(JSON.stringify(saved)).toBe(before)
  } finally { fetch.mockRestore() }
})
it.each(uiLanguages)('renders %s empty and last-lesson navigation safely without invoking selection', language => {
  const { draft } = fixture(), select = vi.fn()
  const render = (moduleId: string, lessonId: string) => renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: language, children: createElement(CourseOutlineNavigator,{draft,selected:{moduleId,lessonId},onSelect:select}) }))
  expect(render('empty','')).toContain(translateUi(language,'course.focus.noLessons'))
  expect(render('b','three')).toContain(translateUi(language,'course.focus.position',{current:3,total:3}))
  expect(render('b','three')).toContain(`disabled="">${translateUi(language,'course.focus.next')}`)
  expect(select).not.toHaveBeenCalled()
})
