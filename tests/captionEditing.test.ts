import { expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { CaptionEditor } from '../src/components/CaptionEditor'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import { captionDraftInput, commitCaptionChange } from '../src/core/captionEditing'
import { addCaption, addTranscriptCaptions, updateCaptionText } from '../src/core/captions'
import { createProjectFromInput } from '../src/core/create'
import { PersistentVersionHistory } from '../src/core/versioning'
import { uiLanguages } from '../src/core/uiLanguage'
import { translateUi } from '../src/core/uiMessages'
import { createRenderPlan, preview1080pPreset } from '../src/core/render'

function project() { return createProjectFromInput({ title: 'Original title', kind: 'idea', content: '' }) }
function history() {
  const values = new Map<string, string>()
  return new PersistentVersionHistory({ getItem: (key) => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value) }, removeItem: (key) => { values.delete(key) } })
}

it.each(uiLanguages)('renders caption authoring in %s without rewriting saved text', (language) => {
  const saved = addCaption(project(), { text: 'Grüße & bonjour <script>', startMs: 1250, durationMs: 2000 })
  saved.assets.push({ id: 'transcript', kind: 'document', uri: 'KINAOU/Projects/Transcripts/t.json', managed: true, offline: false, metadata: { name: 'Original transcript', transcript: { schemaVersion: 1, adapterId: 'whisper.cpp', language: 'fr', text: 'Bonjour', segments: [{ startMs: 0, endMs: 1000, text: 'Bonjour' }] } } })
  const before = JSON.stringify(saved), persist = vi.fn()
  const html = renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: language, children: createElement(CaptionEditor, { project: saved, history: history(), onProjectChange: persist }) }))
  for (const key of ['caption.heading', 'caption.add', 'caption.save', 'caption.discard', 'caption.select', 'caption.styleHeading', 'caption.styleApply'] as const) expect(html).toContain(translateUi(language, key))
  expect(html).toContain('Grüße &amp; bonjour &lt;script&gt;')
  expect(html).toContain('Original transcript')
  expect(JSON.stringify(saved)).toBe(before)
  expect(persist).not.toHaveBeenCalled()
})

it.each(uiLanguages)('explains locked and missing caption tracks in %s', (language) => {
  const saved = project()
  const render = () => renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: language, children: createElement(CaptionEditor, { project: saved, history: history(), onProjectChange: vi.fn() }) }))
  saved.tracks.find((track) => track.type === 'caption')!.locked = true
  expect(render()).toContain(translateUi(language, 'caption.locked'))
  saved.tracks = []
  expect(render()).toContain(translateUi(language, 'caption.noTrack'))
})

it.each([
  [' ', '0', '3'], ['text', '', '3'], ['text', '0', ''], ['text', '-0.0001', '1'],
  ['text', 'NaN', '1'], ['text', 'Infinity', '1'], ['text', '0', '0'], ['text', '0', '0.0001'],
  ['text', '0', '-1'], ['text', '0', 'Infinity'], ['text', '1e20', '2']
])('rejects an invalid caption draft (%s, %s, %s)', (text, start, duration) => {
  expect(captionDraftInput(text, start, duration)).toBeNull()
})

it('rounds fractional seconds, preserves text and reaches the actual render plan', () => {
  const input = captionDraftInput(' Original texte ', '1.2345', '2.6789')!
  expect(input).toEqual({ text: ' Original texte ', startMs: 1235, durationMs: 2679 })
  const plan = createRenderPlan(addCaption(project(), input), preview1080pPreset, 'KINAOU/Renders/caption-test.mp4')
  expect(plan.clips[0]).toMatchObject({ startMs: 1235, durationMs: 2679, asset: { kind: 'caption', metadata: { text: 'Original texte' } } })
})

it('validates before snapshot and persists only after the safety version', () => {
  const saved = project(), versions = history(), order: string[] = []
  const snapshot = vi.spyOn(versions, 'snapshot')
  expect(() => commitCaptionChange(saved, () => { throw new Error('invalid') }, versions, vi.fn(), 'test')).toThrow('invalid')
  expect(snapshot).not.toHaveBeenCalled()
  const next = commitCaptionChange(saved, () => { order.push('calculate'); return addCaption(saved, { text: 'Test', startMs: 0, durationMs: 1000 }) }, versions, () => { expect(versions.list(saved.id)).toHaveLength(1); order.push('persist') }, 'Before caption')
  expect(order).toEqual(['calculate', 'persist'])
  expect(next.assets).toHaveLength(1)
  expect(versions.list(saved.id)[0].project).toEqual(saved)
})

it('does not persist when the safety snapshot fails and surfaces persistence failures', () => {
  const saved = project(), versions = history(), persist = vi.fn()
  const change = () => addCaption(saved, { text: 'Keep draft', startMs: 0, durationMs: 1000 })
  vi.spyOn(versions, 'snapshot').mockImplementationOnce(() => { throw new Error('history quota') })
  expect(() => commitCaptionChange(saved, change, versions, persist, 'Before caption')).toThrow('history quota')
  expect(persist).not.toHaveBeenCalled()
  expect(() => commitCaptionChange(saved, change, versions, () => { throw new Error('project quota') }, 'Before caption')).toThrow('project quota')
  expect(versions.list(saved.id)).toHaveLength(1)
  expect(saved.assets).toHaveLength(0)
})

it('rejects text edits to assets referenced by any locked track without modifying the project', () => {
  const saved = addCaption(project(), { text: 'Original', startMs: 0, durationMs: 1000 })
  const track = saved.tracks.find((item) => item.type === 'caption')!
  saved.tracks.push({ ...track, id: 'shared-locked', locked: true })
  const before = JSON.stringify(saved)
  expect(() => updateCaptionText(saved, track.clips[0].assetId, 'Changed')).toThrow('locked')
  expect(JSON.stringify(saved)).toBe(before)
})

it('imports only reviewed transcript segments with exact timing and retained provenance', () => {
  const saved = project(), versions = history()
  saved.assets.push({ id: 't', kind: 'document', uri: 'KINAOU/Projects/Transcripts/t.json', managed: true, offline: false, metadata: { transcript: { schemaVersion: 1, adapterId: 'whisper.cpp', language: 'fr', text: 'Un Deux', segments: [{ startMs: 100, endMs: 1000, text: 'Un' }, { startMs: 2000, endMs: 3500, text: 'Deux' }] } } })
  const persist = vi.fn()
  const next = commitCaptionChange(saved, () => addTranscriptCaptions(saved, 't', [1]), versions, persist, 'Before transcript')
  expect(next.assets.at(-1)?.metadata).toMatchObject({ text: 'Deux', transcriptAssetId: 't', transcriptSegmentIndex: 1, adapterId: 'whisper.cpp' })
  expect(next.tracks.find((track) => track.type === 'caption')!.clips[0]).toMatchObject({ startMs: 2000, durationMs: 1500 })
  expect(persist).toHaveBeenCalledWith(next)
  expect(versions.list(saved.id)).toHaveLength(1)
})
