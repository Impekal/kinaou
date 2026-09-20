import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { ExportHistoryPanel } from '../src/components/ExportHistoryPanel'
import { FormatFramingPanel } from '../src/components/FormatFramingPanel'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import { createProject, parseProject } from '../src/core/project'
import { recordSuccessfulExport, projectExportHistory, forgetExportReceipt } from '../src/core/exportHistory'
import { ExportFileCheckSession, type ExportCheckFeedback } from '../src/core/exportFileCheck'
import { defaultFormatReframing, setProjectFormatReframing, projectFormatReframing, projectFormatPreset } from '../src/core/render'
import { uiLanguages } from '../src/core/uiLanguage'
import { translateUi } from '../src/core/uiMessages'

const path = 'KINAOU/Renders/original.mp4'
function fixture() {
  return recordSuccessfulExport(createProject('Original title'), { jobId: 'job', label: '<original label>', outputRelativePath: path, format: 'vertical', durationMs: 3000, range: { inMs: 1000, outMs: 4000 }, sceneIds: ['original'], sizeBytes: 2048, completedAt: '2026-09-20T00:00:00Z' })
}
it.each(uiLanguages)('renders framing controls, values and unavailable-worker reason in %s', language => {
  const project = setProjectFormatReframing(fixture(), 'vertical', { fit: 'cover', focusX: 0.12, focusY: 0.8 })
  const html = renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: language, children: createElement(FormatFramingPanel, { project, busy: false, workerBlocked: true, onProjectChange: vi.fn() }) }))
  for (const key of ['frame.heading', 'frame.fit', 'frame.contain', 'frame.cover', 'frame.worker'] as const) expect(html).toContain(translateUi(language, key))
  expect(html).toContain(translateUi(language, 'frame.x', { percent: 12 })); expect(html).toContain('value="80"')
  expect(projectFormatReframing(project, 'landscape')).toEqual(defaultFormatReframing('landscape'))
})
it.each(uiLanguages)('renders receipts without rewriting original labels and without claiming presence in %s', language => {
  const project = fixture()
  const html = renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: language, children: createElement(ExportHistoryPanel, { project, workerUrl: 'http://127.0.0.1:43117', workerToken: '', workerConnected: false, busy: false, onProjectChange: vi.fn() }) }))
  for (const key of ['exports.heading', 'exports.unchecked', 'exports.forget', 'exports.presenceHelp'] as const) expect(html).toContain(translateUi(language, key).replaceAll("'", '&#x27;'))
  expect(html).toContain('&lt;original label&gt;'); expect(html).toContain(path)
  expect(html).not.toContain(translateUi(language, 'exports.present'))
  expect(projectExportHistory(project)[0].label).toBe('<original label>')
})
it('retains independent format settings through serialization and reset without changing receipts', () => {
  const original = fixture()
  const updated = parseProject(JSON.parse(JSON.stringify(setProjectFormatReframing(original, 'vertical', { fit: 'cover', focusX: 0, focusY: 1 }))))
  expect(projectFormatPreset(updated, 'vertical', 'export')).toMatchObject({ fit: 'cover', focusX: 0, focusY: 1 })
  expect(projectFormatPreset(updated, 'vertical', 'preview')).toMatchObject({ fit: 'cover', focusX: 0, focusY: 1 })
  expect(projectFormatReframing(updated, 'square')).toEqual(defaultFormatReframing('square'))
  expect(projectExportHistory(updated)).toEqual(projectExportHistory(original))
  const reset = setProjectFormatReframing(updated, 'vertical', defaultFormatReframing('vertical'))
  expect(projectFormatReframing(reset, 'vertical')).toEqual(defaultFormatReframing('vertical'))
})
function deferred<T>() { let resolve!: (value: T) => void, reject!: (value: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
function harness() {
  let current = true
  const states: ExportCheckFeedback[] = []
  const client = { exportAvailability: vi.fn(async (_paths: string[]) => [{ path, available: true }]) }
  const session = new ExportFileCheckSession([path, path], { client, current: () => current, publish: value => states.push(value) })
  return { session, states, client, invalidate: () => { current = false } }
}
it('checks unique paths, reports counts and time without changing receipt metadata', async () => {
  const project = fixture(), before = JSON.stringify(project), h = harness()
  await h.session.run()
  expect(h.client.exportAvailability).toHaveBeenCalledWith([path])
  expect(h.states.at(-1)).toMatchObject({ phase: 'checked', result: { available: 1, missing: 0, byPath: { [path]: true }, checkedAt: expect.any(String) } })
  expect(JSON.stringify(project)).toBe(before)
})
it('clears stale success while rechecking, reports failure and supports a fresh read-only retry', async () => {
  const h = harness(); await h.session.run()
  h.client.exportAvailability.mockRejectedValueOnce(new Error('<offline>'))
  await h.session.run(); expect(h.states.at(-1)).toEqual({ phase: 'failed', detail: 'Error: <offline>' })
  h.client.exportAvailability.mockResolvedValue([{ path, available: false }])
  await h.session.run(); expect(h.states.at(-1)).toMatchObject({ phase: 'checked', result: { missing: 1, available: 0 } })
})
it.each(['scope', 'detach'] as const)('ignores late successful and failed results after %s change', async kind => {
  for (const failure of [false, true]) {
    const h = harness(), pending = deferred<Array<{ path: string; available: boolean }>>()
    h.client.exportAvailability.mockReturnValue(pending.promise)
    const running = h.session.run()
    kind === 'scope' ? h.invalidate() : h.session.detach()
    failure ? pending.reject(new Error('late')) : pending.resolve([{ path, available: true }])
    await running
    expect(h.states).toEqual([{ phase: 'checking' }])
  }
})
it('does not issue overlapping checks', async () => {
  const h = harness(), pending = deferred<Array<{ path: string; available: boolean }>>()
  h.client.exportAvailability.mockReturnValue(pending.promise)
  const running = h.session.run(); await h.session.run()
  expect(h.client.exportAvailability).toHaveBeenCalledTimes(1)
  pending.resolve([{ path, available: true }]); await running
})
it.each([[], [{ path: 'KINAOU/Renders/wrong.mp4', available: true }], [{ path, available: true }, { path, available: true }]].map(results => ({ results })))('rejects an incomplete or mismatched presence response %#', async ({ results }) => {
  const h = harness(); h.client.exportAvailability.mockResolvedValue(results)
  await h.session.run(); expect(h.states.at(-1)?.phase).toBe('failed')
})
it('forgetting a receipt leaves framing, assets and the original immutable project intact', () => {
  const project = setProjectFormatReframing(fixture(), 'vertical', { fit: 'cover', focusX: 0.3, focusY: 0.5 })
  const next = forgetExportReceipt(project, 'job')
  expect(projectExportHistory(next)).toHaveLength(0); expect(projectExportHistory(project)).toHaveLength(1)
  expect(next.assets).toEqual(project.assets); expect(projectFormatReframing(next, 'vertical')).toEqual(projectFormatReframing(project, 'vertical'))
})
