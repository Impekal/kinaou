import { afterEach, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { App } from '../src/App'
import { CoursePanel } from '../src/components/CoursePanel'
import { UiLanguageProvider, UiLanguageSelector } from '../src/components/UiLanguageProvider'
import { isUiLanguage, loadUiLanguage, saveUiLanguage, uiLanguages, uiLanguageStorageKey, type UiLanguage } from '../src/core/uiLanguage'
import { translateUi, uiMessages, type UiMessageKey } from '../src/core/uiMessages'
import { newCourseOutline, saveCourseOutline } from '../src/core/course'
import { createProject } from '../src/core/project'
import { ProjectRepository, type KeyValueStore } from '../src/core/persistence'
import { PersistentVersionHistory } from '../src/core/versioning'

function memoryStore(): KeyValueStore {
  const map = new Map<string, string>()
  return { getItem: (key) => map.get(key) ?? null, setItem: (key, value) => { map.set(key, value) }, removeItem: (key) => { map.delete(key) } }
}
afterEach(() => { vi.unstubAllGlobals() })

it('prefers a valid saved language, then supported browser languages, then English', () => {
  const store = memoryStore()
  expect(loadUiLanguage(store)).toBe('en')
  expect(loadUiLanguage(store, ['es', 'fr-CA', 'de-DE'])).toBe('fr')
  expect(loadUiLanguage(store, ['DE_de'])).toBe('de')
  store.setItem(uiLanguageStorageKey, 'unsupported')
  expect(loadUiLanguage(store, ['fr'])).toBe('fr')
  saveUiLanguage(store, 'de')
  expect(loadUiLanguage(store, ['fr'])).toBe('de')
  expect(loadUiLanguage(undefined, ['en-GB'])).toBe('en')
  expect(isUiLanguage(null)).toBe(false)
  expect(isUiLanguage('de-DE')).toBe(false)
})

it('tolerates blocked reads and surfaces failed writes without accepting invalid language values', () => {
  expect(loadUiLanguage({ getItem: () => { throw new Error('blocked') } }, ['fr'])).toBe('fr')
  expect(() => saveUiLanguage({ setItem: () => { throw new Error('blocked') } }, 'de')).toThrow('blocked')
  const store = memoryStore()
  expect(() => saveUiLanguage(store, 'es' as UiLanguage)).toThrow('Unsupported')
  expect(store.getItem(uiLanguageStorageKey)).toBeNull()
})

it('never rewrites projects, course language or stored content when saving UI preference', () => {
  const store = memoryStore()
  const project = createProject('Titre conservé')
  const saved = saveCourseOutline(project, { ...newCourseOutline(project), language: 'fr', title: 'Cours original' })
  const repo = new ProjectRepository(store)
  repo.save(saved)
  const before = JSON.stringify(repo.list())
  for (const language of uiLanguages) { saveUiLanguage(store, language); expect(JSON.stringify(repo.list())).toBe(before) }
})

it('has nonempty translations and identical placeholder sets for every catalog entry', () => {
  for (const [key, values] of Object.entries(uiMessages)) {
    expect(values, key).toHaveLength(3)
    const placeholders = (value: string) => [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort()
    for (const value of values) { expect(value.trim(), key).not.toBe(''); expect(placeholders(value), key).toEqual(placeholders(values[1])) }
    for (const language of uiLanguages) expect(translateUi(language, key as UiMessageKey)).toBeTruthy()
  }
  expect(translateUi('de', 'projects.summary', { tracks: 3, assets: 8 })).toBe('3 Spuren · 8 Medien')
  expect(translateUi('fr', 'projects.updated', { date: '<script>$&' })).toBe('Modifié le <script>$&')
})

it.each(uiLanguages)('renders the real app shell and creation form in %s without touching storage', (language) => {
  const store = memoryStore()
  const write = vi.spyOn(store, 'setItem')
  vi.stubGlobal('window', { localStorage: store })
  const html = renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: language, children: createElement(App) }))
  for (const key of ['nav.Course', 'nav.Settings', 'create.title', 'create.submit', 'ui.language'] as const) expect(html).toContain(translateUi(language, key))
  expect(html).toContain(`value="${language}" lang="${language}" selected=""`)
  expect(write).not.toHaveBeenCalled()
})

it.each(uiLanguages)('renders course labels in %s while keeping original titles, content language and metadata', (language) => {
  const project = createProject('Unchanged project')
  const saved = saveCourseOutline(project, { ...newCourseOutline(project), language: 'fr', title: 'Titre original', modules: [{ id: 'module', title: 'Foundations', lessons: [{ id: 'lesson', title: 'Original lesson', objective: 'Original objective', range: { inMs: 0, outMs: 1000 } }] }] })
  const before = JSON.stringify(saved)
  const onChange = vi.fn()
  const html = renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: language, children: createElement(CoursePanel, { project: saved, history: new PersistentVersionHistory(memoryStore()), onProjectChange: onChange, onOpenStudio: () => {} }) }))
  expect(html).toContain(translateUi(language, 'course.save'))
  expect(html).toContain(translateUi(language, 'course.language'))
  expect(html).toContain('value="fr" selected=""')
  for (const value of ['Titre original', 'Foundations', 'Original lesson', 'Original objective']) expect(html).toContain(value)
  expect(onChange).not.toHaveBeenCalled()
  expect(JSON.stringify(saved)).toBe(before)
})

it('renders a translated recovery path for corrupt saved courses without replacing data', () => {
  const project = createProject('Corrupt course')
  project.metadata.courseOutline = { broken: true }
  const onChange = vi.fn()
  const html = renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: 'de', children: createElement(CoursePanel, { project, history: new PersistentVersionHistory(memoryStore()), onProjectChange: onChange, onOpenStudio: () => {} }) }))
  expect(html).toContain(translateUi('de', 'course.corrupt'))
  expect(html).toContain('Technische Details')
  expect(html).not.toContain('Kursgliederung speichern')
  expect(onChange).not.toHaveBeenCalled()
})

it('renders the selector with native language names in a server environment', () => {
  const html = renderToStaticMarkup(createElement(UiLanguageProvider, { children: createElement(UiLanguageSelector) }))
  for (const name of ['Deutsch', 'English', 'Français']) expect(html).toContain(name)
})
