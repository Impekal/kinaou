import { expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { SettingsPanel, type SettingsPanelProps } from '../src/components/SettingsPanel'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import { uiLanguages, type UiLanguage } from '../src/core/uiLanguage'
import { translateUi } from '../src/core/uiMessages'
import { configureWorkspaceRoot, defaultStorageSettings } from '../src/core/storage'
import { StorageSettingsRepository, type KeyValueStore } from '../src/core/persistence'

function fixture(): SettingsPanelProps {
  return {
    workerUrl: 'http://127.0.0.1:43117', workerToken: '', workerBusy: false, workerError: '', workerHandshake: null,
    onWorkerUrlChange: vi.fn(), onWorkerTokenChange: vi.fn(), onTestConnection: vi.fn(),
    storage: configureWorkspaceRoot(defaultStorageSettings, '/Volumes/Test Drive', 'desktop-worker'),
    workspaceRoot: '/Volumes/Unsaved Draft', storageBackend: 'desktop-worker',
    onWorkspaceRootChange: vi.fn(), onStorageBackendChange: vi.fn(), onSaveStorage: vi.fn()
  }
}
function render(language: UiLanguage, props: SettingsPanelProps) {
  return renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: language, children: createElement(SettingsPanel, props) }))
}

it.each(uiLanguages)('translates Settings to %s without altering input values, saved paths or triggering actions', (language) => {
  const props = fixture()
  const before = JSON.stringify(props)
  const html = render(language, props)
  for (const key of ['settings.url', 'settings.token', 'settings.save', 'settings.targets', 'storage.models'] as const) expect(html).toContain(translateUi(language, key))
  expect(html).toContain('/Volumes/Unsaved Draft')
  expect(html).toContain('/Volumes/Test Drive/KINAOU/Assets')
  expect(html).not.toContain('/Volumes/Unsaved Draft/KINAOU/Assets')
  expect(html).toContain('value="desktop-worker" selected=""')
  expect(html).toMatch(/<button[^>]*disabled=""[^>]*>/)
  expect(props.onTestConnection).not.toHaveBeenCalled()
  expect(props.onSaveStorage).not.toHaveBeenCalled()
  expect(JSON.stringify(props)).toBe(before)
})

it.each(uiLanguages)('localizes connection progress in %s and locks endpoint credentials while pending', (language) => {
  const html = render(language, { ...fixture(), workerBusy: true, workerToken: 'fixture-token' })
  expect(html).toContain(translateUi(language, 'settings.connecting'))
  expect(html).toMatch(/<input disabled="" value="http:\/\/127.0.0.1:43117"/)
  expect(html).toMatch(/type="password" autoComplete="off" disabled=""[^>]*value="fixture-token"/)
  expect(html).not.toContain(translateUi(language, 'settings.connected'))
})

it.each(uiLanguages)('preserves exact worker facts and escapes technical errors in %s', (language) => {
  const connected = render(language, { ...fixture(), workerHandshake: { workerId: 'test-worker', name: 'KINAOU Worker', version: 'test', managedRoots: ['KINAOU'], platform: 'darwin', capabilities: ['media-probe', 'local-llm'] } })
  expect(connected).toContain(translateUi(language, 'settings.connected'))
  expect(connected).toContain('media-probe')
  expect(connected).toContain('local-llm')
  expect(connected).not.toContain('video-generation')
  const failed = render(language, { ...fixture(), workerError: '<script>not markup</script>' })
  expect(failed).toContain(translateUi(language, 'settings.failed'))
  expect(failed).toContain(translateUi(language, 'common.details'))
  expect(failed).toContain('&lt;script&gt;not markup&lt;/script&gt;')
  expect(failed).not.toContain('<script>')
})

it('persists only the explicitly saved profile and preserves old profile on a blocked write', () => {
  const data = new Map<string, string>()
  let blocked = false
  const store: KeyValueStore = { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => { if (blocked) throw new Error('quota'); data.set(key, value) }, removeItem: (key) => { data.delete(key) } }
  const repo = new StorageSettingsRepository(store)
  const saved = configureWorkspaceRoot(defaultStorageSettings, '/Volumes/Original', 'desktop-worker')
  repo.save(saved)
  blocked = true
  const next = configureWorkspaceRoot(saved, '/Volumes/Draft', 'desktop-worker')
  expect(() => repo.save(next)).toThrow('quota')
  expect(repo.load()).toEqual(saved)
  expect([...data.keys()]).toEqual(['kinaou.storage.v1'])
  expect(JSON.stringify([...data.values()])).not.toContain('token')
})
