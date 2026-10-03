import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { CourseProductionWorkspace, courseProductionViews, courseProductionViewForKey } from '../src/components/CourseProductionWorkspace'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import { createProject } from '../src/core/project'
import { newCourseOutline, saveCourseOutline } from '../src/core/course'
import { PersistentVersionHistory } from '../src/core/versioning'
import { translateUi } from '../src/core/uiMessages'

it.each(courseProductionViews)('supports wrapping arrows and Home/End from %s without trapping unrelated keys', view => {
  const index = courseProductionViews.indexOf(view)
  expect(courseProductionViewForKey(view, 'ArrowRight')).toBe(courseProductionViews[(index + 1) % 4])
  expect(courseProductionViewForKey(view, 'ArrowLeft')).toBe(courseProductionViews[(index + 3) % 4])
  expect(courseProductionViewForKey(view, 'Home')).toBe('overview')
  expect(courseProductionViewForKey(view, 'End')).toBe('subtitles')
  for (const key of ['Tab', 'ArrowUp', 'ArrowDown', 'Escape', 'Enter', ' ']) expect(courseProductionViewForKey(view, key)).toBeNull()
})
function fixture() {
  const base = createProject('Production views'), project = saveCourseOutline(base, { ...newCourseOutline(base), language: 'fr', modules: [{ id: 'module', title: 'Module original', lessons: [{ id: 'lesson', title: 'Leçon originale', objective: '', script: 'PRIVATE_SCRIPT', range: { inMs: 0, outMs: 2000 } }] }] })
  const write = vi.fn()
  return { project, dirty: false, history: new PersistentVersionHistory({ getItem: () => null, setItem: write, removeItem: write }), onProjectChange: write, onEditLesson: write, onPrepareGap: write, onOpenOutputs: write, onOpenStudio: write, onOpenAudio: write, onOpenProduction: write, workerUrl: 'http://127.0.0.1:43117', workerToken: 'test-only', workerConnected: true, workerCapabilities: ['publish-preflight', 'course-output-playback'] }
}
it.each(['de', 'en', 'fr'] as const)('renders linked %s tabs, one visible panel and mounted guards without requests/writes', language => {
  const props = fixture(), before = JSON.stringify(props.project), fetch = vi.spyOn(globalThis, 'fetch')
  try {
    const html = renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: language, children: createElement(CourseProductionWorkspace, props) }))
    expect(html.match(/role="tab"/g)).toHaveLength(4)
    expect(html.match(/role="tabpanel"/g)).toHaveLength(4)
    expect(html.match(/aria-selected="true"/g)).toHaveLength(1)
    expect(html.match(/hidden=""/g)).toHaveLength(3)
    expect(html).toMatch(/id="[^"]+-overview-tab"[^>]+aria-selected="true"[^>]+tabindex="0"/)
    for (const view of courseProductionViews) {
      expect(html).toContain(translateUi(language, `course.productionViews.${view}`))
      const match = html.match(new RegExp(`aria-controls="([^"]*-${view}-panel)"`))!
      expect(match).not.toBeNull()
      expect(html).toContain(`id="${match[1]}" role="tabpanel" aria-labelledby="${match[1].replace(/-panel$/, '-tab')}"`)
    }
    for (const key of ['course.demoPlace.heading', 'course.fileCheck.heading', 'course.subtitles.heading', 'course.productionViews.help', 'course.productionViews.operations'] as const) expect(html).toContain(translateUi(language, key))
    expect(html).toContain('Leçon originale'); expect(html).not.toContain('PRIVATE_SCRIPT'); expect(html).not.toContain('<video')
    expect(props.onProjectChange).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled(); expect(JSON.stringify(props.project)).toBe(before)
  } finally { fetch.mockRestore() }
})
it('keeps navigation identities unique across two mounted workspaces', () => {
  const props = fixture(), html = renderToStaticMarkup(createElement('main', null, createElement(CourseProductionWorkspace, props), createElement(CourseProductionWorkspace, props)))
  const ids = [...html.matchAll(/id="([^"]+-(?:tab|panel))"/g)].map(match => match[1])
  expect(ids).toHaveLength(16); expect(new Set(ids).size).toBe(16)
})
