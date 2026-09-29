import { it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { SourceLibrarySession, type SourceLibraryFeedback } from '../src/core/projectSourceLibrary'
import { validateSourceLibraryQuery, validateSourceLibraryPage } from '../worker/project-source-library-protocol.mjs'
import { ProjectSourceArchiveLibraryPanel } from '../src/components/ProjectSourceArchiveLibraryPanel'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import { uiLanguages } from '../src/core/uiLanguage'
import { uiSourceLibraryMessages } from '../src/core/uiSourceLibraryMessages'
import { translateUi } from '../src/core/uiMessages'
import { WorkerClient } from '../src/core/workerClient'
const query = { schemaVersion: 1 as const, requestId: '00000000-0000-4000-8000-000000000001', projectId: 'old-project', projectSha256: 'a'.repeat(64) }
const page = { schemaVersion: 1 as const, entries: [{ query, hasCompletionRecord: true }], scanned: 1, skipped: 0 }
const job = { schemaVersion: 1 as const, query, state: 'interrupted' as const, error: 'Historical incomplete archive' }
it('validates global metadata discovery without requiring a current project or browser ticket', () => {
  expect(validateSourceLibraryQuery({})).toEqual({}); expect(validateSourceLibraryPage(page, {})).toEqual(page)
  expect(page).not.toHaveProperty('integrityCheckedAt')
})
it.each(['query', 'order', 'counts', 'cursor', 'scope', 'completion', 'title'] as const)('rejects invalid %s page bindings', issue => {
  const changed = structuredClone(page) as any
  if (issue === 'query') changed.entries[0].query.requestId = '../outside'
  if (issue === 'order') { changed.entries.push(changed.entries[0]); changed.scanned = 2 }
  if (issue === 'counts') changed.skipped = 1
  if (issue === 'cursor') changed.nextCursor = query.requestId
  if (issue === 'scope') changed.after = query.requestId
  if (issue === 'completion') changed.entries[0].hasCompletionRecord = 'verified'
  if (issue === 'title') changed.entries[0].titleHint = 'Unsafe\nlabel'
  expect(() => validateSourceLibraryPage(changed, {})).toThrow()
})
it('uses only explicit list/status calls and does not confuse recorded completion with integrity', async () => {
  const events: SourceLibraryFeedback[] = [], client = { listProjectSourceArchives: vi.fn(async () => page), projectSourceArchiveStatus: vi.fn(async () => job) }
  const session = new SourceLibrarySession({ client, current: () => true, publish: value => events.push(value) })
  expect(events).toEqual([]); expect(client.listProjectSourceArchives).not.toHaveBeenCalled()
  await session.list(); expect(events.at(-1)?.phase).toBe('page'); expect(client.projectSourceArchiveStatus).not.toHaveBeenCalled()
  await session.inspect(query); expect(events.at(-1)?.job?.state).toBe('interrupted'); expect(client.projectSourceArchiveStatus).toHaveBeenCalledWith(query)
})
it.each(['success', 'failure'] as const)('discards delayed %s after detach and A-B-A context changes', async outcome => {
  let resolve!: (value: typeof page) => void, reject!: (cause: Error) => void
  const events: SourceLibraryFeedback[] = [], waiting = new Promise<typeof page>((a, b) => { resolve = a; reject = b })
  const session = new SourceLibrarySession({ client: { listProjectSourceArchives: () => waiting, projectSourceArchiveStatus: async () => job }, current: () => true, publish: value => events.push(value) })
  const active = session.list(); session.detach()
  if (outcome === 'success') resolve(page); else reject(Error('Late failure'))
  await active; expect(events.map(value => value.phase)).toEqual(['listing'])
})
it('blocks duplicate in-flight work and reports mismatched project/hash results as errors', async () => {
  let finish!: (value: typeof page) => void
  const events: SourceLibraryFeedback[] = [], client = { listProjectSourceArchives: vi.fn(() => new Promise<typeof page>(resolve => { finish = resolve })), projectSourceArchiveStatus: vi.fn(async () => ({ ...job, query: { ...query, projectId: 'wrong' } })) }
  const session = new SourceLibrarySession({ client, current: () => true, publish: value => events.push(value) })
  const pending = session.list(); await session.list(); expect(client.listProjectSourceArchives).toHaveBeenCalledTimes(1); finish(page); await pending
  await session.inspect(query); expect(events.at(-1)?.phase).toBe('failed')
})
it.each(uiLanguages)('renders archive recovery without a project or automatic requests in %s', language => {
  const fetch = vi.spyOn(globalThis, 'fetch')
  try {
    const html = renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: language, children: createElement(ProjectSourceArchiveLibraryPanel, { workerUrl: 'http://127.0.0.1:43117', workerToken: 'PRIVATE', workerConnected: true, workerCapabilities: ['project-source-library'], managedRoots: ['/fixture/KINAOU'] }) }))
    expect(html).toContain(translateUi(language, 'sourceLibrary.heading')); expect(html).not.toContain('PRIVATE'); expect(fetch).not.toHaveBeenCalled()
    for (const key of Object.keys(uiSourceLibraryMessages) as (keyof typeof uiSourceLibraryMessages)[]) expect(translateUi(language, key)).not.toBe(key)
  } finally { fetch.mockRestore() }
})
it('sends discovery only to the authenticated read-only worker list route', async () => {
  const fetchImpl = vi.fn(async (_url: string | URL | Request, _options?: RequestInit) => new Response(JSON.stringify({ ok: true, type: 'project-source-library', page })))
  const client = new WorkerClient({ baseUrl: 'http://127.0.0.1:43117', token: 'fixture-only', fetchImpl })
  expect(await client.listProjectSourceArchives({})).toEqual(page)
  expect(fetchImpl.mock.calls[0][0]).toBe('http://127.0.0.1:43117/projects/source-archive/list')
  expect(JSON.parse(String(fetchImpl.mock.calls[0][1]?.body))).toEqual({})
})
