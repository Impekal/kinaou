import { expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { AssetAvailabilitySession, type AvailabilityFeedback } from '../src/core/assetAvailabilitySession'
import { AssetAvailabilityControl, AssetAvailabilityStatus } from '../src/components/AssetAvailabilityControl'
import { createProject, parseProject, type KinaouProject } from '../src/core/project'
import { ProjectRepository } from '../src/core/persistence'
import { PersistentVersionHistory } from '../src/core/versioning'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import { uiLanguages } from '../src/core/uiLanguage'
import { translateUi } from '../src/core/uiMessages'
const path = 'KINAOU/Assets/Original.wav'
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r }); return { promise, resolve } }
function fixture(count = 1) {
  const data = new Map<string, string>(), storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value) }, removeItem: (key: string) => { data.delete(key) } }
  const repository = new ProjectRepository(storage), history = new PersistentVersionHistory(storage)
  let project = repository.save(parseProject({ ...createProject('Original title'), assets: Array.from({ length: count }, (_, i) => ({ id: String(i), kind: 'audio', uri: i ? path + i : path, managed: true, offline: false, metadata: { name: 'Original name', durationMs: 1000 } })) })), connection = 'original'
  const states: AvailabilityFeedback[] = []
  const client = { assetAvailability: vi.fn(async (paths: string[]) => paths.map(path => ({ path, available: false }))) }
  const snapshot = vi.fn((value: KinaouProject) => { history.snapshot(value, 'Before availability', 'system') }), persist = vi.fn((value: KinaouProject) => { project = repository.save(value) })
  const session = new AssetAvailabilitySession(project, connection, { client, environment: () => ({ project, connection }), snapshot, persist, publish: value => states.push(value), now: () => '2026-09-21T00:00:00Z' })
  return { session, states, client, snapshot, persist, history, repository, get project() { return project }, edit: (value: KinaouProject) => { project = value; session.observe(project, connection) }, connect: (value: string) => { connection = value; session.observe(project, connection) } }
}
it('saves offline flags only after complete checks and reversible safety history', async () => {
  const f = fixture(); await f.session.run(); await f.session.run()
  expect(f.client.assetAvailability).toHaveBeenCalledTimes(1)
  expect(f.states.at(-1)).toEqual({ phase: 'succeeded', summary: { checked: 1, wentOffline: 1, cameOnline: 0, offline: 1, checkedAt: '2026-09-21T00:00:00Z' } })
  expect(f.repository.load(f.project.id)?.assets[0].offline).toBe(true)
  expect(f.history.restoreReversibly(f.project, f.history.list(f.project.id)[0].id).project.assets[0].offline).toBe(false)
})
it('does not rewrite projects or create history when every file remains available', async () => {
  const f = fixture(); f.client.assetAvailability.mockResolvedValue([{ path, available: true }]); await f.session.run()
  expect(f.states.at(-1)?.phase).toBe('succeeded'); expect(f.persist).not.toHaveBeenCalled(); expect(f.snapshot).not.toHaveBeenCalled()
})
it.each(['snapshot', 'persist'] as const)('never reports saved success after %s failure', async part => {
  const f = fixture(); f[part].mockImplementationOnce(() => { throw Error('storage failure') }); await f.session.run()
  expect(f.states.at(-1)?.phase).toBe('failed'); expect(f.project.assets[0].offline).toBe(false)
  f.client.assetAvailability.mockResolvedValue([{ path, available: true }]); await f.session.run()
  expect(f.client.assetAvailability).toHaveBeenCalledTimes(2); expect(f.states.at(-1)?.summary?.wentOffline).toBe(0)
})
it.each(['missing', 'duplicate', 'foreign', 'invalid'] as const)('rejects %s availability results atomically', async kind => {
  const f = fixture()
  const results = kind === 'missing' ? [] : kind === 'duplicate' ? [{ path, available: true }, { path, available: false }] : kind === 'foreign' ? [{ path: path + '.other', available: false }] : [{ path, available: 'false' }]
  f.client.assetAvailability.mockResolvedValue(results as { path: string; available: boolean }[])
  await f.session.run(); expect(f.states.at(-1)?.phase).toBe('failed'); expect(f.persist).not.toHaveBeenCalled(); expect(f.snapshot).not.toHaveBeenCalled()
})
it.each(['project', 'connection', 'detach'] as const)('ignores delayed checks after %s and round trips', async kind => {
  const f = fixture(), old = f.project, pending = deferred<{ path: string; available: boolean }[]>()
  f.client.assetAvailability.mockReturnValue(pending.promise); const running = f.session.run()
  if (kind === 'project') { f.edit({ ...old, script: 'new edit' }); f.edit(old) }
  if (kind === 'connection') { f.connect('other'); f.connect('original') }
  if (kind === 'detach') f.session.detach()
  pending.resolve([{ path, available: false }]); await running
  expect(f.session.wasDetached).toBe(true); expect(f.persist).not.toHaveBeenCalled()
})
it('serializes at most 1000 paths and makes no partial project changes', async () => {
  const f = fixture(1001), pending = deferred<{ path: string; available: boolean }[]>()
  f.client.assetAvailability.mockReturnValueOnce(pending.promise)
  const running = f.session.run(); await f.session.run()
  expect(f.client.assetAvailability).toHaveBeenCalledTimes(1); expect(f.persist).not.toHaveBeenCalled()
  pending.resolve(f.client.assetAvailability.mock.calls[0][0].map(path => ({ path, available: false }))); await running
  expect(f.client.assetAvailability.mock.calls.map(([paths]) => paths.length)).toEqual([1000, 1]); expect(f.persist).toHaveBeenCalledTimes(1)
})
it('does not save first-batch flags if a later batch fails', async () => {
  const f = fixture(1001); f.client.assetAvailability.mockImplementationOnce(async paths => paths.map(path => ({ path, available: false }))).mockRejectedValueOnce(Error('disconnected'))
  await f.session.run(); expect(f.states.at(-1)?.phase).toBe('failed'); expect(f.persist).not.toHaveBeenCalled(); expect(f.project.assets.every(asset => !asset.offline)).toBe(true)
})
it.each(uiLanguages)('renders truthful check boundaries and saved summaries in %s', language => {
  const f = fixture(), render = (children: ReturnType<typeof createElement>) => renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: language, children }))
  const html = render(createElement(AssetAvailabilityControl, { project: f.project, history: f.history, workerUrl: 'http://127.0.0.1:1', workerToken: '', workerConnected: false, onProjectChange: vi.fn() }))
  expect(html).toContain(translateUi(language, 'availability.heading')); expect(html).toContain('disabled=""')
  for (const phase of ['checking', 'succeeded', 'failed', 'detached'] as const) {
    const status = render(createElement(AssetAvailabilityStatus, { feedback: { phase, detail: '<script>diagnostic', ...(phase === 'succeeded' ? { summary: { checked: 2, wentOffline: 1, cameOnline: 0, offline: 1, checkedAt: '2026-09-21T00:00:00Z' } } : {}) } }))
    expect(status).toContain(translateUi(language, `availability.${phase}`)); expect(status).toContain('&lt;script&gt;diagnostic')
  }
})
