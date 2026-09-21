import { expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { CapturePanel, captureStateKeys } from '../src/components/CapturePanel'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import { assetSchema, createProject } from '../src/core/project'
import { uiLanguages } from '../src/core/uiLanguage'
import { translateUi } from '../src/core/uiMessages'
import { PersistentVersionHistory } from '../src/core/versioning'

function store() {
  const data = new Map<string, string>()
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value) },
    removeItem: (key: string) => { data.delete(key) },
  }
}

function fixture() {
  const project = createProject('Original project')
  project.assets.push(
    assetSchema.parse({
      id: 'screen',
      kind: 'image',
      uri: 'KINAOU/Assets/Captures/original.png',
      managed: true,
      metadata: { name: 'Original screen <keep>', captured: true, captureMethod: 'macos-screencapture', displayId: 2 },
    }),
    assetSchema.parse({
      id: 'web',
      kind: 'image',
      uri: 'KINAOU/Assets/WebCaptures/original.png',
      managed: true,
      metadata: { name: 'Original web <keep>', captured: true, captureMethod: 'headless-browser', url: 'https://example.org/Original-URL' },
    }),
  )
  return project
}

it.each(uiLanguages)('renders screen and web capture controls in %s without rewriting captured data', (language) => {
  const project = fixture()
  const before = JSON.stringify(project)
  const onProjectChange = vi.fn()
  const html = renderToStaticMarkup(createElement(UiLanguageProvider, {
    initialLanguage: language,
    children: createElement(CapturePanel, {
      project,
      history: new PersistentVersionHistory(store()),
      workerUrl: 'http://127.0.0.1:43117',
      workerToken: '',
      workerConnected: false,
      workerCapabilities: [],
      onProjectChange,
    }),
  }))

  for (const key of [
    'capture.eyebrow',
    'capture.heading',
    'capture.unavailable',
    'capture.unavailableDisconnected',
    'capture.type',
    'capture.type.screenshot',
    'capture.type.recording',
    'capture.target',
    'capture.target.display',
    'capture.target.interactive',
    'capture.target.app',
    'capture.startScreenshot',
    'capture.web.eyebrow',
    'capture.web.heading',
    'capture.web.detect',
    'capture.web.browser',
    'capture.web.url',
    'capture.library.eyebrow',
    'capture.library.real',
  ] as const) expect(html).toContain(translateUi(language, key))

  expect(html).toContain('Original screen &lt;keep&gt;')
  expect(html).toContain('Original web &lt;keep&gt;')
  expect(html).toContain('https://example.org/Original-URL')
  expect(JSON.stringify(project)).toBe(before)
  expect(onProjectChange).not.toHaveBeenCalled()
})

it.each(uiLanguages)('has translated capture lifecycle states and connected-worker capability guidance in %s', (language) => {
  for (const key of Object.values(captureStateKeys)) expect(translateUi(language, key)).toBeTruthy()

  const project = createProject('Capability project')
  const html = renderToStaticMarkup(createElement(UiLanguageProvider, {
    initialLanguage: language,
    children: createElement(CapturePanel, {
      project,
      history: new PersistentVersionHistory(store()),
      workerUrl: 'http://127.0.0.1:43117',
      workerToken: '',
      workerConnected: true,
      workerCapabilities: [],
      onProjectChange: vi.fn(),
    }),
  }))

  expect(html).toContain(translateUi(language, 'capture.unavailableCapability'))
})
