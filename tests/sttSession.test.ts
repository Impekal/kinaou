import { expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createProject, type KinaouProject } from '../src/core/project'
import { ProjectRepository } from '../src/core/persistence'
import { PersistentVersionHistory } from '../src/core/versioning'
import { SttModelDiscovery, SttSession, type SttDraft, type SttFeedback, type SttDiscoveryFeedback, type SttPhase } from '../src/core/sttSession'
import { parseSttJob, type SttJobRecord } from '../src/core/sttJobs'
import { registerTranscriptAsset } from '../src/core/transcripts'
import { SttPanel, SttStatus } from '../src/components/SttPanel'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import { uiLanguages } from '../src/core/uiLanguage'
import { translateUi } from '../src/core/uiMessages'

const draft: SttDraft = { sourceId: 'audio', model: 'KINAOU/Models/ggml-small.bin', language: 'de' }
function record(state: SttJobRecord['state'] = 'queued'): SttJobRecord {
  return { id: 'j1', state, progress: state === 'succeeded' ? 1 : .25, createdAt: 'x', updatedAt: 'x', ...(state === 'succeeded' ? {
    transcriptPath: 'KINAOU/Projects/Transcripts/j1.json', transcript: { schemaVersion: 1, adapterId: 'whisper.cpp', language: 'de', text: '<script>Original', segments: [{ startMs: 0, endMs: 1000, text: 'Original' }] }
  } : {}) }
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r }); return { promise, resolve } }
function fixture(override: Partial<SttDraft> = {}) {
  const data = new Map<string, string>(), storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value) }, removeItem: (key: string) => { data.delete(key) } }
  const repository = new ProjectRepository(storage), history = new PersistentVersionHistory(storage)
  let project = createProject('Original title'), connection = 'original'
  project.assets.push({ id: 'audio', kind: 'audio', uri: 'KINAOU/Assets/original.wav', managed: true, offline: false, metadata: { name: '<script>Original source' } })
  project = repository.save(project)
  const states: SttFeedback[] = [], submitted = { ...draft, ...override }
  const client = { startStt: vi.fn(async (_source: string, _model: string, _language?: string): Promise<SttJobRecord> => record()), sttStatus: vi.fn(async (_id: string): Promise<SttJobRecord> => record('succeeded')), cancelStt: vi.fn(async (_id: string): Promise<SttJobRecord> => record('cancelled')), listSttModels: vi.fn(async () => [draft.model]) }
  const snapshot = vi.fn((value: KinaouProject) => { history.snapshot(value, 'Before transcript', 'system') }), persist = vi.fn((value: KinaouProject) => { project = repository.save(value) })
  const environment = () => ({ project, connection })
  const session = new SttSession(project, connection, submitted, { client, environment, snapshot, persist, publish: value => states.push(value) })
  return { session, states, client, submitted, snapshot, persist, repository, history, environment, get project() { return project }, edit: (value: KinaouProject) => { project = value; session.observe(project, connection) }, connect: (value: string) => { connection = value; session.observe(project, connection) } }
}

