import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { SportsWorkspacePanel } from '../src/components/SportsWorkspacePanel'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import { createProject } from '../src/core/project'
import { PersistentVersionHistory } from '../src/core/versioning'
import { sportsViews, sportsViewForKey } from '../src/core/sportsWorkspace'
import { translateUi } from '../src/core/uiMessages'
import { uiLanguages } from '../src/core/uiLanguage'

it.each(sportsViews)('wraps directional tab navigation from %s and supports Home/End', view => {
  const index = sportsViews.indexOf(view)
  expect(sportsViewForKey(view, 'ArrowRight')).toBe(sportsViews[(index + 1) % 3])
  expect(sportsViewForKey(view, 'ArrowLeft')).toBe(sportsViews[(index + 2) % 3])
  expect(sportsViewForKey(view, 'Home')).toBe('board')
  expect(sportsViewForKey(view, 'End')).toBe('motion')
  for (const key of ['Tab', 'ArrowDown', 'ArrowUp', 'Escape', 'Enter', ' ']) expect(sportsViewForKey(view, key)).toBeNull()
})

it.each(uiLanguages)('renders accessible linked tabs and only the initial tool in %s without writes', language => {
  const save = vi.fn(), project = createProject('Original project'), before = JSON.stringify(project)
  const storage = { getItem: () => null, setItem: save, removeItem: save }
  const html = renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: language, children: createElement(SportsWorkspacePanel, {
    project, history: new PersistentVersionHistory(storage), workerUrl: 'http://127.0.0.1:43117', workerToken: '', workerConnected: false,
    workerCapabilities: [], managedRoots: [], onProjectChange: save, onOpenStudio: save
  }) }))
  expect(html.match(/role="tab"/g)).toHaveLength(3)
  expect(html.match(/role="tabpanel"/g)).toHaveLength(3)
  expect(html.match(/aria-selected="true"/g)).toHaveLength(1)
  expect(html.match(/hidden=""/g)).toHaveLength(2)
  for (const view of sportsViews) {
    expect(html).toContain(translateUi(language, `sports.${view}`))
    const control = html.match(new RegExp(`aria-controls="([^"]*-${view}-panel)"`))!
    expect(control).not.toBeNull()
    expect(html).toContain(`id="${control[1]}" role="tabpanel"`)
  }
  expect(html).toContain(translateUi(language, 'tactics.heading'))
  expect(html).not.toContain(translateUi(language, 'tactics.sequenceHeading'))
  expect(html).not.toContain(translateUi(language, 'tactics.motionHeading'))
  expect(html).toContain(translateUi(language, 'sports.drafts'))
  expect(save).not.toHaveBeenCalled()
  expect(JSON.stringify(project)).toBe(before)
})
