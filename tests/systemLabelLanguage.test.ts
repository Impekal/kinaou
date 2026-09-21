import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { VersionHistoryPanel } from '../src/components/VersionHistoryPanel'
import { ExportHistoryPanel } from '../src/components/ExportHistoryPanel'
import { PublishPanel } from '../src/components/PublishPanel'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import { createProjectFromInput } from '../src/core/create'
import { recordSuccessfulExport } from '../src/core/exportHistory'
import { type KeyValueStore } from '../src/core/persistence'
import { PersistentVersionHistory } from '../src/core/versioning'
import { uiLanguages, type UiLanguage } from '../src/core/uiLanguage'
import { translateUi } from '../src/core/uiMessages'
import { displayExportReceiptLabel, displaySystemHistoryLabel, displayTrackName } from '../src/core/uiSystemLabels'

function memoryStore(): KeyValueStore {
  const map = new Map<string, string>()
  return {
    getItem: key => map.get(key) ?? null,
    setItem: (key, value) => { map.set(key, value) },
    removeItem: key => { map.delete(key) }
  }
}

const t = (language: UiLanguage) => (
  key: Parameters<typeof translateUi>[1],
  values?: Parameters<typeof translateUi>[2]
) => translateUi(language, key, values)

describe('stored KINAOU system-label display localization', () => {
  it.each(uiLanguages)('localizes only recognized system history labels in %s', (language) => {
    const translate = t(language)

    expect(displaySystemHistoryLabel({ source: 'system', label: 'Before saving generated image' }, translate))
      .toBe(translateUi(language, 'history.system.generatedImage'))

    expect(displaySystemHistoryLabel({ source: 'system', label: 'Before Director plan: Original plan' }, translate))
      .toBe(translateUi(language, 'history.system.directorPlan', { name: 'Original plan' }))

    expect(displaySystemHistoryLabel({ source: 'system', label: 'Unknown system checkpoint' }, translate))
      .toBe('Unknown system checkpoint')

    expect(displaySystemHistoryLabel({ source: 'user', label: 'Before saving generated image' }, translate))
      .toBe('Before saving generated image')
  })

  it.each(uiLanguages)('renders translated system history without rewriting stored labels in %s', (language) => {
    const project = createProjectFromInput({ title: 'Original project', kind: 'idea', content: '' })
    const history = new PersistentVersionHistory(memoryStore())

    history.snapshot(project, 'Before saving generated image', 'system')
    history.snapshot(project, 'User checkpoint', 'user')
    const before = JSON.stringify(history.list(project.id))

    const html = renderToStaticMarkup(createElement(UiLanguageProvider, {
      initialLanguage: language,
      children: createElement(VersionHistoryPanel, {
        project,
        history,
        onProjectChange: vi.fn()
      })
    }))

    expect(html).toContain(translateUi(language, 'history.system.generatedImage'))
    expect(html).toContain('User checkpoint')
    expect(JSON.stringify(history.list(project.id))).toBe(before)
  })

  it.each(uiLanguages)('localizes only KINAOU whole/custom export labels in %s', (language) => {
    const translate = t(language)

    expect(displayExportReceiptLabel({
      label: 'Whole timeline',
      sceneIds: [],
      courseLesson: undefined
    }, translate)).toBe(translateUi(language, 'export.receiptWhole'))

    expect(displayExportReceiptLabel({
      label: 'Custom range 1.000–4.500 s',
      sceneIds: [],
      courseLesson: undefined
    }, translate)).toBe(translateUi(language, 'export.receiptRange', { start: '1.000', end: '4.500' }))

    expect(displayExportReceiptLabel({
      label: 'Whole timeline',
      sceneIds: ['user-scene'],
      courseLesson: undefined
    }, translate)).toBe('Whole timeline')
  })

  it.each(uiLanguages)('renders export history and Publish with localized system labels without changing receipts in %s', (language) => {
    let project = createProjectFromInput({ title: 'Original project', kind: 'idea', content: '' })
    project = recordSuccessfulExport(project, {
      jobId: 'whole',
      label: 'Whole timeline',
      outputRelativePath: 'KINAOU/Renders/whole.mp4',
      format: 'landscape',
      range: { inMs: 0, outMs: 5000 },
      sceneIds: [],
      durationMs: 5000,
      completedAt: '2026-09-21T20:00:00.000Z'
    })
    project = recordSuccessfulExport(project, {
      jobId: 'custom',
      label: 'Custom range 1.000–4.500 s',
      outputRelativePath: 'KINAOU/Renders/custom.mp4',
      format: 'vertical',
      range: { inMs: 1000, outMs: 4500 },
      sceneIds: [],
      durationMs: 3500,
      completedAt: '2026-09-21T20:01:00.000Z'
    })

    const before = JSON.stringify(project)

    const historyHtml = renderToStaticMarkup(createElement(UiLanguageProvider, {
      initialLanguage: language,
      children: createElement(ExportHistoryPanel, {
        project,
        workerUrl: 'http://127.0.0.1:43117',
        workerToken: '',
        workerConnected: false,
        busy: false,
        onProjectChange: vi.fn()
      })
    }))

    const publishHtml = renderToStaticMarkup(createElement(UiLanguageProvider, {
      initialLanguage: language,
      children: createElement(PublishPanel, {
        project,
        workerUrl: 'http://127.0.0.1:43117',
        workerToken: '',
        workerConnected: false,
        workerCapabilities: [],
        onProjectChange: vi.fn()
      })
    }))

    for (const html of [historyHtml, publishHtml]) {
      expect(html).toContain(translateUi(language, 'export.receiptWhole'))
      expect(html).toContain(translateUi(language, 'export.receiptRange', { start: '1.000', end: '4.500' }))
    }

    expect(JSON.stringify(project)).toBe(before)
  })

  it.each(uiLanguages)('localizes only exact default track names in %s', (language) => {
    const translate = t(language)
    const project = createProjectFromInput({ title: 'Project', kind: 'idea', content: '' })

    const expected = {
      video: 'track.default.video',
      voice: 'track.default.voice',
      music: 'track.default.music',
      caption: 'track.default.caption'
    } as const

    for (const track of project.tracks) {
      expect(displayTrackName(track, translate))
        .toBe(translateUi(language, expected[track.type as keyof typeof expected]))
    }

    expect(displayTrackName({ type: 'video', name: 'Original custom track' }, translate))
      .toBe('Original custom track')
  })
})
