import { expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createProject, type KinaouProject } from '../src/core/project'
import { ProjectRepository } from '../src/core/persistence'
import { PersistentVersionHistory } from '../src/core/versioning'
import { expectedMediaPreviewPath, mediaPreviewDefinitions, type MediaPreviewKind } from '../src/core/previewAssets'
import { MediaPreviewSession, PreviewImageSession, validateMediaPreviewResult, type MediaPreviewFeedback, type PreviewImageFeedback, type MediaPreviewPhase } from '../src/core/mediaPreviewSession'
import { MediaPreviewControl, MediaPreviewStatus } from '../src/components/MediaPreviewControl'
import { MediaPreviewImage, MediaPreviewImageStatus } from '../src/components/MediaPreviewImage'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import { uiLanguages } from '../src/core/uiLanguage'
import { translateUi } from '../src/core/uiMessages'

const source = 'KINAOU/Assets/original.mov', kinds: MediaPreviewKind[] = ['thumbnail', 'waveform', 'proxy']
const id = createHash('sha256').update(source).digest('hex').slice(0, 24)
const paths = { thumbnail: `KINAOU/Cache/Thumbnails/${id}_poster.jpg`, waveform: `KINAOU/Cache/Waveforms/${id}_waveform.png`, proxy: `KINAOU/Cache/Proxies/${id}_960p.mp4` }
const proxyProbe = { path: '/private/tmp/KINAOU/' + paths.proxy.slice('KINAOU/'.length), sizeBytes: 2000, durationMs: 1000, videoCodec: 'h264', width: 960, height: 540 }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r }); return { promise, resolve } }
function fixture(kind: MediaPreviewKind = 'thumbnail', offline = false) {
  const data = new Map<string, string>(), storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value) }, removeItem: (key: string) => { data.delete(key) } }
  const repository = new ProjectRepository(storage), history = new PersistentVersionHistory(storage)
  let project = createProject('Original title'), connection = 'original'
  project.assets.push({ id: 'video', kind: 'video', uri: source, managed: true, offline, metadata: { name: '<script>Original' } }); project = repository.save(project)
  const states: MediaPreviewFeedback[] = []
  const client = {
    health: vi.fn(async () => ({ workerId: 'test', name: 'test', platform: 'test', version: '1', capabilities: ['media-proxy'], managedRoots: ['/private/tmp/KINAOU'] })),
    generateVideoThumbnail: vi.fn(async (_path: string) => ({ path: paths.thumbnail, sizeBytes: 200 })),
    generateWaveform: vi.fn(async (_path: string) => ({ path: paths.waveform, sizeBytes: 200 })),
    generateVideoProxy: vi.fn(async (_path: string) => ({ path: paths.proxy, probe: { ...proxyProbe } }))
  }
  const request = kind === 'thumbnail' ? client.generateVideoThumbnail : kind === 'waveform' ? client.generateWaveform : client.generateVideoProxy
  const snapshot = vi.fn((value: KinaouProject) => { history.snapshot(value, 'Before preview', 'system') }), persist = vi.fn((value: KinaouProject) => { project = repository.save(value) })
  const session = new MediaPreviewSession(project, connection, 'video', kind, { client, environment: () => ({ project, connection }), snapshot, persist, publish: value => states.push(value) })
  return { session, states, client, request, snapshot, persist, repository, history, get project() { return project }, edit: (value: KinaouProject) => { project = value; session.observe(project, connection) }, connect: (value: string) => { connection = value; session.observe(project, connection) } }
}
it.each(kinds)('binds %s output to the worker-compatible source hash, saves once and restores only metadata', async kind => {
  const f = fixture(kind); expect(await expectedMediaPreviewPath(kind, source)).toBe(paths[kind])
  await f.session.generate(); await f.session.generate(); f.session.save()
  expect(f.request).toHaveBeenCalledExactlyOnceWith(source); expect(f.persist).toHaveBeenCalledTimes(1); expect(f.states.at(-1)?.phase).toBe('saved')
  const asset = f.repository.load(f.project.id)!.assets[0]
  expect(asset.uri).toBe(source); expect(asset.metadata[mediaPreviewDefinitions[kind].field]).toBe(paths[kind])
  const restored = f.history.restoreReversibly(f.project, f.history.list(f.project.id)[0].id).project.assets[0]
  expect(restored.uri).toBe(source); expect(restored.metadata[mediaPreviewDefinitions[kind].field]).toBeUndefined()
})
it.each(kinds)('retries snapshot and persistence failures for %s without generating again', async kind => {
  for (const part of ['snapshot', 'persist'] as const) {
    const f = fixture(kind); f[part].mockImplementationOnce(() => { throw Error('storage full') }); await f.session.generate()
    expect(f.states.at(-1)?.phase).toBe('saveFailed'); expect(f.session.canSave).toBe(true); expect(f.session.blocksGeneration).toBe(true)
    expect(f.states.some(value => value.phase === 'saved')).toBe(false); expect(f.project.assets[0].metadata[mediaPreviewDefinitions[kind].field]).toBeUndefined()
    f.session.save(); f.session.save(); expect(f.states.at(-1)?.phase).toBe('saved'); expect(f.request).toHaveBeenCalledTimes(1); expect(f.history.list(f.project.id)).toHaveLength(1)
  }
})
it.each(kinds)('does not repeat unconfirmed %s generation', async kind => {
  const f = fixture(kind); f.request.mockRejectedValueOnce(Error('response lost')); await f.session.generate(); await f.session.generate(); f.session.save()
  expect(f.states.at(-1)?.phase).toBe('unconfirmed'); expect(f.request).toHaveBeenCalledTimes(1); expect(f.session.blocksGeneration).toBe(true); expect(f.persist).not.toHaveBeenCalled()
  f.session.detach(); expect(f.session.blocksGeneration).toBe(false)
})
it('ignores concurrent generation calls and late results after project/connection round trips or leaving', async () => {
  for (const scope of ['project', 'connection', 'leave']) {
    const f = fixture(), original = f.project, pending = deferred<{ path: string; sizeBytes: number }>(), started = deferred<void>()
    f.client.generateVideoThumbnail.mockImplementationOnce(() => { started.resolve(); return pending.promise })
    const task = f.session.generate(); await f.session.generate(); await started.promise
    if (scope === 'project') { f.edit({ ...original, script: 'new script' }); f.edit(original) }
    if (scope === 'connection') { f.connect('other'); f.connect('original') }
    if (scope === 'leave') f.session.detach()
    const count = f.states.length; pending.resolve({ path: paths.thumbnail, sizeBytes: 200 }); await task; f.session.save()
    expect(f.states).toHaveLength(count); expect(f.client.generateVideoThumbnail).toHaveBeenCalledTimes(1); expect(f.persist).not.toHaveBeenCalled(); expect(f.snapshot).not.toHaveBeenCalled()
  }
})
it('does not generate after a late proxy health reply', async () => {
  const f = fixture('proxy'), pending = deferred<Awaited<ReturnType<typeof f.client.health>>>(), started = deferred<void>()
  f.client.health.mockImplementationOnce(() => { started.resolve(); return pending.promise }); const task = f.session.generate(); await started.promise
  f.session.detach(); pending.resolve({ workerId: 'test', name: 'test', platform: 'test', version: '1', capabilities: [], managedRoots: ['/private/tmp/KINAOU'] }); await task
  expect(f.client.generateVideoProxy).not.toHaveBeenCalled(); expect(f.persist).not.toHaveBeenCalled()
})
it('allows a read-only preparation retry before any generation was submitted', async () => {
  const f = fixture('proxy'); f.client.health.mockRejectedValueOnce(Error('offline')); await f.session.generate()
  expect(f.states.at(-1)?.phase).toBe('failed'); expect(f.request).not.toHaveBeenCalled(); expect(f.session.blocksGeneration).toBe(false)
  await f.session.generate(); expect(f.states.at(-1)?.phase).toBe('saved'); expect(f.request).toHaveBeenCalledTimes(1)
})
it.each(kinds)('rejects offline sources before %s submission', async kind => {
  const f = fixture(kind, true); await f.session.generate(); expect(f.states.at(-1)?.phase).toBe('failed'); expect(f.request).not.toHaveBeenCalled()
})
it('invalidates save-only recovery after an edit to the same project', async () => {
  const f = fixture(); f.persist.mockImplementationOnce(() => { throw Error('full') }); await f.session.generate(); f.edit({ ...f.project, script: 'edited' }); f.session.save()
  expect(f.persist).toHaveBeenCalledTimes(1); expect(f.session.canSave).toBe(false)
})
it('rejects a valid cache path for another source without saving it', async () => {
  const f = fixture(); f.client.generateVideoThumbnail.mockResolvedValueOnce({ path: await expectedMediaPreviewPath('thumbnail', 'KINAOU/Assets/other.mov'), sizeBytes: 20 }); await f.session.generate()
  expect(f.states.at(-1)?.phase).toBe('unconfirmed'); expect(f.persist).not.toHaveBeenCalled(); expect(f.snapshot).not.toHaveBeenCalled()
})
it.each([NaN, Infinity, 0, -1, 1.5])('rejects invalid thumbnail/waveform byte sizes %s', sizeBytes => {
  for (const kind of ['thumbnail', 'waveform'] as const) expect(() => validateMediaPreviewResult(kind, paths[kind], { path: paths[kind], sizeBytes })).toThrow(/size/)
})
it.each([{ path: '/another/KINAOU/Cache/Proxies/file.mp4' }, { sizeBytes: 0 }, { durationMs: NaN }, { width: Infinity }, { height: 0 }, { videoCodec: '' }])('rejects mismatched or invalid proxy measurements %j', patch => {
  expect(() => validateMediaPreviewResult('proxy', paths.proxy, { path: paths.proxy, probe: { ...proxyProbe, ...patch } }, ['/private/tmp/KINAOU'])).toThrow()
})
it('does not accept a canonicalized or wrong-extension cache path', () => {
  for (const path of ['KINAOU/Cache/Thumbnails/../x.jpg', 'KINAOU/Cache/Thumbnails//x.jpg', 'KINAOU/Cache/Thumbnails/./x.jpg', 'KINAOU/Cache/Thumbnails/x\\y.jpg', 'KINAOU/Cache/Thumbnails/x.png']) expect(() => validateMediaPreviewResult('thumbnail', path, { path, sizeBytes: 1 })).toThrow()
})

