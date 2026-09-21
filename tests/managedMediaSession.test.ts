import { expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ManagedMediaSession, validateManagedMediaDraft, validateManagedMediaProbe, type ManagedMediaDraft, type ManagedMediaFeedback } from '../src/core/managedMediaSession'
import { ManagedMediaPanel, ManagedMediaStatus } from '../src/components/ManagedMediaPanel'
import { createProject, type KinaouProject } from '../src/core/project'
import { ProjectRepository } from '../src/core/persistence'
import { PersistentVersionHistory } from '../src/core/versioning'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import { uiLanguages } from '../src/core/uiLanguage'
import { translateUi } from '../src/core/uiMessages'
import type { MediaProbeResult } from '../src/core/workerProtocol'
const draft: ManagedMediaDraft = { path: 'KINAOU/Assets/Original.wav', kind: 'audio', name: 'Original name' }
const probe: MediaProbeResult = { path: '/private/tmp/KINAOU/Assets/Original.wav', sizeBytes: 88278, durationMs: 1000, audioCodec: 'pcm_s16le', sampleRate: 44100, channels: 1 }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r }); return { promise, resolve } }
function fixture() {
  const data = new Map<string, string>(), storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value) }, removeItem: (key: string) => { data.delete(key) } }
  const repository = new ProjectRepository(storage), history = new PersistentVersionHistory(storage)
  let project = repository.save(createProject('Original title')), connection = 'original'
  const states: ManagedMediaFeedback[] = [], submitted = { ...draft }
  const client = { health: vi.fn(async () => ({ workerId: 'test', name: 'test', platform: 'test', version: '1', capabilities: ['media-probe'], managedRoots: ['/private/tmp/KINAOU'] })), probe: vi.fn(async () => ({ ...probe })) }
  const snapshot = vi.fn((value: KinaouProject) => { history.snapshot(value, 'Before registration', 'system') }), persist = vi.fn((value: KinaouProject) => { project = repository.save(value) })
  const session = new ManagedMediaSession(project, connection, submitted, { client, environment: () => ({ project, connection }), snapshot, persist, publish: value => states.push(value) })
  return { session, states, client, submitted, snapshot, persist, history, repository, get project() { return project }, edit: (value: KinaouProject) => { project = value; session.observe(project, connection) }, connect: (value: string) => { connection = value; session.observe(project, connection) } }
}
it('inspects only, then explicitly saves one portable reversible reference', async () => {
  const f = fixture(); f.session.save(); expect(f.persist).not.toHaveBeenCalled()
  await f.session.inspect(); expect(f.project.assets).toHaveLength(0); expect(f.snapshot).not.toHaveBeenCalled()
  expect(f.states.at(-1)).toMatchObject({ phase: 'review', draft, probe: { path: draft.path } })
  f.submitted.path = 'KINAOU/Assets/changed.wav'; f.submitted.name = 'changed'; f.session.save(); f.session.save()
  expect(f.persist).toHaveBeenCalledTimes(1); expect(f.states.at(-1)?.phase).toBe('succeeded')
  expect(f.repository.load(f.project.id)?.assets[0]).toMatchObject({ uri: draft.path, kind: draft.kind, metadata: { name: draft.name, durationMs: 1000 } })
  expect(f.history.restoreReversibly(f.project, f.history.list(f.project.id)[0].id).project.assets).toHaveLength(0)
})
it.each(['snapshot', 'persist'] as const)('retries only metadata after %s failure without reinspection or duplicates', async part => {
  const f = fixture(); await f.session.inspect(); f[part].mockImplementationOnce(() => { throw Error('storage full') }); f.session.save()
  expect(f.states.at(-1)?.phase).toBe('saveFailed'); expect(f.project.assets).toHaveLength(0)
  f.session.save(); expect(f.states.at(-1)?.phase).toBe('succeeded'); expect(f.project.assets).toHaveLength(1); expect(f.client.probe).toHaveBeenCalledTimes(1)
  expect(f.history.list(f.project.id)).toHaveLength(1)
})
it.each(['project', 'connection', 'draft/unmount'] as const)('discards late results after %s and A→B→A', async kind => {
  const f = fixture(), old = f.project, pending = deferred<MediaProbeResult>()
  f.client.probe.mockReturnValue(pending.promise); const running = f.session.inspect(); await Promise.resolve()
  if (kind === 'project') { f.edit({ ...old, script: 'edit' }); f.edit(old) }
  if (kind === 'connection') { f.connect('other'); f.connect('original') }
  if (kind === 'draft/unmount') f.session.detach()
  pending.resolve(probe); await running; f.session.save()
  expect(f.session.wasDetached).toBe(true); expect(f.persist).not.toHaveBeenCalled(); expect(f.states.some(state => state.phase === 'review')).toBe(false)
})
it('does not probe after a stale health reply', async () => {
  const f = fixture(), pending = deferred<Awaited<ReturnType<typeof f.client.health>>>()
  f.client.health.mockReturnValue(pending.promise); const running = f.session.inspect(); f.session.detach()
  pending.resolve({ workerId: 'test', name: 'test', platform: 'test', version: '1', capabilities: [], managedRoots: ['/private/tmp/KINAOU'] }); await running
  expect(f.client.probe).not.toHaveBeenCalled()
})
it('invalidates an already reviewed file when project changes before saving', async () => {
  const f = fixture(); await f.session.inspect(); f.edit({ ...f.project, script: 'new edit' }); f.session.save()
  expect(f.persist).not.toHaveBeenCalled(); expect(f.session.canSave).toBe(false)
})
it('serializes inspection and permits explicit retry of read-only failures', async () => {
  const f = fixture(); f.client.probe.mockRejectedValueOnce(Error('missing'))
  const running = f.session.inspect(); await f.session.inspect(); await running
  expect(f.states.at(-1)?.phase).toBe('failed'); await f.session.inspect(); expect(f.states.at(-1)?.phase).toBe('review'); expect(f.client.probe).toHaveBeenCalledTimes(2)
})
it('rejects duplicate managed references before contacting worker', async () => {
  const f = fixture(); await f.session.inspect(); f.session.save()
  const duplicate = new ManagedMediaSession(f.project, 'original', draft, { client: f.client, environment: () => ({ project: f.project, connection: 'original' }), snapshot: f.snapshot, persist: f.persist, publish: value => f.states.push(value) })
  await duplicate.inspect(); duplicate.save(); expect(f.states.at(-1)?.phase).toBe('failed'); expect(f.client.probe).toHaveBeenCalledTimes(1); expect(f.project.assets).toHaveLength(1)
})
it.each(['KINAOU/Assets/', 'KINAOU/Assets/../secret.wav', 'KINAOU/Assets/./file.wav', 'KINAOU/Assets//file.wav', 'KINAOU/Assets/a\\b.wav', '/tmp/a.wav', ' KINAOU/Assets/a.wav', 'KINAOU/Renders/a.wav'])('rejects unsafe/non-file path %s', path => {
  expect(() => validateManagedMediaDraft({ ...draft, path })).toThrow()
})
it.each([{ path: '/another/KINAOU/Assets/Original.wav' }, { sizeBytes: 0 }, { sizeBytes: NaN }, { durationMs: undefined }, { durationMs: Infinity }, { audioCodec: '' }, { channels: -1 }])('rejects invalid probe %j', patch => {
  expect(() => validateManagedMediaProbe(draft, ['/private/tmp/KINAOU'], { ...probe, ...patch })).toThrow()
})
it('requires image/video stream measurements and does not register a still as video', () => {
  const still = { path: 'KINAOU/Assets/photo.png', kind: 'image' as const, name: '' }, measured = { path: still.path, sizeBytes: 200, videoCodec: 'png', width: 100, height: 100 }
  expect(() => validateManagedMediaProbe(still, [], measured)).not.toThrow()
  expect(() => validateManagedMediaProbe({ ...still, kind: 'video' }, [], measured)).toThrow()
  expect(() => validateManagedMediaProbe(still, [], { ...measured, width: undefined })).toThrow()
  expect(() => validateManagedMediaProbe({ ...draft, kind: 'video' }, [], { ...probe, path: draft.path })).toThrow()
})
it.each(uiLanguages)('renders review/save boundaries and escaped original names in %s', language => {
  const f = fixture(), render = (children: ReturnType<typeof createElement>) => renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: language, children }))
  const html = render(createElement(ManagedMediaPanel, { project: f.project, history: f.history, workerUrl: '', workerToken: '', workerConnected: false, onProjectChange: vi.fn() }))
  expect(html).toContain(translateUi(language, 'managed.heading')); expect(html).toContain('disabled=""')
  for (const phase of ['checking', 'review', 'saving', 'succeeded', 'failed', 'saveFailed', 'detached'] as const) {
    const status = render(createElement(ManagedMediaStatus, { feedback: { phase, draft: { ...draft, name: '<script>original' }, probe, detail: '<script>diagnostic' } }))
    expect(status).toContain(translateUi(language, `managed.${phase}`)); expect(status).toContain('&lt;script&gt;original'); expect(status).toContain('&lt;script&gt;diagnostic')
  }
})
