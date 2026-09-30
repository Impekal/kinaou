import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { SearchTrendsPanel } from '../src/components/SearchTrendsPanel'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import { createProject } from '../src/core/project'
import { PersistentVersionHistory } from '../src/core/versioning'
import { researchViews, researchViewForKey } from '../src/core/researchWorkspace'
import { translateUi } from '../src/core/uiMessages'
import { uiLanguages } from '../src/core/uiLanguage'

it.each(researchViews)('supports local arrow wrapping and Home/End from %s', view => {
  const index = researchViews.indexOf(view)
  expect(researchViewForKey(view, 'ArrowRight')).toBe(researchViews[(index + 1) % 4])
  expect(researchViewForKey(view, 'ArrowLeft')).toBe(researchViews[(index + 3) % 4])
  expect(researchViewForKey(view, 'Home')).toBe('discover')
  expect(researchViewForKey(view, 'End')).toBe('brief')
  for (const key of ['Tab','ArrowUp','ArrowDown','Escape','Enter',' ']) expect(researchViewForKey(view, key)).toBeNull()
})

it.each(uiLanguages)('renders linked %s views with one visible panel and all mounted scope guards, without side effects', language => {
  const save = vi.fn(), fetch = vi.spyOn(globalThis, 'fetch'), project = createProject('Original title'), before = JSON.stringify(project)
  try {
    const html = renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: language, children: createElement(SearchTrendsPanel, {
      project, history: new PersistentVersionHistory({ getItem: () => null, setItem: save, removeItem: save }), onProjectChange: save,
      workerUrl: 'http://127.0.0.1:43117', workerToken: 'synthetic-token', workerConnected: true, workerCapabilities: ['public-search-trends']
    }) }))
    expect(html.match(/role="tab"/g)).toHaveLength(4)
    expect(html.match(/role="tabpanel"/g)).toHaveLength(4)
    expect(html.match(/aria-selected="true"/g)).toHaveLength(1)
    expect(html.match(/hidden=""/g)).toHaveLength(3)
    expect(html).toMatch(/id="[^"]+-discover-tab"[^>]+aria-selected="true"[^>]+tabindex="0"/)
    for (const view of researchViews) {
      expect(html).toContain(translateUi(language, `researchWorkspace.${view}`))
      const match = html.match(new RegExp(`aria-controls="([^"]*-${view}-panel)"`))!
      expect(match).not.toBeNull()
      expect(html).toContain(`id="${match[1]}" role="tabpanel" aria-labelledby="${match[1].replace(/-panel$/, '-tab')}"`)
    }
    for (const key of ['assessment.heading','researchBrief.heading','research.history','researchWorkspace.drafts'] as const) expect(html).toContain(translateUi(language, key))
    expect(save).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled(); expect(JSON.stringify(project)).toBe(before)
  } finally { fetch.mockRestore() }
})

it('keeps panel IDs unique when two workspaces share a document', () => {
  const project = createProject('Two workspaces'), props = { project, history: new PersistentVersionHistory({ getItem: () => null, setItem: () => {}, removeItem: () => {} }), onProjectChange: () => {} }
  const html = renderToStaticMarkup(createElement('main', null, createElement(SearchTrendsPanel, props), createElement(SearchTrendsPanel, props)))
  const ids = [...html.matchAll(/id="([^"]+-(?:tab|panel))"/g)].map(match => match[1])
  expect(ids).toHaveLength(16); expect(new Set(ids).size).toBe(16)
})
