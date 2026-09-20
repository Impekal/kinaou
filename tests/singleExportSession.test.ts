import { expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { SingleExportSession, type ExportFeedback, type ExportSubmission } from '../src/core/singleExportSession'
import { createProject, parseProject } from '../src/core/project'
import { createRenderPlan, projectFormatPreset } from '../src/core/render'
import { recordSuccessfulExport, projectExportHistory } from '../src/core/exportHistory'
import type { RenderJobRecord } from '../src/core/renderJobs'
import { RenderPanel } from '../src/components/RenderPanel'
import { SingleExportStatus } from '../src/components/SingleExportStatus'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import { uiLanguages } from '../src/core/uiLanguage'
import { translateUi } from '../src/core/uiMessages'

const output = 'KINAOU/Renders/unique.mp4'
function fixture() {
  return parseProject({ ...createProject('Original title'), assets: [{ id: 'image', kind: 'image', uri: 'KINAOU/Assets/image.png', managed: true }], tracks: [{ id: 'main', name: 'Original track', type: 'video', clips: [{ id: 'clip', assetId: 'image', startMs: 0, durationMs: 1000 }] }] })
}
const receipt: ExportSubmission = { label: 'Original title', outputRelativePath: output, format: 'landscape', range: { inMs: 0, outMs: 1000 }, durationMs: 1000, sceneIds: [] }
const job = (state: RenderJobRecord['state'] = 'succeeded'): RenderJobRecord => ({ id: 'job', state, progress: state === 'succeeded' ? 1 : 0.1, createdAt: '2026-09-20T00:00:00Z', updatedAt: '2026-09-20T00:00:01Z', outputPath: '/tmp/root/' + output, durationMs: 1000, sizeBytes: 1000 })
function harness() {
  let project = fixture(), active = true
  const plan = createRenderPlan(project, projectFormatPreset(project, 'landscape', 'export'), output)
  const states: ExportFeedback[] = []
  const client = { startRender: vi.fn(async () => job()), renderStatus: vi.fn(async () => job()), cancelRender: vi.fn(async () => job('cancelled')) }
  const record = vi.fn((value: Parameters<typeof recordSuccessfulExport>[1]) => { project = recordSuccessfulExport(project, value) })
  const run = new SingleExportSession(plan, receipt, { client, current: () => active, record, publish: state => states.push(state), wait: async () => {} })
  return { run, client, record, states, plan, get project() { return project }, disconnect: () => { active = false }, edit: () => { project = { ...project, title: 'New edit', script: 'Keep these words' } } }
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r }); return { promise, resolve } }

