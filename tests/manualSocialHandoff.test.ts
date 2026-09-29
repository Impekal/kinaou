import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { ManualSocialHandoffSession, manualSocialDestinations, prepareManualSocialHandoff } from '../src/core/manualSocialHandoff'
import { publishPackageEntrySchema, type PublishIntegrityResult, type PublishPackageEntry } from '../src/core/publishPackage'
import { WorkerClient } from '../src/core/workerClient'
import { ManualSocialHandoffPanel } from '../src/components/ManualSocialHandoffPanel'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import { uiLanguages } from '../src/core/uiLanguage'
import { uiManualSocialHandoffMessages } from '../src/core/uiManualSocialHandoffMessages'
import { translateUi } from '../src/core/uiMessages'

const date = '2026-09-29T12:00:00.000Z', digest = 'a'.repeat(64)
function fixture() {
  return publishPackageEntrySchema.parse({ path: 'KINAOU/Renders/demo_generic.publish.json', sizeBytes: 640,
    modifiedAt: date, sourceAvailable: true, document: {
      kind: 'kinaou-publish-package', schemaVersion: 3, createdAt: date, projectId: 'project-1',
      platform: 'generic', placement: 'generic', title: 'Bonjour', description: 'Überblick 🌍\n<script>not code</script>',
      tags: ['Local AI', 'Fußball'], delivery: { checkedAt: date, ready: true, preferredFormat: 'landscape' },
      media: { schemaVersion: 1, jobId: 'render-1', label: 'Example', outputRelativePath: 'KINAOU/Renders/demo.mp4',
        format: 'vertical', range: { inMs: 0, outMs: 8000 }, sceneIds: [], durationMs: 8000, sizeBytes: 1234, completedAt: date },
      integrity: { checkedAt: date, sha256: digest, actual: { sizeBytes: 1234, durationMs: 8000, width: 1080, height: 1920, videoCodec: 'h264', audioCodec: 'aac' } }
    } })
}
function evidence(): PublishIntegrityResult {
  return { schemaVersion: 1, packagePath: fixture().path, sourcePath: fixture().document.media.outputRelativePath,
    checkedAt: date, status: 'unchanged', expectedSha256: digest, actualSha256: digest, sizeBytes: 1234 }
}
it.each(['facebook', 'threads'] as const)('preserves historical text, paths and tags for %s without mutation or publication state', destination => {
  const entry = fixture(), before = JSON.stringify(entry)
  const handoff = prepareManualSocialHandoff('project-1', destination, entry, evidence())
  expect(handoff).toMatchObject({ destination, caption: 'Bonjour\n\nÜberblick 🌍\n<script>not code</script>', tags: ['Local AI', 'Fußball'], packagedAt: date, checkedAt: date, sha256: digest })
  expect(handoff).not.toHaveProperty('published'); expect(handoff).not.toHaveProperty('publishId')
  handoff.tags.push('new'); expect(JSON.stringify(entry)).toBe(before)
  const url = new URL(manualSocialDestinations[destination].url)
  expect(url.protocol).toBe('https:'); expect(url.pathname).toBe('/'); expect(url.search).toBe(''); expect(url.hash).toBe('')
})
it.each([
  { packagePath: 'KINAOU/Renders/other.publish.json' }, { sourcePath: 'KINAOU/Renders/other.mp4' },
  { sizeBytes: 5678 }, { expectedSha256: 'b'.repeat(64) }, { actualSha256: 'b'.repeat(64) },
  { status: 'modified' }, { status: 'missing', actualSha256: undefined, sizeBytes: undefined }
])('rejects wrong file evidence %j', patch => {
  expect(() => prepareManualSocialHandoff('project-1', 'facebook', fixture(), { ...evidence(), ...patch } as PublishIntegrityResult)).toThrow()
})
it('rejects cross-project, unavailable, wrong-platform and legacy packages, and unknown destinations', () => {
  expect(() => prepareManualSocialHandoff('other', 'threads', fixture(), evidence())).toThrow()
  expect(() => prepareManualSocialHandoff('project-1', 'threads', { ...fixture(), sourceAvailable: false }, evidence())).toThrow()
  const platform = fixture(); Object.assign(platform.document, { platform: 'tiktok', placement: 'tiktok-video', delivery: { checkedAt: date, ready: true, preferredFormat: 'vertical' } })
  expect(() => prepareManualSocialHandoff('project-1', 'threads', platform, evidence())).toThrow()
  const legacy = fixture(); const { delivery: _d, placement: _p, integrity: _i, ...base } = legacy.document as Extract<PublishPackageEntry['document'], { schemaVersion: 3 }>
  legacy.document = { ...base, schemaVersion: 1 }
  expect(() => prepareManualSocialHandoff('project-1', 'threads', legacy, evidence())).toThrow()
  expect(() => prepareManualSocialHandoff('project-1', 'unknown' as 'threads', fixture(), evidence())).toThrow()
})
it('only reads local library and hashes explicitly; never accounts, uploads or automatic retries', async () => {
  const fetchImpl = vi.fn(async (url: string | URL | Request) => {
    if (String(url).includes('/publish/packages?')) return new Response(JSON.stringify({ ok: true, type: 'publish-packages', packages: [fixture()] }))
    if (String(url).endsWith('/publish/packages/integrity')) return new Response(JSON.stringify({ ok: true, type: 'publish-package-integrity', result: evidence() }))
    throw new Error('Forbidden operation')
  })
  const session = new ManualSocialHandoffSession('project-1', 'threads', new WorkerClient({ baseUrl: 'http://127.0.0.1:43117', token: 'local-token', fetchImpl }))
  expect(fetchImpl).not.toHaveBeenCalled(); await expect(session.verify(fixture().path)).rejects.toThrow()
  await session.list(); expect((await session.verify(fixture().path))?.destination).toBe('threads')
  expect(fetchImpl.mock.calls.map(c => String(c[0]))).toEqual(['http://127.0.0.1:43117/publish/packages?projectId=project-1', 'http://127.0.0.1:43117/publish/packages/integrity'])
})
it('filters wrong scopes and retains independent metadata snapshots', async () => {
  const other = fixture(); other.document.projectId = 'other'
  const platform = fixture(); Object.assign(platform.document, { platform: 'tiktok', placement: 'tiktok-video', delivery: { checkedAt: date, ready: true, preferredFormat: 'vertical' } })
  const session = new ManualSocialHandoffSession('project-1', 'facebook', { listPublishPackages: async () => [fixture(), other, platform, { ...fixture(), sourceAvailable: false }], verifyPublishPackageIntegrity: async () => evidence() })
  const entries = await session.list(); expect(entries).toHaveLength(1)
  entries![0].document.title = 'Mutated'; expect((await session.verify(fixture().path))?.caption).toContain('Bonjour')
})
it('refuses duplicate package paths instead of displaying ambiguous selection', async () => {
  const reader = { listPublishPackages: async () => [fixture(), fixture()], verifyPublishPackageIntegrity: vi.fn() }
  const session = new ManualSocialHandoffSession('project-1', 'threads', reader)
  await expect(session.list()).rejects.toThrow('Duplicate'); await expect(session.verify(fixture().path)).rejects.toThrow()
  expect(reader.verifyPublishPackageIntegrity).not.toHaveBeenCalled()
})
it.each(['list', 'verify'] as const)('drops obsolete %s successes and errors after scope changes', async mode => {
  for (const fail of [false, true]) {
    let resolve!: (value: never) => void, reject!: (cause: Error) => void
    const pending = () => new Promise<never>((yes, no) => { resolve = yes; reject = no })
    const session = new ManualSocialHandoffSession('project-1', 'facebook', {
      listPublishPackages: mode === 'list' ? pending : async () => [fixture()], verifyPublishPackageIntegrity: pending
    })
    if (mode === 'verify') await session.list()
    const request = mode === 'list' ? session.list() : session.verify(fixture().path)
    session.invalidate()
    if (fail) reject(new Error('Obsolete')); else resolve((mode === 'list' ? [fixture()] : evidence()) as never)
    expect(await request).toBeNull()
  }
})
it('failed refresh discards old snapshots and allows only an explicit retry', async () => {
  const reader = { listPublishPackages: vi.fn().mockResolvedValueOnce([fixture()]).mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce([fixture()]), verifyPublishPackageIntegrity: vi.fn(async () => evidence()) }
  const session = new ManualSocialHandoffSession('project-1', 'facebook', reader)
  await session.list(); await expect(session.list()).rejects.toThrow('Offline')
  await expect(session.verify(fixture().path)).rejects.toThrow(); expect(reader.listPublishPackages).toHaveBeenCalledTimes(2)
  await session.list(); expect(await session.verify(fixture().path)).not.toBeNull()
})
it.each(uiLanguages)('renders translated, inert manual controls in %s without leaking credentials', language => {
  const spy = vi.spyOn(globalThis, 'fetch')
  try {
    const html = renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: language, children: createElement(ManualSocialHandoffPanel, {
      projectId: 'project-1', workerUrl: 'http://127.0.0.1:43117', workerToken: 'SECRET-TOKEN', workerConnected: true, workerCapabilities: ['publish-package-library', 'publish-package-integrity']
    }) }))
    for (const key of ['manualSocial.heading', 'manualSocial.load', 'manualSocial.notPublished'] as const) expect(html).toContain(translateUi(language, key))
    for (const key of Object.keys(uiManualSocialHandoffMessages) as (keyof typeof uiManualSocialHandoffMessages)[]) expect(translateUi(language, key)).not.toBe(key)
    expect(html).not.toContain('SECRET-TOKEN'); expect(html).not.toContain('href='); expect(spy).not.toHaveBeenCalled()
  } finally { spy.mockRestore() }
})
it('disables operations without connection, capabilities or credentials', () => {
  for (const partial of [{ workerConnected: false }, { workerCapabilities: [] }, { workerToken: '' }]) {
    const html = renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: 'en', children: createElement(ManualSocialHandoffPanel, {
      projectId: 'p', workerUrl: '', workerToken: 'token', workerConnected: true, workerCapabilities: ['publish-package-library', 'publish-package-integrity'], ...partial
    }) }))
    expect(html).toContain('Connect the local worker'); expect(html.match(/disabled=""/g)).toHaveLength(2)
  }
})
