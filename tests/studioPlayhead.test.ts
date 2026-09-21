import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'

import { PreviewPlayback } from '../src/components/PreviewFeedback'
import { TimelineEditor } from '../src/components/TimelineEditor'
import { TimelinePreview } from '../src/components/TimelinePreview'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'

import { createProjectFromInput } from '../src/core/create'
import { clipSchema, type KinaouAsset } from '../src/core/project'
import { PersistentVersionHistory } from '../src/core/versioning'
import { uiLanguages } from '../src/core/uiLanguage'
import { translateUi } from '../src/core/uiMessages'

function history() {
  const map = new Map<string, string>()
  return new PersistentVersionHistory({
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => { map.set(key, value) },
    removeItem: (key) => { map.delete(key) }
  })
}

function project() {
  const value = createProjectFromInput({
    title: 'Linked playhead',
    kind: 'idea',
    content: ''
  })

  const track = value.tracks.find((entry) => entry.type === 'video')!
  const asset: KinaouAsset = {
    id: 'media',
    kind: 'video',
    uri: 'KINAOU/Assets/video.mp4',
    managed: true,
    offline: false,
    metadata: { name: 'Original media', durationMs: 10000 }
  }

  value.assets.push(asset)
  track.clips.push(clipSchema.parse({
    id: 'clip',
    assetId: asset.id,
    startMs: 1000,
    durationMs: 5000
  }))

  return value
}

it.each(uiLanguages)('renders the same controlled Studio playhead in timeline and playback in %s', (language) => {
  const saved = project()
  const onPlayheadChange = vi.fn()

  const timeline = renderToStaticMarkup(createElement(UiLanguageProvider, {
    initialLanguage: language,
    children: createElement(TimelineEditor, {
      project: saved,
      history: history(),
      onProjectChange: vi.fn(),
      workerUrl: '',
      workerToken: '',
      workerConnected: false,
      playheadMs: 2500,
      onPlayheadChange
    })
  }))

  expect(timeline).toContain('value="2500"')
  expect(timeline).toContain('class="timelinePlayheadLine" aria-hidden="true" style="left:100px"')
  expect(timeline).toContain(translateUi(language, 'timeline.playheadPosition', {
    time: (2.5).toLocaleString(language, { minimumFractionDigits: 3, maximumFractionDigits: 3 })
  }))

  const playback = renderToStaticMarkup(createElement(UiLanguageProvider, {
    initialLanguage: language,
    children: createElement(PreviewPlayback, {
      url: 'blob:preview',
      durationSeconds: 10,
      playheadSeconds: 2.5,
      onPlayheadChange: (seconds: number) => onPlayheadChange(Math.round(seconds * 1000))
    })
  }))

  expect(playback).toContain('value="2.5"')
  expect(playback).toContain(translateUi(language, 'preview.playhead', {
    time: (2.5).toLocaleString(language, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }))

  expect(onPlayheadChange).not.toHaveBeenCalled()
})

it.each(uiLanguages)('explains linked playhead behavior without claiming real-time rendering in %s', (language) => {
  const html = renderToStaticMarkup(createElement(UiLanguageProvider, {
    initialLanguage: language,
    children: createElement(TimelinePreview, {
      project: project(),
      workerUrl: '',
      workerToken: '',
      workerConnected: false,
      workerCapabilities: [],
      playheadMs: 2500,
      onPlayheadChange: vi.fn()
    })
  }))

  expect(html).toContain(translateUi(language, 'preview.playheadLinked'))
  expect(html).toContain(translateUi(language, 'preview.connect'))
})