it('binds immutable submission inputs, saves once, reloads and restores safety history', async () => {
  const f = fixture(); f.submitted.sourceId = 'changed'; f.submitted.model = 'changed'; f.submitted.language = 'fr'
  await f.session.start(); await f.session.start()
  expect(f.client.startStt).toHaveBeenCalledExactlyOnceWith('KINAOU/Assets/original.wav', draft.model, 'de')
  expect(f.persist).not.toHaveBeenCalled(); expect(f.session.blocksStart).toBe(true)
  await f.session.check(); await f.session.check(); f.session.save()
  expect(f.persist).toHaveBeenCalledTimes(1); expect(f.states.at(-1)?.phase).toBe('saved')
  expect(f.repository.load(f.project.id)?.assets[1].metadata).toMatchObject({ sourceAssetId: 'audio', sttJobId: 'j1', language: 'de' })
  expect(f.history.restoreReversibly(f.project, f.history.list(f.project.id)[0].id).project.assets).toHaveLength(1)
  expect(f.session.blocksStart).toBe(false)
})
it.each(['snapshot', 'persist'] as const)('retries %s failure without resubmission, repolling or duplicate history', async part => {
  const f = fixture(); f[part].mockImplementationOnce(() => { throw Error('storage full') })
  await f.session.start(); await f.session.check()
  expect(f.states.at(-1)?.phase).toBe('saveFailed'); expect(f.session.canSave).toBe(true); expect(f.session.blocksStart).toBe(true)
  expect(f.project.assets).toHaveLength(1); expect(f.states.some(value => value.phase === 'saved')).toBe(false)
  f.session.save(); f.session.save()
  expect(f.states.at(-1)?.phase).toBe('saved'); expect(f.client.startStt).toHaveBeenCalledTimes(1); expect(f.client.sttStatus).toHaveBeenCalledTimes(1)
  expect(f.history.list(f.project.id)).toHaveLength(1); expect(f.project.assets).toHaveLength(2)
})
it('does not resend an uncertain start, even after explicit start calls', async () => {
  const f = fixture(); f.client.startStt.mockRejectedValueOnce(Error('response lost'))
  await f.session.start(); await f.session.start(); await f.session.check(); await f.session.cancel()
  expect(f.states.at(-1)?.phase).toBe('unknown'); expect(f.session.blocksStart).toBe(true)
  expect(f.client.startStt).toHaveBeenCalledTimes(1); expect(f.client.sttStatus).not.toHaveBeenCalled(); expect(f.persist).not.toHaveBeenCalled()
  f.session.detach(); expect(f.session.blocksStart).toBe(false)
})
it('retries failed status on exactly the accepted job', async () => {
  const f = fixture(); await f.session.start(); f.client.sttStatus.mockRejectedValueOnce(Error('offline'))
  await f.session.check(); expect(f.session.shouldPoll).toBe(false); expect(f.session.canCheck).toBe(true)
  expect(f.states.at(-1)?.phase).toBe('statusFailed'); await f.session.check()
  expect(f.client.sttStatus.mock.calls).toEqual([['j1'], ['j1']]); expect(f.client.startStt).toHaveBeenCalledTimes(1); expect(f.states.at(-1)?.phase).toBe('saved')
})
it('rejects a status reply for another job and retains the original for recovery', async () => {
  const f = fixture(); await f.session.start(); f.client.sttStatus.mockResolvedValueOnce({ ...record('succeeded'), id: 'other' })
  await f.session.check(); expect(f.states.at(-1)).toMatchObject({ phase: 'statusFailed', job: { id: 'j1' } }); expect(f.persist).not.toHaveBeenCalled()
  await f.session.check(); expect(f.states.at(-1)?.phase).toBe('saved')
})
it('serializes double starts, status and cancellation requests', async () => {
  const f = fixture(), start = deferred<SttJobRecord>(), status = deferred<SttJobRecord>()
  f.client.startStt.mockReturnValueOnce(start.promise); const starting = f.session.start(); await f.session.start(); await f.session.cancel()
  expect(f.client.startStt).toHaveBeenCalledTimes(1); start.resolve(record()); await starting
  f.client.sttStatus.mockReturnValueOnce(status.promise); const checking = f.session.check(); await f.session.check(); await f.session.cancel()
  expect(f.client.sttStatus).toHaveBeenCalledTimes(1); expect(f.client.cancelStt).not.toHaveBeenCalled()
  status.resolve(record('running')); await checking; expect(f.session.shouldPoll).toBe(true)
})
it('catches cancellation errors and checks the same job before claiming cancellation', async () => {
  const f = fixture(); await f.session.start(); f.client.cancelStt.mockRejectedValueOnce(Error('network'))
  await f.session.cancel(); expect(f.states.at(-1)?.phase).toBe('cancelFailed'); expect(f.session.blocksStart).toBe(true)
  f.client.sttStatus.mockResolvedValueOnce(record('running')); await f.session.check(); expect(f.states.at(-1)?.phase).toBe('running')
  await f.session.cancel(); expect(f.states.at(-1)?.phase).toBe('cancelled'); expect(f.persist).not.toHaveBeenCalled()
  expect(f.client.cancelStt.mock.calls).toEqual([['j1'], ['j1']])
})
it('saves a completed job returned by cancellation instead of claiming it was cancelled', async () => {
  const f = fixture(); await f.session.start(); f.client.cancelStt.mockResolvedValueOnce(record('succeeded')); await f.session.cancel()
  expect(f.states.at(-1)?.phase).toBe('saved'); expect(f.project.assets).toHaveLength(2)
})
it.each(['start', 'status', 'cancel'] as const)('drops late %s responses after project, connection and explicit detach', async action => {
  for (const scope of ['project', 'connection', 'leave']) {
    const f = fixture(), pending = deferred<SttJobRecord>(), original = f.project
    if (action !== 'start') await f.session.start()
    const method = action === 'start' ? f.client.startStt : action === 'status' ? f.client.sttStatus : f.client.cancelStt
    method.mockReturnValueOnce(pending.promise)
    const task = action === 'start' ? f.session.start() : action === 'status' ? f.session.check() : f.session.cancel()
    if (scope === 'project') { f.edit({ ...original, script: 'new edit' }); f.edit(original) }
    if (scope === 'connection') { f.connect('other'); f.connect('original') }
    if (scope === 'leave') f.session.detach()
    const count = f.states.length; pending.resolve(record('succeeded')); await task; f.session.save()
    expect(f.session.wasDetached).toBe(true); expect(f.states).toHaveLength(count); expect(f.persist).not.toHaveBeenCalled(); expect(f.snapshot).not.toHaveBeenCalled()
  }
})
it('invalidates a failed-save result after a same-project edit', async () => {
  const f = fixture(); f.persist.mockImplementationOnce(() => { throw Error('full') }); await f.session.start(); await f.session.check()
  f.edit({ ...f.project, script: 'new text' }); f.session.save(); expect(f.persist).toHaveBeenCalledTimes(1); expect(f.session.canSave).toBe(false)
})
it('reports worker failure without saving or losing its diagnostic', async () => {
  const f = fixture(); f.client.startStt.mockResolvedValueOnce({ ...record('failed'), error: 'actual worker diagnostic' }); await f.session.start()
  expect(f.states.at(-1)).toMatchObject({ phase: 'failed', detail: 'actual worker diagnostic' }); expect(f.persist).not.toHaveBeenCalled(); expect(f.session.blocksStart).toBe(false)
})
it.each([{ sourceId: 'missing' }, { model: 'KINAOU/Models/../other.bin' }, { model: 'KINAOU/Models/' }, { language: 'bad language' }])('rejects invalid input before submission: %j', async patch => {
  const f = fixture(patch); await f.session.start(); expect(f.states.at(-1)?.phase).toBe('invalid'); expect(f.client.startStt).not.toHaveBeenCalled()
})
it.each([NaN, Infinity, -1, 1.1])('rejects invalid progress %s', progress => { expect(() => parseSttJob({ ...record(), progress })).toThrow() })
it.each(['KINAOU/Projects/Transcripts/../x.json', 'KINAOU/Projects/Transcripts//x.json', 'KINAOU/Projects/Transcripts/./x.json', 'KINAOU/Projects/Transcripts/x\\y.json', 'KINAOU/Projects/Transcripts/', 'KINAOU/Assets/x.json'])('rejects unsafe transcript path %s', transcriptPath => {
  expect(() => parseSttJob({ ...record('succeeded'), transcriptPath })).toThrow()
})
it('rejects conflicting transcript attribution and invalid segment times', () => {
  const f = fixture(), job = record('succeeded'), registered = registerTranscriptAsset(f.project, 'audio', job)
  registered.assets[1].metadata.sourceAssetId = 'another-source'
  expect(() => registerTranscriptAsset(registered, 'audio', job)).toThrow(/attribution/)
  job.transcript!.segments[0].endMs = Number.MAX_SAFE_INTEGER + 1
  expect(() => parseSttJob(job)).toThrow(/segment/)
})
it('isolates model discovery, deduplicates paths and permits read-only retry', async () => {
  const f = fixture(), states: SttDiscoveryFeedback[] = []
  const discovery = new SttModelDiscovery(f.project, 'original', { client: f.client, environment: f.environment, publish: value => states.push(value) })
  f.client.listSttModels.mockRejectedValueOnce(Error('offline')); await discovery.detect(); expect(states.at(-1)?.phase).toBe('discoveryFailed')
  f.client.listSttModels.mockResolvedValueOnce([draft.model, draft.model]); await discovery.detect(); expect(states.at(-1)).toEqual({ phase: 'modelsReady', models: [draft.model] })
  f.client.listSttModels.mockResolvedValueOnce(['KINAOU/Models/../bad.bin']); await discovery.detect(); expect(states.at(-1)?.phase).toBe('discoveryFailed')
  f.client.listSttModels.mockResolvedValueOnce([]); await discovery.detect(); expect(states.at(-1)?.phase).toBe('noModels')
})
it.each(['project', 'connection', 'leave'])('rejects late model discovery after %s and scope round trips', async scope => {
  const f = fixture(), states: SttDiscoveryFeedback[] = [], pending = deferred<string[]>()
  const discovery = new SttModelDiscovery(f.project, 'original', { client: f.client, environment: f.environment, publish: value => states.push(value) })
  f.client.listSttModels.mockReturnValueOnce(pending.promise); const task = discovery.detect(); await discovery.detect()
  if (scope === 'project') { discovery.observe({ ...f.project, script: 'edit' }, 'original'); discovery.observe(f.project, 'original') }
  if (scope === 'connection') { discovery.observe(f.project, 'other'); discovery.observe(f.project, 'original') }
  if (scope === 'leave') discovery.detach()
  pending.resolve([draft.model]); await task; expect(states.map(value => value.phase)).toEqual(['detecting']); expect(f.client.listSttModels).toHaveBeenCalledTimes(1)
})
it.each(uiLanguages)('renders translated lifecycle and escaped original content in %s', language => {
  const f = fixture(), render = (children: ReturnType<typeof createElement>) => renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: language, children }))
  const html = render(createElement(SttPanel, { project: f.project, history: f.history, workerUrl: '', workerToken: '', workerConnected: false, workerCapabilities: [], onProjectChange: vi.fn() }))
  expect(html).toContain(translateUi(language, 'stt.heading')); expect(html).toContain('disabled=""')
  const phases: SttPhase[] = ['invalid', 'starting', 'unknown', 'queued', 'running', 'checking', 'cancelling', 'ready', 'saving', 'saved', 'saveFailed', 'statusFailed', 'cancelFailed', 'failed', 'cancelled', 'detached']
  for (const phase of phases) {
    const status = render(createElement(SttStatus, { feedback: { phase, draft, sourceName: '<script>Original source', job: record('succeeded'), detail: '<script>diagnostic' } }))
    expect(status).toContain(translateUi(language, `stt.${phase}`)); expect(status).toContain('&lt;script&gt;Original'); expect(status).toContain('&lt;script&gt;diagnostic')
    if (phase !== 'saved') expect(status).not.toContain(translateUi(language, 'stt.saved'))
  }
})
