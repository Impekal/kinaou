import { expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { AudioStudioSession, type AudioFeedback, type AudioPhase } from '../src/core/audioStudioSession'
import { createProject, type KinaouProject } from '../src/core/project'
import { ProjectRepository } from '../src/core/persistence'
import { PersistentVersionHistory } from '../src/core/versioning'
import type { TtsJobRecord } from '../src/core/ttsJobs'
import { AudioStudioPanel } from '../src/components/AudioStudioPanel'
import { AudioJobStatus } from '../src/components/AudioJobStatus'
import { AssetPlacementControl } from '../src/components/AssetPlacementControl'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import { uiLanguages } from '../src/core/uiLanguage'
import { translateUi } from '../src/core/uiMessages'

const voice = 'KINAOU/Models/test.onnx'
const job = (state: TtsJobRecord['state'] = 'succeeded'): TtsJobRecord => ({ id: 'job', state, progress: state === 'succeeded' ? 1 : 0.1, voicePath: voice, createdAt: '2026-09-21T00:00:00Z', updatedAt: '2026-09-21T00:00:01Z', ...(state === 'succeeded' ? { audioPath: 'KINAOU/Assets/GeneratedVoice/job.wav', durationMs: 1250, sizeBytes: 1000 } : {}) })
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r }); return { promise, resolve } }
function fixture() {
  const data = new Map<string, string>()
  const store = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value) }, removeItem: (key: string) => { data.delete(key) } }
  const repository = new ProjectRepository(store), history = new PersistentVersionHistory(store)
  let project = repository.save(createProject('Original <title>')), connection = 'original'
  const states: AudioFeedback[] = []
  const client = { startTts: vi.fn(async (_text: string, _voice: string) => job()), ttsStatus: vi.fn(async (_id: string) => job()), cancelTts: vi.fn(async (_id: string) => job('cancelled')) }
  const snapshot = vi.fn((value: KinaouProject) => { history.snapshot(value, 'Before voice', 'system') })
  const persist = vi.fn((value: KinaouProject) => { project = repository.save(value) })
  const session = new AudioStudioSession(project, connection, ' Original words <script> ', voice, { client, environment: () => ({ project, connection }), snapshot, persist, publish: value => states.push(value), wait: async () => {} })
  return { session, states, client, snapshot, persist, history, repository, get project() { return project }, edit: (value: KinaouProject) => { project = value; session.observe(project, connection) }, connect: (value: string) => { connection = value; session.observe(project, connection) } }
}
it('saves original narration once with attribution, real repository reload and reversible safety history', async () => {
  const f = fixture(); await f.session.run(); await f.session.run()
  expect(f.client.startTts.mock.calls).toEqual([['Original words <script>', voice]])
  expect(f.states.map(s => s.phase)).toEqual(['starting', 'saving', 'succeeded'])
  expect(f.repository.load(f.project.id)?.assets[0].metadata).toMatchObject({ sourceText: 'Original words <script>', voicePath: voice, ttsJobId: 'job' })
  expect(f.persist).toHaveBeenCalledTimes(1)
  expect(f.history.restoreReversibly(f.project, f.history.list(f.project.id)[0].id).project.assets).toHaveLength(0)
})
it.each(['snapshot', 'persist'] as const)('recovers a %s failure by saving only, never another synthesis', async part => {
  const f = fixture(); f[part].mockImplementationOnce(() => { throw Error('storage full') })
  await f.session.run()
  expect(f.states.at(-1)?.phase).toBe('saveFailed'); expect(f.project.assets).toHaveLength(0)
  await f.session.run()
  expect(f.states.at(-1)?.phase).toBe('succeeded'); expect(f.project.assets).toHaveLength(1)
  expect(f.client.startTts).toHaveBeenCalledTimes(1); expect(f.client.ttsStatus).not.toHaveBeenCalled()
  expect(f.history.list(f.project.id)).toHaveLength(1)
})
it('retries serial status reads for the original job only', async () => {
  const f = fixture(); f.client.startTts.mockResolvedValue(job('queued')); f.client.ttsStatus.mockRejectedValueOnce(Error('offline'))
  await f.session.run(); expect(f.states.at(-1)?.phase).toBe('pollFailed')
  await f.session.run(); expect(f.states.at(-1)?.phase).toBe('succeeded')
  expect(f.client.startTts).toHaveBeenCalledTimes(1); expect(f.client.ttsStatus.mock.calls).toEqual([['job'], ['job']])
})
it('never resubmits an unknown initial acceptance', async () => {
  const f = fixture(); f.client.startTts.mockRejectedValue(Error('lost acknowledgement'))
  await f.session.run(); await f.session.run()
  expect(f.states.at(-1)?.phase).toBe('startFailed'); expect(f.session.unresolved).toBe(true)
  expect(f.client.startTts).toHaveBeenCalledTimes(1); expect(f.persist).not.toHaveBeenCalled()
})
it('guards concurrent initial submissions', async () => {
  const f = fixture(), pending = deferred<TtsJobRecord>(); f.client.startTts.mockReturnValue(pending.promise)
  const running = f.session.run(); await f.session.run(); pending.resolve(job()); await running
  expect(f.client.startTts).toHaveBeenCalledTimes(1)
})
it.each(['project', 'connection', 'detach'] as const)('suppresses late initial results after %s and scope round trips', async kind => {
  const f = fixture(), original = f.project, pending = deferred<TtsJobRecord>(); f.client.startTts.mockReturnValue(pending.promise)
  const running = f.session.run()
  if (kind === 'project') { f.edit({ ...original, script: 'New edit' }); f.edit(original) }
  if (kind === 'connection') { f.connect('different'); f.connect('original') }
  if (kind === 'detach') f.session.detach()
  pending.resolve(job()); await running
  expect(f.session.wasDetached).toBe(true); expect(f.persist).not.toHaveBeenCalled(); expect(f.snapshot).not.toHaveBeenCalled()
})
it('suppresses a late status response after a project edit', async () => {
  const f = fixture(), pending = deferred<TtsJobRecord>(); f.client.startTts.mockResolvedValue(job('running')); f.client.ttsStatus.mockReturnValue(pending.promise)
  const running = f.session.run(); await vi.waitFor(() => expect(f.client.ttsStatus).toHaveBeenCalled())
  f.edit({ ...f.project, script: 'Keep new words' }); pending.resolve(job()); await running
  expect(f.project.script).toBe('Keep new words'); expect(f.persist).not.toHaveBeenCalled()
})
it.each(['id', 'voice', 'path', 'duration'] as const)('rejects mismatched/invalid %s before saving', async field => {
  const f = fixture(); f.client.startTts.mockResolvedValue(job('queued'))
  f.client.ttsStatus.mockResolvedValue({ ...job(), ...(field === 'id' ? { id: 'another' } : field === 'voice' ? { voicePath: 'KINAOU/Models/other.onnx' } : field === 'path' ? { audioPath: 'KINAOU/Assets/GeneratedVoice/other.wav' } : { durationMs: NaN }) })
  await f.session.run(); expect(f.states.at(-1)?.phase).toBe('pollFailed'); expect(f.persist).not.toHaveBeenCalled()
})
it.each(['failed', 'cancelled'] as const)('never saves a worker-confirmed %s job', async state => {
  const f = fixture(); f.client.startTts.mockResolvedValue(job(state)); await f.session.run()
  expect(f.states.at(-1)?.phase).toBe(state); expect(f.session.unresolved).toBe(false); expect(f.persist).not.toHaveBeenCalled()
})
it.each(['cancelled', 'succeeded'] as const)('reports actual %s when cancellation races a late status reply', async state => {
  const f = fixture(), pending = deferred<TtsJobRecord>(); f.client.startTts.mockResolvedValue(job('running')); f.client.ttsStatus.mockReturnValue(pending.promise); f.client.cancelTts.mockResolvedValue(job(state))
  const running = f.session.run(); await vi.waitFor(() => expect(f.client.ttsStatus).toHaveBeenCalled())
  await f.session.cancel(); pending.resolve(job()); await running
  expect(f.states.at(-1)?.phase).toBe(state); expect(f.persist).toHaveBeenCalledTimes(state === 'succeeded' ? 1 : 0)
})
it('prevents repeated cancellation and suppresses its late response after detach', async () => {
  const f = fixture(), pending = deferred<TtsJobRecord>(); f.client.startTts.mockResolvedValue(job('running')); f.client.ttsStatus.mockRejectedValue(Error('offline')); f.client.cancelTts.mockReturnValue(pending.promise)
  await f.session.run(); const cancel = f.session.cancel(); await f.session.cancel(); f.session.detach(); pending.resolve(job()); await cancel
  expect(f.client.cancelTts).toHaveBeenCalledTimes(1); expect(f.persist).not.toHaveBeenCalled()
})
it('recovers unconfirmed cancellation by checking the same accepted job', async () => {
  const f = fixture(); f.client.startTts.mockResolvedValue(job('queued')); f.client.ttsStatus.mockRejectedValueOnce(Error('offline')); f.client.cancelTts.mockRejectedValueOnce(Error('lost cancellation'))
  await f.session.run(); await f.session.cancel(); expect(f.states.at(-1)?.phase).toBe('cancelFailed')
  await f.session.run(); expect(f.states.at(-1)?.phase).toBe('succeeded'); expect(f.client.startTts).toHaveBeenCalledTimes(1)
})
it.each(uiLanguages)('renders original content, honest baseline limits and all job phases in %s', language => {
  const f = fixture()
  const render = (children: ReturnType<typeof createElement>) => renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: language, children }))
  const html = render(createElement(AudioStudioPanel, { project: f.project, history: f.history, workerUrl: 'http://127.0.0.1:1', workerToken: '', workerConnected: false, workerCapabilities: [], onProjectChange: vi.fn() }))
  for (const key of ['audio.help', 'audio.scope', 'audio.detect', 'audio.generate', 'narration.voiceLabel'] as const) expect(html).toContain(translateUi(language, key))
  expect(html).toContain('disabled=""')
  for (const phase of ['starting', 'queued', 'running', 'saving', 'succeeded', 'failed', 'cancelled', 'startFailed', 'pollFailed', 'saveFailed', 'cancelling', 'cancelFailed', 'detached'] as AudioPhase[]) {
    const status = render(createElement(AudioJobStatus, { feedback: { phase, job: job(), detail: '<script>diagnostic' }, submittedText: 'Original <words>', onRetry: vi.fn(), onCancel: vi.fn(), onDetach: vi.fn() }))
    expect(status).toContain(translateUi(language, `audio.${phase}`)); expect(status).toContain('Original &lt;words&gt;'); expect(status).toContain('&lt;script&gt;diagnostic')
    if (phase === 'saveFailed') expect(status).toContain(translateUi(language, 'audio.retrySave'))
    if (phase === 'startFailed') expect(status).not.toContain(translateUi(language, 'audio.retry'))
  }
})
it.each(uiLanguages)('localizes placement without renaming original media or tracks in %s', language => {
  const asset = { id: 'audio', kind: 'audio' as const, uri: 'KINAOU/Assets/original.wav', managed: true, offline: false, metadata: { name: 'Original <voice>' } }
  const project = { ...createProject('Original'), assets: [asset], tracks: [{ id: 'voice', name: 'Original <track>', type: 'voice' as const, muted: false, locked: true, clips: [] }] }
  const html = renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: language, children: createElement(AssetPlacementControl, { project, asset, onProjectChange: vi.fn() }) }))
  expect(html).toContain('Original &lt;voice&gt;'); expect(html).toContain('Original &lt;track&gt;'); expect(html).toContain(translateUi(language, 'placement.add')); expect(html).toContain('disabled=""')
})
