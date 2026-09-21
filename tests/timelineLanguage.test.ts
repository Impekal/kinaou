import { expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { TimelineEditor } from '../src/components/TimelineEditor'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import { createProjectFromInput } from '../src/core/create'
import { clipSchema, type KinaouAsset } from '../src/core/project'
import { applyTimelineOperation } from '../src/core/timeline'
import { commitTimelineChange, timelineTrimFits } from '../src/core/timelineEditing'
import { PersistentVersionHistory } from '../src/core/versioning'
import { uiLanguages } from '../src/core/uiLanguage'
import { translateUi } from '../src/core/uiMessages'

function fixture() {
  const project = createProjectFromInput({ title: 'Original project', kind: 'idea', content: '' })
  const track = project.tracks.find((entry) => entry.type === 'video')!
  track.name = 'Original track <script>'
  const asset: KinaouAsset = { id: 'media', kind: 'video', uri: 'KINAOU/Assets/test.mp4', managed: true, offline: true, metadata: { name: 'Untranslated media', durationMs: 10000 } }
  const clip = clipSchema.parse({ id: 'clip', assetId: asset.id, startMs: 1000, durationMs: 10000, speed: 1 })
  project.assets.push(asset); track.clips.push(clip)
  return { project, track, asset, clip }
}
function history() {
  const map = new Map<string, string>()
  return new PersistentVersionHistory({ getItem: (key) => map.get(key) ?? null, setItem: (key, value) => { map.set(key, value) }, removeItem: (key) => { map.delete(key) } })
}

it.each(uiLanguages)('renders all manual timeline control families in %s without rewriting project data', (language) => {
  const { project } = fixture(), before = JSON.stringify(project), persist = vi.fn()
  const html = renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: language, children: createElement(TimelineEditor, {
    project, history: history(), onProjectChange: persist, workerUrl: 'http://localhost:43117', workerToken: '', workerConnected: false
  }) }))
  for (const key of ['timeline.mute', 'timeline.lock', 'timeline.planning', 'timeline.split', 'timeline.shorten', 'timeline.scaleUp', 'timeline.cropX', 'timeline.resetFrame', 'timeline.remove', 'timeline.speedReset'] as const) expect(html).toContain(translateUi(language, key))
  expect(html).toContain(translateUi(language, 'timeline.playheadPosition', {
    time: (0).toLocaleString(language, { minimumFractionDigits: 3, maximumFractionDigits: 3 })
  }))
  expect(html).toContain('Original track &lt;script&gt;')
  expect(html).toContain('Untranslated media')
  expect(html).toContain('aria-label="' + translateUi(language, 'timeline.left') + '"')
  expect(html).toContain('aria-label="' + translateUi(language, 'timeline.dragHandle', { name: 'Untranslated media' }) + '"')
  expect(html).toContain('aria-label="' + translateUi(language, 'timeline.trimStartHandle', { name: 'Untranslated media' }) + '"')
  expect(html).toContain('aria-label="' + translateUi(language, 'timeline.trimEndHandle', { name: 'Untranslated media' }) + '"')
  expect(html).toContain('left:40px')
  expect(html).toContain('width:400px')
  expect(JSON.stringify(project)).toBe(before)
  expect(persist).not.toHaveBeenCalled()
})

it.each(uiLanguages)('disables source-overrun lengthening and speed reset in %s', (language) => {
  const { project, clip } = fixture()
  clip.durationMs = 20000; clip.speed = 0.5
  const html = renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: language, children: createElement(TimelineEditor, {
    project, history: history(), onProjectChange: vi.fn(), workerUrl: 'http://localhost:43117', workerToken: '', workerConnected: false
  }) }))
  expect(html).toContain(`disabled="">${translateUi(language, 'timeline.lengthen')}`)
  expect(html).toContain(`disabled="">${translateUi(language, 'timeline.speedReset')}`)
})

it('guards source duration, source offset, fades, transition span and the minimum trim', () => {
  const { asset, clip } = fixture()
  expect(timelineTrimFits(asset, clip, 1000)).toBe(false)
  expect(timelineTrimFits(asset, clip, -1000)).toBe(true)
  expect(timelineTrimFits(asset, { ...clip, durationMs: 5000, sourceOffsetMs: 5000 }, 1000)).toBe(false)
  expect(timelineTrimFits(asset, { ...clip, durationMs: 1000, fades: { inMs: 400, outMs: 400 } }, -1000)).toBe(false)
  expect(timelineTrimFits(asset, { ...clip, durationMs: 1000, transitionIn: { type: 'dissolve', durationMs: 500 } }, -1000)).toBe(false)
  expect(timelineTrimFits(asset, { ...clip, durationMs: 250 }, -1000)).toBe(false)
  expect(timelineTrimFits(asset, { ...clip, durationMs: 100 }, -1000)).toBe(false)
  expect(timelineTrimFits({ ...asset, kind: 'image' }, clip, 1000)).toBe(true)
})

it('commits an actual move only after saving the previous project and restores it reversibly', () => {
  const { project, track } = fixture(), versions = history(), persist = vi.fn((next) => {
    expect(versions.list(project.id)).toHaveLength(1)
    expect(next.tracks[0].clips[0].startMs).toBe(2000)
  })
  const next = commitTimelineChange(project, () => applyTimelineOperation(project, { type: 'move-clip', trackId: track.id, clipId: 'clip', startMs: 2000 }), versions, persist)
  expect(persist).toHaveBeenCalledWith(next)
  expect(project.tracks[0].clips[0].startMs).toBe(1000)
  const restored = versions.restoreReversibly(next, versions.list(project.id)[0].id)
  expect(restored.project.tracks[0].clips[0].startMs).toBe(1000)
  expect(restored.project.assets).toEqual(project.assets)
})

it('does not snapshot or persist an invalid or locked edit', () => {
  const { project, track } = fixture(), versions = history(), persist = vi.fn()
  const snapshot = vi.spyOn(versions, 'snapshot')
  track.locked = true
  expect(() => commitTimelineChange(project, () => applyTimelineOperation(project, { type: 'move-clip', trackId: track.id, clipId: 'clip', startMs: 2000 }), versions, persist)).toThrow('locked')
  expect(() => commitTimelineChange(project, () => ({ ...project, title: '' }), versions, persist)).toThrow()
  expect(snapshot).not.toHaveBeenCalled()
  expect(persist).not.toHaveBeenCalled()
})

it('surfaces history and persistence failures without false completion', () => {
  const { project } = fixture(), versions = history(), persist = vi.fn()
  vi.spyOn(versions, 'snapshot').mockImplementationOnce(() => { throw new Error('history quota') })
  expect(() => commitTimelineChange(project, () => project, versions, persist)).toThrow('history quota')
  expect(persist).not.toHaveBeenCalled()
  expect(() => commitTimelineChange(project, () => project, versions, () => { throw new Error('project quota') })).toThrow('project quota')
  expect(versions.list(project.id)).toHaveLength(1)
})