function imageFixture() {
  const states: PreviewImageFeedback[] = [], blob = new Blob(['test lifecycle bytes'], { type: 'image/png' })
  let sequence = 0
  const load = vi.fn(async () => blob), createUrl = vi.fn((_blob: Blob) => `blob:test-${++sequence}`), revokeUrl = vi.fn()
  const session = new PreviewImageSession({ load, mime: 'image/png', createUrl, revokeUrl, publish: value => states.push(value) })
  return { session, states, load, createUrl, revokeUrl, blob }
}
it('releases object URLs on reload, image decode failure and unmount', async () => {
  const f = imageFixture(); await f.session.load(); expect(f.states.at(-1)).toEqual({ phase: 'ready', url: 'blob:test-1' })
  await f.session.load(); expect(f.revokeUrl.mock.calls).toEqual([['blob:test-1']]); expect(f.states.at(-1)?.url).toBe('blob:test-2')
  f.session.failDisplay(); expect(f.states.at(-1)?.phase).toBe('loadFailed'); expect(f.revokeUrl.mock.calls).toEqual([['blob:test-1'], ['blob:test-2']])
  await f.session.load(); f.session.detach(); f.session.detach(); expect(f.revokeUrl.mock.calls).toEqual([['blob:test-1'], ['blob:test-2'], ['blob:test-3']])
})
it('suppresses late image loads and serializes duplicate retries', async () => {
  const f = imageFixture(), pending = deferred<Blob>(); f.load.mockReturnValueOnce(pending.promise)
  const task = f.session.load(); await f.session.load(); f.session.detach(); pending.resolve(f.blob); await task
  expect(f.load).toHaveBeenCalledTimes(1); expect(f.createUrl).not.toHaveBeenCalled(); expect(f.states.map(value => value.phase)).toEqual(['loading'])
})
it('shows download errors and retries loading without a generation operation', async () => {
  const f = imageFixture(); f.load.mockRejectedValueOnce(Error('404')); await f.session.load()
  expect(f.states.at(-1)).toEqual({ phase: 'loadFailed', detail: '404' }); await f.session.load(); expect(f.states.at(-1)?.phase).toBe('ready')
})
it.each([new Blob([], { type: 'image/png' }), new Blob(['text'], { type: 'text/plain' })])('rejects empty or wrong-type preview images', async blob => {
  const f = imageFixture(); f.load.mockResolvedValueOnce(blob); await f.session.load(); expect(f.states.at(-1)?.phase).toBe('loadFailed'); expect(f.createUrl).not.toHaveBeenCalled()
})
it.each(uiLanguages)('renders all media controls and recovery states in %s without claiming file availability', language => {
  const f = fixture(), render = (children: ReturnType<typeof createElement>) => renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: language, children }))
  for (const kind of kinds) {
    const html = render(createElement(MediaPreviewControl, { kind, project: f.project, asset: f.project.assets[0], history: f.history, workerUrl: '', workerToken: '', workerConnected: false, workerCapabilities: [], onProjectChange: vi.fn() }))
    expect(html).toContain(translateUi(language, `cache.${kind}.generate`)); expect(html).toContain('disabled=""')
    const phases: MediaPreviewPhase[] = ['generating', 'saving', 'saved', 'failed', 'unconfirmed', 'saveFailed', 'detached']
    for (const phase of phases) {
      const status = render(createElement(MediaPreviewStatus, { feedback: { phase, kind, assetId: 'video', sourceName: '<script>original', detail: '<script>diagnostic' } }))
      expect(status).toContain(translateUi(language, `cache.${phase}`)); expect(status).toContain('&lt;script&gt;original'); expect(status).toContain('&lt;script&gt;diagnostic')
      if (phase !== 'saved') expect(status).not.toContain(translateUi(language, 'cache.saved'))
    }
  }
  const image = render(createElement(MediaPreviewImage, { kind: 'waveform', path: paths.waveform, workerUrl: '', workerToken: '', workerConnected: false, alt: 'original' }))
  expect(image).not.toContain('<img')
  const error = render(createElement(MediaPreviewImageStatus, { feedback: { phase: 'loadFailed', detail: '<script>original' }, retry: vi.fn() }))
  expect(error).toContain(translateUi(language, 'cache.loadFailed')); expect(error).toContain(translateUi(language, 'cache.retryLoad')); expect(error).toContain('&lt;script&gt;original')
})