it.each(uiLanguages)('renders single export controls and readiness in %s', language => {
  const html = renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: language, children: createElement(RenderPanel, { project: createProject('Original title'), workerUrl: 'http://127.0.0.1:43117', workerToken: '', workerConnected: false, workerCapabilities: [], onProjectChange: vi.fn() }) }))
  for (const key of ['export.heading', 'export.start', 'export.in', 'export.out', 'export.scope', 'export.normalize', 'preview.reason.empty'] as const) expect(html).toContain(translateUi(language, key))
  expect(html).toContain('disabled="">')
})
it.each(uiLanguages)('renders escaped status and same-job recovery in %s', language => {
  const html = renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: language, children: createElement(SingleExportStatus, { feedback: { phase: 'saveFailed', path: output, detail: '<script>storage failed', job: job() }, onRetry: vi.fn(), onCancel: vi.fn(), onDetach: vi.fn() }) }))
  expect(html).toContain(translateUi(language, 'export.phase.saveFailed'))
  expect(html).toContain(translateUi(language, 'export.retry'))
  expect(html).toContain('&lt;script&gt;storage failed'); expect(html).toContain(output)
})
it('records the submitted export only after success, preserving later same-project edits', async () => {
  const h = harness(), pending = deferred<RenderJobRecord>(); h.client.startRender.mockReturnValue(pending.promise)
  const running = h.run.run(); h.edit(); pending.resolve(job()); await running
  expect(h.project).toMatchObject({ title: 'New edit', script: 'Keep these words' })
  expect(projectExportHistory(h.project)[0]).toMatchObject(receipt)
  expect(h.states.map(state => state.phase)).toEqual(['starting', 'saving', 'succeeded'])
  await h.run.run(); expect(h.record).toHaveBeenCalledTimes(1); expect(h.client.startRender).toHaveBeenCalledTimes(1)
})
it('retries receipt storage without another render', async () => {
  const h = harness(); h.record.mockImplementationOnce(() => { throw new Error('full') })
  await h.run.run(); expect(h.states.at(-1)?.phase).toBe('saveFailed')
  expect(projectExportHistory(h.project)).toHaveLength(0)
  await h.run.run(); expect(h.client.startRender).toHaveBeenCalledTimes(1); expect(projectExportHistory(h.project)).toHaveLength(1)
})
it('retries status against the same job', async () => {
  const h = harness(); h.client.startRender.mockResolvedValue(job('queued')); h.client.renderStatus.mockRejectedValueOnce(new Error('offline'))
  await h.run.run(); expect(h.states.at(-1)?.phase).toBe('pollFailed')
  await h.run.run(); expect(h.client.renderStatus.mock.calls).toEqual([['job'], ['job']]); expect(h.client.startRender).toHaveBeenCalledTimes(1)
})
it('does not resubmit uncertain acceptance', async () => {
  const h = harness(); h.client.startRender.mockRejectedValue(new Error('response lost'))
  await h.run.run(); await h.run.run()
  expect(h.states.at(-1)?.phase).toBe('startFailed'); expect(h.client.startRender).toHaveBeenCalledTimes(1)
})
it.each(['detach', 'disconnect'] as const)('ignores a late submission after %s', async reason => {
  const h = harness(), pending = deferred<RenderJobRecord>(); h.client.startRender.mockReturnValue(pending.promise)
  const running = h.run.run(); reason === 'detach' ? h.run.detach() : h.disconnect()
  pending.resolve(job()); await running
  expect(h.record).not.toHaveBeenCalled(); expect(h.states.at(-1)?.phase).toBe('starting')
})
it('does not duplicate concurrent submissions', async () => {
  const h = harness(), pending = deferred<RenderJobRecord>(); h.client.startRender.mockReturnValue(pending.promise)
  const first = h.run.run(); await h.run.run(); pending.resolve(job()); await first
  expect(h.client.startRender).toHaveBeenCalledTimes(1)
})
it.each(['failed', 'cancelled'] as const)('does not record a %s export', async state => {
  const h = harness(); h.client.startRender.mockResolvedValue(job(state)); await h.run.run()
  expect(h.states.at(-1)?.phase).toBe(state); expect(h.record).not.toHaveBeenCalled()
})
it.each(['id', 'path'] as const)('rejects a status with mismatched %s', async field => {
  const h = harness(); h.client.startRender.mockResolvedValue(job('queued'))
  h.client.renderStatus.mockResolvedValue({ ...job(), ...(field === 'id' ? { id: 'other' } : { outputPath: 'KINAOU/Renders/other.mp4' }) })
  await h.run.run(); expect(h.states.at(-1)?.phase).toBe('pollFailed'); expect(h.record).not.toHaveBeenCalled()
})
it('cancellation supersedes a late in-flight poll without reporting false success', async () => {
  const h = harness(), pending = deferred<RenderJobRecord>(); h.client.startRender.mockResolvedValue(job('running')); h.client.renderStatus.mockReturnValue(pending.promise)
  const running = h.run.run(); await vi.waitFor(() => expect(h.client.renderStatus).toHaveBeenCalled())
  await h.run.cancel(); pending.resolve(job()); await running
  expect(h.states.at(-1)?.phase).toBe('cancelled'); expect(h.record).not.toHaveBeenCalled()
})
it('records actual completion if it wins the cancellation race', async () => {
  const h = harness(), pending = deferred<RenderJobRecord>(); h.client.startRender.mockResolvedValue(job('running')); h.client.renderStatus.mockReturnValue(pending.promise); h.client.cancelRender.mockResolvedValue(job())
  const running = h.run.run(); await vi.waitFor(() => expect(h.client.renderStatus).toHaveBeenCalled())
  await h.run.cancel(); pending.resolve(job('running')); await running
  expect(h.states.at(-1)?.phase).toBe('succeeded'); expect(h.record).toHaveBeenCalledTimes(1)
})
it('reports unconfirmed cancellation and can recheck the same job', async () => {
  const h = harness(); h.client.startRender.mockResolvedValue(job('running')); h.client.renderStatus.mockRejectedValueOnce(new Error('offline')); h.client.cancelRender.mockRejectedValueOnce(new Error('cancel offline'))
  await h.run.run(); await h.run.cancel(); expect(h.states.at(-1)?.phase).toBe('cancelFailed')
  await h.run.run(); expect(h.states.at(-1)?.phase).toBe('succeeded'); expect(h.client.startRender).toHaveBeenCalledTimes(1)
})
