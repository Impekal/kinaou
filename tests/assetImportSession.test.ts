import { expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { AssetImportSession, inferImportKind, type AssetImportFeedback, type AssetImportPhase } from '../src/core/assetImportSession'
import { createProject, type KinaouProject } from '../src/core/project'
import { ProjectRepository } from '../src/core/persistence'
import { PersistentVersionHistory } from '../src/core/versioning'
import type { MediaProbeResult } from '../src/core/workerProtocol'
import type { AssetUploadResult } from '../src/core/assetUpload'
import { AssetUploadPanel, AssetImportStatus } from '../src/components/AssetUploadPanel'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import { translateUi } from '../src/core/uiMessages'
import { uiLanguages } from '../src/core/uiLanguage'
const file = new File(['original'], 'Original <voice>.wav', { type: 'audio/wav' })
const upload: AssetUploadResult = { managedPath: 'KINAOU/Assets/id_Original-voice.wav', name: 'Original-voice.wav', sizeBytes: file.size }
const probe: MediaProbeResult = { path: upload.managedPath, sizeBytes: file.size, durationMs: 1000, audioCodec: 'pcm_s16le', sampleRate: 22050, channels: 1 }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r }); return { promise, resolve } }
function fixture() {
  const data = new Map<string, string>(), storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value) }, removeItem: (key: string) => { data.delete(key) } }
  const repository = new ProjectRepository(storage), history = new PersistentVersionHistory(storage)
  let project = repository.save(createProject('Original project')), connection = 'original'
  const states: AssetImportFeedback[] = []
  const client = { importAsset: vi.fn(async (_file: Blob, _name: string) => ({ ...upload })), probe: vi.fn(async (_path: string) => ({ ...probe })) }
  const snapshot = vi.fn((value: KinaouProject) => { history.snapshot(value, 'Before import', 'system') }), persist = vi.fn((value: KinaouProject) => { project = repository.save(value) })
  const session = new AssetImportSession(project, connection, file, 'audio', { client, environment: () => ({ project, connection }), snapshot, persist, publish: value => states.push(value) })
  return { session, states, client, snapshot, persist, history, repository, get project() { return project }, edit: (value: KinaouProject) => { project = value; session.observe(project, connection) }, connect: (value: string) => { connection = value; session.observe(project, connection) } }
}
it('uploads the explicit selection once, probes its copy and saves reloadable reversible metadata', async () => {
  const f = fixture(); await f.session.run(); await f.session.run()
  expect(f.client.importAsset.mock.calls).toEqual([[file, file.name]])
  expect(f.client.probe.mock.calls).toEqual([[upload.managedPath]])
  expect(f.states.map(value => value.phase)).toEqual(['uploading', 'probing', 'saving', 'succeeded'])
  expect(f.repository.load(f.project.id)?.assets[0]).toMatchObject({ uri: upload.managedPath, metadata: { durationMs: 1000, sizeBytes: file.size, name: upload.name } })
  expect(f.history.restoreReversibly(f.project, f.history.list(f.project.id)[0].id).project.assets).toHaveLength(0)
})
it.each(['snapshot', 'persist'] as const)('recovers %s failure without reuploading or reprobing', async part => {
  const f = fixture(); f[part].mockImplementationOnce(() => { throw Error('explicit storage failure') })
  await f.session.run(); expect(f.states.at(-1)?.phase).toBe('saveFailed'); expect(f.project.assets).toHaveLength(0)
  await f.session.run(); expect(f.states.at(-1)?.phase).toBe('succeeded'); expect(f.project.assets).toHaveLength(1)
  expect(f.client.importAsset).toHaveBeenCalledTimes(1); expect(f.client.probe).toHaveBeenCalledTimes(1)
  expect(f.history.list(f.project.id)).toHaveLength(1)
})
it('retries only inspection of an accepted copy', async () => {
  const f = fixture(); f.client.probe.mockRejectedValueOnce(Error('probe unavailable'))
  await f.session.run(); expect(f.states.at(-1)?.phase).toBe('probeFailed')
  await f.session.run(); expect(f.states.at(-1)?.phase).toBe('succeeded')
  expect(f.client.importAsset).toHaveBeenCalledTimes(1); expect(f.client.probe.mock.calls).toEqual([[upload.managedPath], [upload.managedPath]])
})
it('never retries an unconfirmed upload automatically', async () => {
  const f = fixture(); f.client.importAsset.mockRejectedValue(Error('lost acknowledgement'))
  await f.session.run(); await f.session.run()
  expect(f.states.at(-1)?.phase).toBe('uploadUncertain'); expect(f.session.unresolved).toBe(true)
  expect(f.client.importAsset).toHaveBeenCalledTimes(1); expect(f.client.probe).not.toHaveBeenCalled()
})
it('blocks concurrent upload submissions', async () => {
  const f = fixture(), pending = deferred<AssetUploadResult>(); f.client.importAsset.mockReturnValue(pending.promise)
  const running = f.session.run(); await f.session.run(); pending.resolve(upload); await running
  expect(f.client.importAsset).toHaveBeenCalledTimes(1)
})
it.each(['project', 'connection', 'detach'] as const)('ignores late upload after %s and scope round trips', async kind => {
  const f = fixture(), original = f.project, pending = deferred<AssetUploadResult>(); f.client.importAsset.mockReturnValue(pending.promise)
  const running = f.session.run()
  if (kind === 'project') { f.edit({ ...original, script: 'new edit' }); f.edit(original) }
  if (kind === 'connection') { f.connect('other'); f.connect('original') }
  if (kind === 'detach') f.session.detach()
  pending.resolve(upload); await running
  expect(f.session.wasDetached).toBe(true); expect(f.client.probe).not.toHaveBeenCalled(); expect(f.persist).not.toHaveBeenCalled()
})
it('does not overwrite a project edited while probing', async () => {
  const f = fixture(), pending = deferred<MediaProbeResult>(); f.client.probe.mockReturnValue(pending.promise)
  const running = f.session.run(); await vi.waitFor(() => expect(f.client.probe).toHaveBeenCalled())
  f.edit({ ...f.project, script: 'Keep this edit' }); pending.resolve(probe); await running
  expect(f.project.script).toBe('Keep this edit'); expect(f.persist).not.toHaveBeenCalled(); expect(f.snapshot).not.toHaveBeenCalled()
})
it.each(['size', 'path', 'name'] as const)('rejects mismatched upload %s', async field => {
  const f = fixture(), wrong = { ...upload }
  if (field === 'size') wrong.sizeBytes++
  if (field === 'path') wrong.managedPath = 'KINAOU/Assets/../id_Original-voice.wav'
  if (field === 'name') wrong.name = 'other.wav'
  f.client.importAsset.mockResolvedValue(wrong); await f.session.run()
  expect(f.states.at(-1)?.phase).toBe('uploadUncertain'); expect(f.persist).not.toHaveBeenCalled()
})
it.each(['path', 'size', 'duration', 'codec', 'rate'] as const)('rejects mismatched probe %s', async field => {
  const f = fixture(), wrong = { ...probe }
  if (field === 'path') wrong.path = 'KINAOU/Assets/other.wav'
  if (field === 'size') wrong.sizeBytes = 9999
  if (field === 'duration') wrong.durationMs = Infinity
  if (field === 'codec') wrong.audioCodec = undefined
  if (field === 'rate') wrong.sampleRate = -1
  f.client.probe.mockResolvedValue(wrong); await f.session.run()
  expect(f.states.at(-1)?.phase).toBe('probeFailed'); expect(f.persist).not.toHaveBeenCalled()
})
it('recognizes supported MIME kinds without guessing unsupported files', () => {
  expect(inferImportKind({ type: 'audio/wav' })).toBe('audio'); expect(inferImportKind({ type: 'image/png' })).toBe('image'); expect(inferImportKind({ type: 'video/mp4' })).toBe('video'); expect(inferImportKind({ type: '' })).toBeNull()
})
it('accepts the worker absolute probe path but persists only the portable managed path', async () => {
  const f = fixture(); f.client.probe.mockResolvedValue({ ...probe, path: '/Volumes/OwnStore/Assets/id_Original-voice.wav' })
  await f.session.run(); expect(f.states.at(-1)?.phase).toBe('succeeded')
  expect(f.project.assets[0].uri).toBe(upload.managedPath); expect(JSON.stringify(f.project)).not.toContain('/Volumes/')
})
it('rejects traversal hidden in an absolute probe path', async () => {
  const f = fixture(); f.client.probe.mockResolvedValue({ ...probe, path: '/Volumes/OwnStore/../Assets/id_Original-voice.wav' })
  await f.session.run(); expect(f.states.at(-1)?.phase).toBe('probeFailed'); expect(f.persist).not.toHaveBeenCalled()
})
it.each(uiLanguages)('translates import phases in %s, preserving names and escaped diagnostics', language => {
  const f = fixture(), render = (children: ReturnType<typeof createElement>) => renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: language, children }))
  const html = render(createElement(AssetUploadPanel, { project: f.project, history: f.history, workerUrl: 'http://127.0.0.1:1', workerToken: '', workerConnected: false, workerCapabilities: [], onProjectChange: vi.fn() }))
  expect(html).toContain(translateUi(language, 'import.heading')); expect(html).toContain('disabled=""')
  for (const phase of ['uploading', 'probing', 'saving', 'succeeded', 'uploadUncertain', 'probeFailed', 'saveFailed', 'detached'] as AssetImportPhase[]) {
    const status = render(createElement(AssetImportStatus, { feedback: { phase, name: file.name, path: upload.managedPath, detail: '<script>technical' }, onRetry: vi.fn(), onDetach: vi.fn() }))
    expect(status).toContain('Original &lt;voice&gt;.wav'); expect(status).toContain('&lt;script&gt;technical')
    if (phase === 'saveFailed') expect(status).toContain(translateUi(language, 'audio.retrySave'))
    if (phase === 'uploadUncertain') expect(status).not.toContain(translateUi(language, 'import.retryProbe'))
  }
})
