import { expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ProjectAssetList } from '../src/components/ProjectAssetList'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import { assetSchema, createProject, type KinaouAsset } from '../src/core/project'
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
  const kinds: KinaouAsset['kind'][] = ['video', 'image', 'audio', 'caption', 'document', 'other']
  project.assets = kinds.map((kind, index) => assetSchema.parse({
    id: `asset-${kind}`,
    kind,
    uri: index === 1 ? 'external://Original planning reference' : `KINAOU/Assets/Original-${kind}.dat`,
    managed: index !== 1,
    offline: index === 2,
    metadata: { name: `Original ${kind} <keep>` },
  }))
  return project
}

it.each(uiLanguages)('renders the project asset list in %s without rewriting names, paths or project data', (language) => {
  const project = fixture()
  const before = JSON.stringify(project)
  const onProjectChange = vi.fn()
  const html = renderToStaticMarkup(createElement(UiLanguageProvider, {
    initialLanguage: language,
    children: createElement(ProjectAssetList, {
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
    'assetList.projectAssets',
    'assetList.managed',
    'assetList.external',
    'assetList.available',
    'assetList.offline',
    'assetList.kind.video',
    'assetList.kind.image',
    'assetList.kind.audio',
    'assetList.kind.caption',
    'assetList.kind.document',
    'assetList.kind.other',
  ] as const) expect(html).toContain(translateUi(language, key))

  for (const kind of ['video', 'image', 'audio', 'caption', 'document', 'other']) {
    expect(html).toContain(`Original ${kind} &lt;keep&gt;`)
  }
  expect(html).toContain('KINAOU/Assets/Original-video.dat')
  expect(html).toContain('external://Original planning reference')
  expect(JSON.stringify(project)).toBe(before)
  expect(onProjectChange).not.toHaveBeenCalled()
})

it.each(uiLanguages)('renders the empty project asset state in %s', (language) => {
  const project = createProject('Empty project')
  const html = renderToStaticMarkup(createElement(UiLanguageProvider, {
    initialLanguage: language,
    children: createElement(ProjectAssetList, {
      project,
      history: new PersistentVersionHistory(store()),
      workerUrl: 'http://127.0.0.1:43117',
      workerToken: '',
      workerConnected: false,
      workerCapabilities: [],
      onProjectChange: vi.fn(),
    }),
  }))
  expect(html).toContain(translateUi(language, 'assetList.empty'))
})
