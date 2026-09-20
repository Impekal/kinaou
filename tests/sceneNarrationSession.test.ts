import { expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createProject, parseProject, type KinaouProject } from '../src/core/project'
import { SceneNarrationSession, type NarrationFeedback } from '../src/core/sceneNarrationSession'
import { planSceneVoiceovers } from '../src/core/sceneVoiceover'
import { fitScenesToNarration } from '../src/core/narrationFit'
import { commitStoryboardChange } from '../src/core/storyboardEditing'
import { PersistentVersionHistory } from '../src/core/versioning'
import type { TtsJobRecord } from '../src/core/ttsJobs'
import { SceneVoiceoverPanel } from '../src/components/SceneVoiceoverPanel'
import { PiperVoiceSelect } from '../src/components/PiperVoiceSelect'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import { uiLanguages } from '../src/core/uiLanguage'
import { translateUi } from '../src/core/uiMessages'

const voice = 'KINAOU/Models/local.onnx'
function fixture() {
  return parseProject({ ...createProject('Original project'), assets: [{ id: 'image', kind: 'image', managed: true, uri: 'KINAOU/Assets/image.png' }],
    tracks: [{ id: 'visual', name: 'Original <track>', type: 'video', clips: [{ id: 'clip', assetId: 'image', sceneId: 'scene', startMs: 0, durationMs: 1000 }] }, { id: 'voice', name: 'Original voice', type: 'voice', clips: [] }],
    storyboard: [{ id: 'scene', title: 'Original <scene>', narration: 'Spoken words, not visual directions', description: 'Visual directions', assetId: 'image', durationMs: 1000 }] })
}
const job = (state: TtsJobRecord['state'] = 'succeeded', id = 'job'): TtsJobRecord => ({ id, state, progress: state === 'succeeded' ? 1 : 0, createdAt: '', updatedAt: '', voicePath: voice, audioPath: `KINAOU/Assets/GeneratedVoice/${id}.wav`, durationMs: 2000, sizeBytes: 1000 })
function history() {
  const data = new Map<string, string>()
  return new PersistentVersionHistory({ getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value) }, removeItem: key => { data.delete(key) } })
}
function harness(project = fixture()) {
  let current = project
  const states: NarrationFeedback[] = [], order: string[] = [], versions = history()
  const client = { startTts: vi.fn(async () => job()), ttsStatus: vi.fn(async () => job()) }
  const snapshot = vi.fn(() => { order.push('snapshot'); versions.snapshot(project, 'Before narration', 'system') })
  const persist = vi.fn((next: KinaouProject) => { order.push('persist'); current = next })
  const run = new SceneNarrationSession(project, 'visual', 'voice', voice, { client, current: expected => expected === current, snapshot, persist, publish: state => { states.push(state); order.push(state.phase) }, wait: async () => {} })
  return { run, client, states, order, snapshot, persist, versions, get current() { return current }, change: (next: KinaouProject) => { current = next } }
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r }); return { promise, resolve } }

