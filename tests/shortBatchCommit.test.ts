import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { createProject, parseProject } from '../src/core/project'
import { ProjectRepository } from '../src/core/persistence'
import { commitShortBatchChange, type ShortBatchNotice } from '../src/core/shortBatchCommit'
import { createPersistedShortBatch, persistedShortBatchItemSchema, projectPersistedShortBatch, storeProjectShortBatch, clearProjectShortBatch, type PersistedShortBatchItem } from '../src/core/shortExportBatch'
import { createRenderPlan, formatProfiles } from '../src/core/render'
import { ShortBatchStatus, type ShortBatchStatusProps } from '../src/components/ShortBatchStatus'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import { uiLanguages } from '../src/core/uiLanguage'
import { translateUi } from '../src/core/uiMessages'

function fixture() {
  const project = parseProject({ ...createProject('Original'), assets: [{ id: 'image', kind: 'image', uri: 'KINAOU/Assets/image.png', managed: true }], tracks: [{ id: 'v', name: 'Original track', type: 'video', clips: [{ id: 'c', assetId: 'image', startMs: 0, durationMs: 1000 }] }] })
  const path = 'KINAOU/Renders/original.mp4'
  const plan = createRenderPlan(project, formatProfiles.vertical.export, path)
  const batch = createPersistedShortBatch([{ id: 'scene:vertical', title: '<Original title>', sceneIds: ['scene'], format: 'vertical', inMs: 0, outMs: 1000, durationMs: 1000, outputPath: path, state: 'queued', progress: 0 }], new Map([['scene:vertical', plan]]))
  return { project, batch, prepared: storeProjectShortBatch(project, batch) }
}
it('persists the exact prepared batch before making any work visible to the scheduler', () => {
  const { prepared, batch } = fixture(), order: string[] = []
  const values = new Map<string, string>()
  const repository = new ProjectRepository({ getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value) }, removeItem: key => { values.delete(key) } })
  commitShortBatchChange(prepared, project => { repository.save(project); order.push('persist') }, () => {
    expect(projectPersistedShortBatch(repository.load(prepared.id)!)).toEqual(batch)
    order.push('activate')
  })
  expect(order).toEqual(['persist', 'activate'])
})
it.each(['prepare', 'retry', 'discard'] as const)('failed %s persistence never activates new work or removes recovery state', operation => {
  const { prepared, batch } = fixture()
  const before = JSON.stringify(prepared), activate = vi.fn(), startRender = vi.fn()
  const change = operation === 'discard' ? clearProjectShortBatch(prepared) : storeProjectShortBatch(prepared, { ...batch, updatedAt: '2026-09-20T00:00:00Z' })
  expect(() => commitShortBatchChange(change, () => { throw new Error('quota exceeded') }, () => { activate(); if (operation !== 'discard') startRender() })).toThrow('quota exceeded')
  expect(activate).not.toHaveBeenCalled(); expect(startRender).not.toHaveBeenCalled()
  expect(JSON.stringify(prepared)).toBe(before)
  expect(projectPersistedShortBatch(prepared)).toEqual(batch)
})
function props(): ShortBatchStatusProps {
  const { batch } = fixture()
  const states: PersistedShortBatchItem['state'][] = ['queued', 'running', 'succeeded', 'failed', 'cancelled']
  const items = states.map((state, index) => persistedShortBatchItemSchema.parse({
    ...batch.items[0], id: String(index), state, progress: state === 'succeeded' ? 1 : 0, jobId: 'job-' + index,
    createdAt: batch.createdAt, updatedAt: batch.updatedAt,
    ...(state === 'succeeded' ? { renderedPath: batch.items[0].outputPath, sizeBytes: 1000 } : {}),
    ...(state === 'failed' ? { error: '<Original failure>' } : {})
  }))
  return { items, notice: { kind: 'saved' }, resumeError: '', retryableIds: new Set(['3', '4']), retrySelectedIds: ['3'], setRetrySelectedIds: vi.fn(), retryDisabled: false, busy: false, retryReframingBlocked: false, canCancel: true, canDiscard: true, archiveOnDiscard: true, onRetry: vi.fn(), onCancel: vi.fn(), onDiscard: vi.fn() }
}
it.each(uiLanguages)('renders all batch states and controls in %s while preserving original identities', language => {
  const input = props(), before = JSON.stringify(input.items)
  const html = renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: language, children: createElement(ShortBatchStatus, input) }))
  for (const key of ['shortBatch.queued', 'shortBatch.running', 'shortBatch.succeeded', 'shortBatch.failed', 'shortBatch.cancelled', 'shortBatch.cancel', 'shortBatch.archive', 'shortBatch.retryItem', 'shortBatch.itemError'] as const) expect(html).toContain(translateUi(language, key))
  expect(html).toContain('&lt;Original title&gt;'); expect(html).toContain('&lt;Original failure&gt;')
  expect(html).toContain(translateUi(language, 'shortBatch.retry', { count: 1 }))
  expect(input.onRetry).not.toHaveBeenCalled(); expect(JSON.stringify(input.items)).toBe(before)
})
it.each(uiLanguages)('keeps blocked/malformed recovery and retained notices translated in %s', language => {
  const input = props()
  const notices: ShortBatchNotice[] = [{ kind: 'restored', date: '2026-09-20T00:00:00Z' }, { kind: 'saved' }, { kind: 'retrySaved', count: 2 }, { kind: 'existingKept' }, { kind: 'requeued' }]
  for (const notice of notices) {
    const html = renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: language, children: createElement(ShortBatchStatus, { ...input, notice, resumeError: '<Original error>', retryDisabled: true, busy: true }) }))
    expect(html).toContain(translateUi(language, `shortBatch.${notice.kind}`, notice.kind === 'restored' ? { date: new Date(notice.date).toLocaleString(language) } : notice.kind === 'retrySaved' ? { count: 2 } : {}))
    expect(html).toContain('&lt;Original error&gt;'); expect(html).toContain(translateUi(language, 'shortBatch.blocked'))
  }
  const empty = renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: language, children: createElement(ShortBatchStatus, { ...input, items: [], resumeError: '<malformed>' }) }))
  expect(empty).toContain(translateUi(language, 'shortBatch.discardMalformed'))
  expect(empty).not.toContain(translateUi(language, 'shortBatch.cancel'))
})
it.each(uiLanguages)('shows pending cancellation without a second cancel action in %s', language => {
  const html = renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: language, children: createElement(ShortBatchStatus, { ...props(), canCancel: true, cancelling: true }) }))
  expect(html).toContain(translateUi(language, 'shortBatch.cancelling'))
  expect(html).toMatch(/class="dangerButton" disabled=""/)
})
