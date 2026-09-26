import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { TikTokHandoffSession, prepareTikTokHandoff } from '../src/core/tiktokHandoff'
import { publishPackageEntrySchema, type PublishIntegrityResult, type PublishPackageEntry } from '../src/core/publishPackage'
import { WorkerClient } from '../src/core/workerClient'
import { TikTokHandoffPanel } from '../src/components/TikTokHandoffPanel'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import { uiLanguages } from '../src/core/uiLanguage'
import { uiTikTokHandoffMessages } from '../src/core/uiTikTokHandoffMessages'
import { translateUi } from '../src/core/uiMessages'

const date = '2026-09-27T12:00:00.000Z'
const digest = 'a'.repeat(64)
function fixture() {
  return publishPackageEntrySchema.parse({
    path: 'KINAOU/Renders/demo_tiktok.publish.json', sizeBytes: 640, modifiedAt: date, sourceAvailable: true,
    document: {
      kind: 'kinaou-publish-package', schemaVersion: 3, createdAt: date, projectId: 'project-1',
      platform: 'tiktok', placement: 'tiktok-video', title: 'Bonjour', description: 'Überblick 🌍',
      tags: ['Local AI', 'Fußball'],
      delivery: { checkedAt: date, ready: true, preferredFormat: 'vertical' },
      media: { schemaVersion: 1, jobId: 'render-1', label: 'Example', outputRelativePath: 'KINAOU/Renders/demo.mp4',
        format: 'vertical', range: { inMs: 0, outMs: 8000 }, sceneIds: ['scene-1'], durationMs: 8000, sizeBytes: 1234, completedAt: date },
      integrity: { checkedAt: date, sha256: digest, actual: { sizeBytes: 1234, durationMs: 8000, width: 1080, height: 1920, videoCodec: 'h264', audioCodec: 'aac' } }
    }
  })
}
function evidence(): PublishIntegrityResult {
  return { schemaVersion: 1, packagePath: fixture().path, sourcePath: fixture().document.media.outputRelativePath,
    checkedAt: date, status: 'unchanged', expectedSha256: digest, actualSha256: digest, sizeBytes: 1234 }
}

it('builds an immutable local handoff without publication state or automatic hashtag rewriting', () => {
  const entry = fixture()
  const before = JSON.stringify(entry)
  const result = prepareTikTokHandoff('project-1', entry, evidence())
  expect(result.caption).toBe('Bonjour\n\nÜberblick 🌍')
  expect(result.tags).toEqual(['Local AI', 'Fußball'])
  expect(result.sourcePath).toBe('KINAOU/Renders/demo.mp4')
  expect(result).not.toHaveProperty('published')
  expect(result).not.toHaveProperty('publishId')
  result.tags.push('another')
  expect(JSON.stringify(entry)).toBe(before)
})

it.each([
  ['package path', { packagePath: 'KINAOU/Renders/other.publish.json' }],
  ['source path', { sourcePath: 'KINAOU/Renders/other.mp4' }],
  ['size', { sizeBytes: 5678 }],
  ['digest', { expectedSha256: 'b'.repeat(64), actualSha256: 'b'.repeat(64) }],
  ['modified', { status: 'modified', actualSha256: 'b'.repeat(64) }],
  ['missing', { status: 'missing', actualSha256: undefined, sizeBytes: undefined }]
])('rejects mismatched %s evidence', (_, patch) => {
  expect(() => prepareTikTokHandoff('project-1', fixture(), { ...evidence(), ...patch } as PublishIntegrityResult)).toThrow()
})

it('rejects another project, an unavailable source and legacy packages', () => {
  expect(() => prepareTikTokHandoff('other', fixture(), evidence())).toThrow()
  expect(() => prepareTikTokHandoff('project-1', { ...fixture(), sourceAvailable: false }, evidence())).toThrow()
  const legacy = fixture()
  const { delivery: _delivery, placement: _placement, integrity: _integrity, ...base } = legacy.document as Extract<PublishPackageEntry['document'], { schemaVersion: 3 }>
  legacy.document = { ...base, schemaVersion: 1 }
  expect(() => prepareTikTokHandoff('project-1', legacy, evidence())).toThrow()
})