it.each(uiLanguages)('renders honest narration controls and original content in %s', language => {
  const project = fixture(), before = JSON.stringify(project)
  const html = renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: language, children: createElement(SceneVoiceoverPanel, { project, history: history(), workerUrl: 'http://127.0.0.1:43117', workerToken: '', workerConnected: false, workerCapabilities: [], onProjectChange: vi.fn() }) }))
  for (const key of ['narration.heading', 'narration.quality', 'narration.unavailable', 'narration.scopeHelp'] as const) expect(html).toContain(translateUi(language, key))
  expect(html).toContain('Original &lt;track&gt;'); expect(html).toContain(`disabled="">${translateUi(language, 'narration.start')}`)
  expect(JSON.stringify(project)).toBe(before)
})
it.each(uiLanguages)('localizes declared voice language without renaming files in %s', uiLanguage => {
  const html = renderToStaticMarkup(createElement(PiperVoiceSelect, { uiLanguage, language: 'de', voices: [{ path: voice, locale: 'fr-FR' }, { path: 'KINAOU/Models/unknown.onnx', locale: null }], value: voice, onChange: vi.fn() }))
  expect(html).toContain('local.onnx'); expect(html).toContain(translateUi(uiLanguage, 'narration.differs', { locale: 'fr-FR' }))
  expect(html).toContain(translateUi(uiLanguage, 'narration.unknown')); expect(html).toContain('Deutsch')
})
it('saves real project narration before reporting success and preserves original speech', async () => {
  const h = harness()
  await h.run.run()
  expect(h.client.startTts).toHaveBeenCalledWith('Spoken words, not visual directions', voice)
  expect(h.states.at(-1)).toMatchObject({ phase: 'complete', done: [{ narrationMs: 2000, overrunMs: 1000 }] })
  expect(h.order.indexOf('snapshot')).toBeLessThan(h.order.indexOf('starting'))
  expect(h.order.indexOf('persist')).toBeLessThan(h.order.indexOf('complete'))
  expect(h.current.tracks[1].clips[0]).toMatchObject({ startMs: 0, durationMs: 2000 })
  expect(h.versions.restoreReversibly(h.current, h.versions.list(h.current.id)[0].id).project.tracks).toEqual(fixture().tracks)
})
it('does no work or history write for intentionally silent scenes', async () => {
  const project = fixture(); project.storyboard[0].narration = ''
  const h = harness(project); await h.run.run()
  expect(h.client.startTts).not.toHaveBeenCalled(); expect(h.snapshot).not.toHaveBeenCalled()
  expect(h.states.at(-1)).toMatchObject({ phase: 'complete', done: [], skipped: [{ code: 'silent' }] })
})
it('does not start synthesis when safety history fails and retries safely', async () => {
  const h = harness(); h.snapshot.mockImplementationOnce(() => { throw new Error('history full') })
  await h.run.run(); expect(h.client.startTts).not.toHaveBeenCalled()
  expect(h.states.at(-1)?.phase).toBe('saveFailed')
  await h.run.run(); expect(h.client.startTts).toHaveBeenCalledTimes(1)
  expect(h.states.at(-1)?.phase).toBe('complete')
})
it('does not count an unsaved scene and retries the same completed result', async () => {
  const h = harness(); h.persist.mockImplementationOnce(() => { throw new Error('storage full') })
  await h.run.run(); expect(h.states.at(-1)).toMatchObject({ phase: 'saveFailed', done: [] })
  await h.run.run(); expect(h.client.startTts).toHaveBeenCalledTimes(1)
  expect(h.snapshot).toHaveBeenCalledTimes(1); expect(h.current.tracks[1].clips).toHaveLength(1)
})
it('resumes polling the same accepted job after a network error', async () => {
  const h = harness(); h.client.startTts.mockResolvedValue(job('queued'))
  h.client.ttsStatus.mockRejectedValueOnce(new Error('offline'))
  await h.run.run(); expect(h.states.at(-1)?.phase).toBe('pollFailed')
  await h.run.run(); expect(h.client.startTts).toHaveBeenCalledTimes(1)
  expect(h.client.ttsStatus.mock.calls).toEqual([['job'], ['job']])
  expect(h.states.at(-1)?.phase).toBe('complete')
})
it('never automatically resubmits an uncertain start', async () => {
  const h = harness(); h.client.startTts.mockRejectedValue(new Error('response lost'))
  await h.run.run(); await h.run.run()
  expect(h.client.startTts).toHaveBeenCalledTimes(1); expect(h.persist).not.toHaveBeenCalled()
  expect(h.states.at(-1)?.phase).toBe('startFailed')
})
it.each(['detach', 'edit'] as const)('discards a late start after %s', async reason => {
  const h = harness(), pending = deferred<TtsJobRecord>()
  h.client.startTts.mockReturnValue(pending.promise)
  const running = h.run.run()
  if (reason === 'detach') h.run.detach(); else h.change({ ...h.current, title: 'New edit' })
  pending.resolve(job()); await running
  expect(h.persist).not.toHaveBeenCalled(); expect(h.states.at(-1)?.phase).toBe('starting')
})
it('discards a late poll after a timeline edit', async () => {
  const h = harness(), pending = deferred<TtsJobRecord>()
  h.client.startTts.mockResolvedValue(job('queued')); h.client.ttsStatus.mockReturnValue(pending.promise)
  const running = h.run.run()
  await vi.waitFor(() => expect(h.client.ttsStatus).toHaveBeenCalled())
  h.change({ ...h.current, title: 'Keep this edit' }); pending.resolve(job()); await running
  expect(h.persist).not.toHaveBeenCalled(); expect(h.current.title).toBe('Keep this edit')
})
it('refuses a mismatched job response without placing it', async () => {
  const h = harness(); h.client.startTts.mockResolvedValue(job('queued')); h.client.ttsStatus.mockResolvedValue(job('succeeded', 'other'))
  await h.run.run(); expect(h.persist).not.toHaveBeenCalled(); expect(h.states.at(-1)?.phase).toBe('pollFailed')
})
it.each(['failed', 'cancelled'] as const)('reports %s as skipped, never saved', async state => {
  const h = harness(); h.client.startTts.mockResolvedValue(job(state))
  await h.run.run(); expect(h.persist).not.toHaveBeenCalled()
  expect(h.states.at(-1)).toMatchObject({ phase: 'complete', done: [], skipped: [{ code: state }] })
})
it('retains earlier saved scenes when a later request fails', async () => {
  const project = fixture()
  project.storyboard.push({ ...project.storyboard[0], id: 'second' })
  project.tracks[0].clips.push({ ...project.tracks[0].clips[0], id: 'second-clip', sceneId: 'second', startMs: 1000 })
  const h = harness(project); h.client.startTts.mockResolvedValueOnce(job()).mockRejectedValueOnce(new Error('later failed'))
  await h.run.run()
  expect(h.current.tracks[1].clips).toHaveLength(1); expect(h.states.at(-1)).toMatchObject({ phase: 'startFailed', done: [{ sceneId: 'scene' }] })
})
it('serializes repeated run requests while a start is in flight', async () => {
  const h = harness(), pending = deferred<TtsJobRecord>(); h.client.startTts.mockReturnValue(pending.promise)
  const first = h.run.run(); await h.run.run()
  expect(h.client.startTts).toHaveBeenCalledTimes(1); pending.resolve(job()); await first
})
it('makes actual narration fit reversible and refuses locked edits before snapshot', async () => {
  const h = harness(); await h.run.run()
  const versions = history(), persist = vi.fn()
  const result = commitStoryboardChange(h.current, () => fitScenesToNarration(h.current, 'visual', 'voice'), versions, persist, 'Fit')
  expect(result.project.tracks[0].clips[0].durationMs).toBe(2000)
  expect(versions.restoreReversibly(result.project, versions.list(h.current.id)[0].id).project.tracks).toEqual(h.current.tracks)
  h.current.tracks[0].locked = true
  const count = versions.list(h.current.id).length
  expect(() => commitStoryboardChange(h.current, () => fitScenesToNarration(h.current, 'visual', 'voice'), versions, persist, 'Fit')).toThrow('locked')
  expect(versions.list(h.current.id)).toHaveLength(count)
})
it('provides translated stable skip codes with original track names', () => {
  const p = fixture(); p.tracks[0].clips = []
  expect(planSceneVoiceovers(p, 'visual').skipped[0]).toMatchObject({ code: 'unplaced', values: { track: 'Original <track>' } })
})
