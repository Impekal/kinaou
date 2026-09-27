import { it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { CourseWorkspaceNavigation, courseWorkspaceStages } from '../src/components/CourseWorkspaceNavigation'
import { CoursePanel } from '../src/components/CoursePanel'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import { uiLanguages } from '../src/core/uiLanguage'
import { translateUi } from '../src/core/uiMessages'
import { createProject } from '../src/core/project'
import { newCourseOutline, saveCourseOutline } from '../src/core/course'
import { PersistentVersionHistory } from '../src/core/versioning'

for (const language of uiLanguages) it.each(courseWorkspaceStages)(`renders accessible ${language} navigation with only %s selected; no action on render`, stage => {
  const select = vi.fn(), html = renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: language, children: createElement(CourseWorkspaceNavigation, { stage, onSelect: select }) }))
  expect(html).toContain(`<nav class="courseWorkflowNav" aria-label="${translateUi(language, 'course.workspace.navigation')}">`)
  expect(html.match(/aria-current="step"/g)).toHaveLength(1); expect(html.match(/aria-controls="course-workspace-content"/g)).toHaveLength(4)
  for (const item of courseWorkspaceStages) expect(html).toContain(`aria-label="${translateUi(language, `course.workspace.${item}.title`)}"${stage === item ? ' aria-current="step"' : ' aria-controls='}`)
  expect(html.match(/type="button"/g)).toHaveLength(4); expect(select).not.toHaveBeenCalled()
})
it.each(uiLanguages)('starts %s Course in a focused plan, preserving content and keeping inactive operational panels unmounted', language => {
  const base = createProject('Workspace'), project = saveCourseOutline(base, { ...newCourseOutline(base), language: 'fr', modules: [{ id: 'module', title: 'Original module', lessons: [{ id: 'lesson', title: 'Original lesson', objective: '', script: 'ORIGINAL_TEXT', range: { inMs: 0, outMs: 1000 } }] }] })
  const before = JSON.stringify(project), persist = vi.fn(), write = vi.fn(), fetch = vi.spyOn(globalThis, 'fetch')
  try {
    const history = new PersistentVersionHistory({ getItem: () => null, setItem: write, removeItem: write })
    const html = renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: language, children: createElement(CoursePanel, { project, history, onProjectChange: persist, onOpenStudio: vi.fn(), onOpenAudio: vi.fn() }) }))
    expect(html).toContain('id="course-workspace-content"'); expect(html).toContain('role="region" aria-labelledby="course-workspace-title"')
    expect(html).toContain('ORIGINAL_TEXT'); expect(html).toContain('Original module'); expect(html).toContain(translateUi(language, 'course.workspace.outline.help'))
    for (const key of ['course.collections.heading','course.collection.heading','course.fileCheck.heading','course.library.heading'] as const) expect(html).not.toContain(translateUi(language, key))
    expect(html).toContain('<details class="card note courseWorkspaceLimits">'); expect(html).toContain(translateUi(language, 'course.workspace.detach'))
    expect(persist).not.toHaveBeenCalled(); expect(write).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled(); expect(JSON.stringify(project)).toBe(before)
  } finally { fetch.mockRestore() }
})