it('only reads the local package library and hashes after explicit calls, with no OAuth or upload', async () => {
  const fetchImpl = vi.fn(async (url: string | URL | Request) => {
    if (String(url).includes('/publish/packages?')) return new Response(JSON.stringify({ ok: true, type: 'publish-packages', packages: [fixture()] }))
    if (String(url).endsWith('/publish/packages/integrity')) return new Response(JSON.stringify({ ok: true, type: 'publish-package-integrity', result: evidence() }))
    throw new Error('Forbidden remote or publication operation')
  })
  const session = new TikTokHandoffSession('project-1', new WorkerClient({ baseUrl: 'http://127.0.0.1:43117', token: 'local-token', fetchImpl }))
  expect(fetchImpl).not.toHaveBeenCalled()
  await expect(session.verify(fixture().path)).rejects.toThrow()
  await session.list()
  await expect(session.verify(fixture().path)).resolves.toMatchObject({ sha256: digest })
  expect(fetchImpl.mock.calls.map(call => String(call[0]))).toEqual([
    'http://127.0.0.1:43117/publish/packages?projectId=project-1',
    'http://127.0.0.1:43117/publish/packages/integrity'
  ])
})

it('filters cross-project and unavailable packages, and keeps an independent snapshot', async () => {
  const other = fixture(); other.document.projectId = 'other'
  const reader = { listPublishPackages: vi.fn(async () => [fixture(), other, { ...fixture(), sourceAvailable: false }]), verifyPublishPackageIntegrity: vi.fn(async () => evidence()) }
  const session = new TikTokHandoffSession('project-1', reader)
  const entries = await session.list()
  expect(entries).toHaveLength(1)
  entries![0].document.title = 'Tampered after listing'
  expect((await session.verify(fixture().path))?.title).toBe('Bonjour')
})

it('discards a late list after context invalidation', async () => {
  let finish!: (entries: PublishPackageEntry[]) => void
  const reader = { listPublishPackages: () => new Promise<PublishPackageEntry[]>(resolve => { finish = resolve }), verifyPublishPackageIntegrity: vi.fn() }
  const session = new TikTokHandoffSession('project-1', reader)
  const pending = session.list()
  session.invalidate()
  finish([fixture()])
  expect(await pending).toBeNull()
  await expect(session.verify(fixture().path)).rejects.toThrow()
  expect(reader.verifyPublishPackageIntegrity).not.toHaveBeenCalled()
})

it('discards a late verification after selection/context changes', async () => {
  let finish!: (result: PublishIntegrityResult) => void
  const session = new TikTokHandoffSession('project-1', {
    listPublishPackages: async () => [fixture()],
    verifyPublishPackageIntegrity: () => new Promise(resolve => { finish = resolve })
  })
  await session.list()
  const pending = session.verify(fixture().path)
  session.invalidate()
  finish(evidence())
  expect(await pending).toBeNull()
})

it('a failed refresh clears the previous package snapshot; no retry is attempted', async () => {
  const reader = { listPublishPackages: vi.fn().mockResolvedValueOnce([fixture()]).mockRejectedValueOnce(new Error('Offline')), verifyPublishPackageIntegrity: vi.fn() }
  const session = new TikTokHandoffSession('project-1', reader)
  await session.list()
  await expect(session.list()).rejects.toThrow('Offline')
  await expect(session.verify(fixture().path)).rejects.toThrow()
  expect(reader.listPublishPackages).toHaveBeenCalledTimes(2)
  expect(reader.verifyPublishPackageIntegrity).not.toHaveBeenCalled()
})

it.each(uiLanguages)('renders an explicit manual handoff in %s without calls, secrets or publication controls', language => {
  const props = { projectId: 'project-1', workerUrl: 'http://127.0.0.1:43117', workerToken: 'SECRET-WORKER-TOKEN',
    workerConnected: true, workerCapabilities: ['publish-package-library', 'publish-package-integrity'] }
  const fetchSpy = vi.spyOn(globalThis, 'fetch')
  try {
    const html = renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: language,
      children: createElement(TikTokHandoffPanel, props) }))
    for (const key of ['tiktok.handoff.heading', 'tiktok.handoff.load', 'tiktok.handoff.notPublished'] as const) expect(html).toContain(translateUi(language, key))
    for (const key of Object.keys(uiTikTokHandoffMessages) as (keyof typeof uiTikTokHandoffMessages)[]) expect(translateUi(language, key)).not.toBe(key)
    expect(html).not.toContain(props.workerToken)
    expect(html).not.toContain('href=')
    expect(fetchSpy).not.toHaveBeenCalled()
  } finally { fetchSpy.mockRestore() }
})

it('renders safely before any worker connection has been configured', () => {
  const html = renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: 'en',
    children: createElement(TikTokHandoffPanel, { projectId: 'project-1', workerUrl: '', workerToken: '',
      workerConnected: false, workerCapabilities: [] }) }))
  expect(html).toContain('Connect the local worker')
  expect(html.match(/disabled=""/g)).toHaveLength(2)
})
