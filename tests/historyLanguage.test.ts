import { expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { VersionHistoryPanel } from '../src/components/VersionHistoryPanel'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import { createProject } from '../src/core/project'
import { PersistentVersionHistory } from '../src/core/versioning'
import { uiLanguages, type UiLanguage } from '../src/core/uiLanguage'
import { translateUi } from '../src/core/uiMessages'
import type { KeyValueStore } from '../src/core/persistence'

function memoryStore(): KeyValueStore {
  const map = new Map<string, string>()
  return { getItem: (key) => map.get(key) ?? null, setItem: (key, value) => { map.set(key, value) }, removeItem: (key) => { map.delete(key) } }
}
function render(language: UiLanguage, project: ReturnType<typeof createProject>, history: PersistentVersionHistory) {
  return renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: language, children: createElement(VersionHistoryPanel, { project, history, onProjectChange: vi.fn() }) }))
}

it.each(uiLanguages)('renders history in %s while preserving stored labels, source IDs and project content', (language) => {
  const project = createProject('Original project')
  const history = new PersistentVersionHistory(memoryStore())
  history.snapshot(project, 'Unchanged checkpoint', 'user')
  history.snapshot(project, '<script>source label</script>', 'system')
  const before = JSON.stringify(history.list(project.id))
  const html = render(language, project, history)
  expect(html).toContain(translateUi(language, 'history.heading'))
  expect(html).toContain(translateUi(language, 'history.restore'))
  expect(html).toContain(translateUi(language, 'history.count', { count: 2 }))
  expect(html).toContain(translateUi(language, 'history.source.system'))
  expect(html).toContain('Unchanged checkpoint')
  expect(html).toContain('&lt;script&gt;source label&lt;/script&gt;')
  expect(html).not.toContain('<script>')
  expect(JSON.stringify(history.list(project.id))).toBe(before)
})

it.each(uiLanguages)('shows a translated failure rather than empty history when reads are blocked in %s', (language) => {
  const history = new PersistentVersionHistory({ getItem: () => { throw new Error('blocked history read') }, setItem: vi.fn(), removeItem: vi.fn() })
  const html = render(language, createProject('Read failure'), history)
  expect(html).toContain(translateUi(language, 'history.loadFailed'))
  expect(html).toContain('blocked history read')
  expect(html).toContain(translateUi(language, 'history.refresh'))
  expect(html).toContain('disabled=""')
  expect(html).not.toContain(translateUi(language, 'history.empty'))
  expect(html).not.toContain(translateUi(language, 'history.count', { count: 0 }))
})

it('keeps a failed safety save from yielding a restored project', () => {
  const store = memoryStore()
  const history = new PersistentVersionHistory(store)
  const project = createProject('Original')
  const saved = history.snapshot(project, 'Before edit')
  const changed = { ...project, title: 'Current' }
  const before = JSON.stringify(history.list(project.id))
  vi.spyOn(store, 'setItem').mockImplementation(() => { throw new Error('quota') })
  expect(() => history.restoreReversibly(changed, saved.id)).toThrow('quota')
  expect(changed.title).toBe('Current')
  expect(JSON.stringify(history.list(project.id))).toBe(before)
})

it('restores a real snapshot with an independent safety version and leaves media references unchanged', () => {
  const history = new PersistentVersionHistory(memoryStore())
  const project = createProject('Original')
  const target = history.snapshot(project, 'Keep this label')
  const changed = { ...project, title: 'Current draft', metadata: { note: 'keep in safety version' } }
  const result = history.restoreReversibly(changed, target.id)
  expect(result.project.title).toBe('Original')
  expect(result.safetyVersion.project).toEqual(changed)
  expect(result.project.assets).toEqual(project.assets)
  expect(history.list(project.id)).toHaveLength(2)
  expect(history.list(project.id)[0].label).toBe('Keep this label')
})
