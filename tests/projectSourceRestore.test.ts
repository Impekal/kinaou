import { it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { prepareSourceRestore, sourceRestoreScope, readSourceRestoreTicket, retainSourceRestoreTicket, forgetSourceRestoreTicket, SourceRestoreSession, type SourceRestoreFeedback } from '../src/core/projectSourceRestore'
import { sourceRestoreEvidence, validateSourceRestoreQuery, type SourceRestoreRequest, type SourceRestoreJob } from '../worker/project-source-restore-protocol.mjs'
import { sourceArchiveDirectory, type SourceArchiveJob } from '../worker/project-source-protocol.mjs'
import { WorkerClient } from '../src/core/workerClient'
import { ProjectSourceRestorePanel } from '../src/components/ProjectSourceRestorePanel'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import { uiSourceRestoreMessages } from '../src/core/uiSourceRestoreMessages'
import { uiLanguages } from '../src/core/uiLanguage'
import { translateUi } from '../src/core/uiMessages'
const query = { schemaVersion: 1 as const, requestId: '00000000-0000-4000-8000-000000000001', projectId: 'private-project', projectSha256: 'a'.repeat(64) }
const base = sourceArchiveDirectory(query.requestId)
const verified: SourceArchiveJob = { schemaVersion: 1, query, state: 'ready', result: { scope: 'project-registered-assets-v1', directory: base, projectPath: base + '/source/KINAOU/Projects/project.json', manifestPath: base + '/manifest.json', projectSha256: query.projectSha256, projectTitle: 'Private', createdAt: '2026-09-30T00:00:00Z', integrityCheckedAt: '2026-09-30T01:00:00Z', totalBytes: 0, files: [] } }
const scope = sourceRestoreScope('http://127.0.0.1:43117', ['/fixture/KINAOU'])
function storage() { const values = new Map<string, string>(); return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) }, removeItem: (key: string) => { values.delete(key) }, values } }
function job(request: SourceRestoreRequest): SourceRestoreJob { return { schemaVersion: 1, query: validateSourceRestoreQuery(request), state: 'interrupted', error: 'No complete copy' } }
it('requires explicit acknowledgement and a fully checked source, binding stable bytes not check timestamp', async () => {
  await expect(prepareSourceRestore(verified, 'fr', false)).rejects.toThrow()
  await expect(prepareSourceRestore({ ...verified, state: 'copying', result: undefined }, 'fr', true)).rejects.toThrow()
  const first = await prepareSourceRestore(verified, 'fr', true), later = structuredClone(verified)
  later.result!.integrityCheckedAt = '2026-10-01T00:00:00Z'
  expect(sourceRestoreEvidence(later)).toBe(sourceRestoreEvidence(verified))
  const second = await prepareSourceRestore(later, 'fr', true)
  expect(first.evidenceSha256).toBe(second.evidenceSha256); expect(first.restoreId).not.toBe(second.restoreId)
  expect(first.source).toEqual(query); expect(first).not.toHaveProperty('projectText')
})
it('retains one exact reminder per storage scope and refuses overwrite, changed removal and cross-root reuse', async () => {
  const s = storage(), request = await prepareSourceRestore(verified, 'de', true)
  retainSourceRestoreTicket(s, scope, request); expect(readSourceRestoreTicket(s, scope)).toEqual(request)
  expect(readSourceRestoreTicket(s, sourceRestoreScope('http://127.0.0.1:43117', ['/other/KINAOU']))).toBeNull()
  expect(() => retainSourceRestoreTicket(s, scope, request)).toThrow()
  expect(() => forgetSourceRestoreTicket(s, scope, { ...request, restoreId: crypto.randomUUID() })).toThrow()
  forgetSourceRestoreTicket(s, scope, request); expect(readSourceRestoreTicket(s, scope)).toBeNull()
})
it.each(['malformed','oversized','readback','denied'] as const)('refuses unsafe %s storage without losing existing data', async issue => {
  const s = storage(), request = await prepareSourceRestore(verified, 'en', true)
  retainSourceRestoreTicket(s, scope, request); const key = [...s.values.keys()][0]
  if (issue === 'malformed') s.values.set(key, '{invalid')
  if (issue === 'oversized') s.values.set(key, 'x'.repeat(4097))
  if (issue === 'readback') { s.values.clear(); s.setItem = () => {} }
  if (issue === 'denied') { s.values.clear(); s.setItem = () => { throw Error('Denied') } }
  expect(() => retainSourceRestoreTicket(s, scope, request)).toThrow()
})
it('reloaded session makes zero requests, status never restarts, and explicit retry reuses the exact ID', async () => {
  const request = await prepareSourceRestore(verified, 'fr', true), s = storage(), events: SourceRestoreFeedback[] = []
  retainSourceRestoreTicket(s, scope, request)
  const client = { startProjectSourceRestore: vi.fn(async () => job(request)), projectSourceRestoreStatus: vi.fn(async () => job(request)) }
  const session = new SourceRestoreSession(readSourceRestoreTicket(s, scope)!, { scope, storage: s, current: () => true, publish: v => events.push(v), client })
  expect(events).toEqual([]); expect(client.startProjectSourceRestore).not.toHaveBeenCalled()
  await session.run(); expect(client.startProjectSourceRestore).not.toHaveBeenCalled()
  await session.run(true); expect(client.startProjectSourceRestore).toHaveBeenCalledWith(request)
  expect(client.projectSourceRestoreStatus).toHaveBeenCalledWith(validateSourceRestoreQuery(request))
  expect(readSourceRestoreTicket(s, scope)).toEqual(request)
})
it('keeps durable identity when the submission response is lost and recovers through status only', async () => {
  const request = await prepareSourceRestore(verified, 'de', true), s = storage(), events: SourceRestoreFeedback[] = []
  retainSourceRestoreTicket(s, scope, request)
  const client = { startProjectSourceRestore: vi.fn(async () => { throw Error('Lost reply') }), projectSourceRestoreStatus: vi.fn(async () => job(request)) }
  const session = new SourceRestoreSession(request, { scope, storage: s, current: () => true, publish: v => events.push(v), client })
  await session.run(true); expect(events.at(-1)?.phase).toBe('uncertain'); expect(readSourceRestoreTicket(s, scope)).toEqual(request)
  await session.run(); expect(events.at(-1)?.job?.state).toBe('interrupted'); expect(client.startProjectSourceRestore).toHaveBeenCalledTimes(1)
})
it.each(['success','failure'] as const)('drops delayed %s after root/source detach including A-B-A', async outcome => {
  const request = await prepareSourceRestore(verified, 'en', true), s = storage(), events: SourceRestoreFeedback[] = []
  retainSourceRestoreTicket(s, scope, request)
  let resolve!: (v: SourceRestoreJob) => void, reject!: (e: Error) => void
  const waiting = new Promise<SourceRestoreJob>((a, b) => { resolve = a; reject = b }), client = { startProjectSourceRestore: vi.fn(() => waiting), projectSourceRestoreStatus: vi.fn(() => waiting) }
  const session = new SourceRestoreSession(request, { scope, storage: s, current: () => true, publish: v => events.push(v), client })
  const pending = session.run(true); await session.run(true); expect(client.startProjectSourceRestore).toHaveBeenCalledTimes(1)
  session.detach(); if (outcome === 'success') resolve(job(request)); else reject(Error('Late'))
  await pending; expect(events.map(v => v.phase)).toEqual(['checking']); expect(readSourceRestoreTicket(s, scope)).toEqual(request)
})
it('refuses changed reminder before network and mismatched response after network', async () => {
  const request = await prepareSourceRestore(verified, 'fr', true), s = storage(), events: SourceRestoreFeedback[] = []
  const client = { startProjectSourceRestore: vi.fn(async () => job(request)), projectSourceRestoreStatus: vi.fn(async () => ({ ...job(request), query: { ...validateSourceRestoreQuery(request), evidenceSha256: '0'.repeat(64) } })) }
  const session = new SourceRestoreSession(request, { scope, storage: s, current: () => true, publish: v => events.push(v), client })
  await session.run(true); expect(client.startProjectSourceRestore).not.toHaveBeenCalled()
  retainSourceRestoreTicket(s, scope, request); await session.run(); expect(events.at(-1)?.phase).toBe('uncertain')
})
it('requires one explicit worker storage root and no URL credentials', () => {
  expect(() => sourceRestoreScope('http://user:password@localhost:43117', ['/fixture/KINAOU'])).toThrow()
  for (const roots of [[], ['', 'second'], ['one', 'two'], ['']]) expect(() => sourceRestoreScope('http://127.0.0.1:43117', roots)).toThrow()
})
it.each(uiLanguages)('renders truthful explicit restoration controls in %s with no requests or credential disclosure', language => {
  const fetch = vi.spyOn(globalThis, 'fetch')
  try {
    const html = renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: language, children: createElement(ProjectSourceRestorePanel, { workerUrl: 'http://127.0.0.1:43117', workerToken: 'PRIVATE_TOKEN', workerConnected: true, workerCapabilities: ['project-source-restore'], managedRoots: ['/fixture/KINAOU'], verified }) }))
    expect(html).toContain(translateUi(language, 'sourceRestore.heading')); expect(html).toContain('disabled=""')
    expect(html).not.toContain('PRIVATE_TOKEN'); expect(fetch).not.toHaveBeenCalled()
    for (const key of Object.keys(uiSourceRestoreMessages) as (keyof typeof uiSourceRestoreMessages)[]) expect(translateUi(language, key)).not.toBe(key)
  } finally { fetch.mockRestore() }
})
it('uses authenticated dedicated start/status routes with exact durable bindings', async () => {
  const request = await prepareSourceRestore(verified, 'en', true)
  const fetchImpl = vi.fn(async (_url: string | URL | Request, _options?: RequestInit) => new Response(JSON.stringify({ ok: true, type: 'project-source-restore', job: job(request) })))
  const client = new WorkerClient({ baseUrl: 'http://127.0.0.1:43117', token: 'fixture-only', fetchImpl })
  await client.startProjectSourceRestore(request); await client.projectSourceRestoreStatus(request)
  expect(String(fetchImpl.mock.calls[0][0])).toMatch(/source-restore\/start$/); expect(JSON.parse(String(fetchImpl.mock.calls[0][1]?.body))).toEqual(request)
  expect(String(fetchImpl.mock.calls[1][0])).toMatch(/source-restore\/status$/); expect(JSON.parse(String(fetchImpl.mock.calls[1][1]?.body))).toEqual(validateSourceRestoreQuery(request))
})
