import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { ShortBatchArchivePanel } from '../src/components/ShortBatchArchivePanel'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import { createProject, parseProject } from '../src/core/project'
import { forgetProjectShortBatchArchiveEntry, projectShortBatchArchive } from '../src/core/shortExportBatch'
import { ExportCheckScope, ExportFileCheckSession, type ExportCheckFeedback } from '../src/core/exportFileCheck'
import { WorkerClient } from '../src/core/workerClient'
import { uiLanguages } from '../src/core/uiLanguage'
import { translateUi } from '../src/core/uiMessages'

function fixture() {
  return parseProject({ ...createProject('Original project'), metadata: { shortExportBatchArchive: [{
    schemaVersion: 1, batchId: '11111111-1111-4111-8111-111111111111', createdAt: '2026-09-20T00:00:00Z', completedAt: '2026-09-20T00:01:00Z', archivedAt: '2026-09-20T00:02:00Z',
    items: ['succeeded', 'failed', 'cancelled'].map((state, index) => ({ id: String(index), candidateId: 'scene', title: '<Original title>', format: 'vertical', inMs: 1000, outMs: 2000, durationMs: 1000, outputPath: `KINAOU/Renders/${index}.mp4`, state, attempt: 1, ...(state === 'succeeded' ? { sizeBytes: 2000 } : {}) }))
  }] } })
}
it.each(uiLanguages)('renders translated archive controls, terminal states and unchecked presence in %s', language => {
  const project = fixture(), before = JSON.stringify(project), change = vi.fn(), review = vi.fn()
  const html = renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: language, children: createElement(ShortBatchArchivePanel, { project, workerUrl: '', workerToken: '', workerConnected: false, busy: false, onProjectChange: change, onReview: review }) }))
  for (const key of ['shortArchive.heading', 'shortArchive.succeeded', 'shortArchive.failed', 'shortArchive.cancelled', 'shortArchive.review', 'shortArchive.check', 'shortArchive.forget', 'exports.unchecked'] as const) expect(html).toContain(translateUi(language, key))
  expect(html).toContain('&lt;Original title&gt;')
  expect(html).not.toContain(translateUi(language, 'exports.present'))
  expect(html).toContain('disabled=""')
  expect(change).not.toHaveBeenCalled(); expect(review).not.toHaveBeenCalled()
  expect(JSON.stringify(project)).toBe(before)
})
it('forgets only archive metadata and preserves all other project data and original output references', () => {
  const project = fixture(), before = structuredClone(project)
  const result = forgetProjectShortBatchArchiveEntry(project, projectShortBatchArchive(project)[0].batchId)
  expect(projectShortBatchArchive(result)).toEqual([])
  expect(result.tracks).toEqual(before.tracks); expect(result.assets).toEqual(before.assets)
  expect(project).toEqual(before)
})
it('checks 100 archive paths in bounded authenticated chunks with accurate presence totals', async () => {
  const requested: string[][] = [], states: ExportCheckFeedback[] = []
  const paths = Array.from({ length: 100 }, (_, index) => `KINAOU/Renders/${index}.mp4`)
  const client = new WorkerClient({ baseUrl: 'http://localhost:43117', token: 'fixture', fetchImpl: async (_url, init) => {
    const chunk = JSON.parse(String(init?.body)).paths as string[]; requested.push(chunk)
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer fixture')
    return new Response(JSON.stringify({ ok: true, type: 'asset-availability', results: chunk.map((path, index) => ({ path, available: index % 2 === 0 })) }))
  } })
  await new ExportFileCheckSession(paths, { client: { exportAvailability: paths => client.exportAvailabilityBatched(paths) }, current: () => true, publish: state => states.push(state) }).run()
  expect(requested.map(chunk => chunk.length)).toEqual([50, 50])
  expect(states.at(-1)).toMatchObject({ phase: 'checked', result: { available: 50, missing: 50 } })
})
it('does not publish partial counts if a later archive chunk fails', async () => {
  const paths = Array.from({ length: 51 }, (_, index) => `KINAOU/Renders/${index}.mp4`), states: ExportCheckFeedback[] = []
  let calls = 0
  const client = new WorkerClient({ baseUrl: 'http://localhost:43117', token: 'fixture', fetchImpl: async (_url, init) => {
    if (++calls === 2) throw new Error('storage disconnected')
    return new Response(JSON.stringify({ ok: true, type: 'asset-availability', results: JSON.parse(String(init?.body)).paths.map((path: string) => ({ path, available: true })) }))
  } })
  await new ExportFileCheckSession(paths, { client: { exportAvailability: paths => client.exportAvailabilityBatched(paths) }, current: () => true, publish: state => states.push(state) }).run()
  expect(states.map(state => state.phase)).toEqual(['checking', 'failed'])
})
it.each(['project', 'connection', 'paths', 'unmount'] as const)('suppresses archive results after %s scope invalidation, including returning to the old values', async kind => {
  let resolve!: (value: Array<{ path: string; available: boolean }>) => void
  const pending = new Promise<Array<{ path: string; available: boolean }>>(yes => { resolve = yes })
  const scope = new ExportCheckScope(), states: ExportCheckFeedback[] = []
  const keys = { project: 'project-1', connection: 'localhost:43117:token', paths: 'KINAOU/Renders/1.mp4' }
  const originalKey = JSON.stringify(keys), originalIdentity = scope.update(originalKey)
  expect(scope.update(originalKey)).toBe(originalIdentity)
  const session = new ExportFileCheckSession(['KINAOU/Renders/1.mp4'], { client: { exportAvailability: () => pending }, current: () => scope.isCurrent(originalIdentity), publish: state => states.push(state) })
  const task = session.run()
  if (kind === 'unmount') session.detach()
  else {
    scope.update(JSON.stringify({ ...keys, [kind]: keys[kind] + '-changed' }))
    expect(scope.isCurrent(originalIdentity)).toBe(false)
    expect(scope.update(originalKey)).not.toBe(originalIdentity)
  }
  resolve([{ path: 'KINAOU/Renders/1.mp4', available: true }]); await task
  expect(states).toEqual([{ phase: 'checking' }])
})
