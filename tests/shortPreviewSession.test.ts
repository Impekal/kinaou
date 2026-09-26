import { expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createProject, parseProject } from '../src/core/project'
import { createTimelinePreviewPlan } from '../src/core/render'
import { freshPreviewPlan } from '../src/core/previewSession'
import { ShortPreviewSession, type ShortPreviewFeedback } from '../src/core/shortPreviewSession'
import type { RenderJobRecord } from '../src/core/renderJobs'
import { ShortPreviewPanel, ShortPreviewStatus } from '../src/components/ShortPreviewPanel'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import { uiLanguages } from '../src/core/uiLanguage'
import { translateUi } from '../src/core/uiMessages'
import { defaultAudioDucking } from '../src/core/audioDucking'
import { defaultLoudnessNormalization } from '../src/core/audioLoudness'

function fixture() {
  return parseProject({ ...createProject('Original'), assets: [{ id: 'v', kind: 'video', uri: 'KINAOU/Assets/video.mp4', managed: true }], tracks: [{ id: 'v', name: 'Original track', type: 'video', clips: [{ id: 'c', assetId: 'v', startMs: 0, durationMs: 2000 }] }] })
}
function job(state: RenderJobRecord['state']): RenderJobRecord { return { id: 'job-1', state, progress: state === 'succeeded' ? 1 : 0, createdAt: '2026-09-20T00:00:00Z', updatedAt: '2026-09-20T00:00:01Z' } }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes }); return { promise, resolve } }
function setup() {
  const plan = freshPreviewPlan(createTimelinePreviewPlan(fixture()))
  const client = { startRender: vi.fn(async () => job('queued')), renderStatus: vi.fn(async () => job('succeeded')), cancelRender: vi.fn(async () => job('cancelled')), loadTimelinePreview: vi.fn(async () => new Blob(['video'])) }
  const states: ShortPreviewFeedback[] = [], accept = vi.fn()
  const session = new ShortPreviewSession(plan, { client, accept, publish: value => states.push(value), wait: async () => {} })
  return { plan, client, states, accept, session }
}
it('runs the selected immutable plan once and loads its exact file', async () => {
  const s = setup()
  await Promise.all([s.session.run(), s.session.run()])
  expect(s.client.startRender).toHaveBeenCalledTimes(1)
  expect(s.client.startRender).toHaveBeenCalledWith(s.plan)
  expect(s.client.loadTimelinePreview).toHaveBeenCalledWith(s.plan.outputRelativePath)
  expect(s.states.map(state => state.phase)).toEqual(['starting', 'queued', 'loading', 'ready'])
})
it.each(['poll', 'load'] as const)('retries a %s failure without starting a second job', async stage => {
  const s = setup()
  if (stage === 'poll') s.client.renderStatus.mockRejectedValueOnce(new Error('offline'))
  else s.client.loadTimelinePreview.mockRejectedValueOnce(new Error('missing'))
  await s.session.run()
  expect(s.states.at(-1)?.phase).toBe(stage === 'poll' ? 'pollFailed' : 'loadFailed')
  await s.session.run()
  expect(s.states.at(-1)?.phase).toBe('ready')
  expect(s.client.startRender).toHaveBeenCalledTimes(1)
})
it('does not resubmit when acceptance is unknown', async () => {
  const s = setup(); s.client.startRender.mockRejectedValue(new Error('lost response'))
  await s.session.run(); await s.session.run()
  expect(s.states.at(-1)?.phase).toBe('startFailed')
  expect(s.client.startRender).toHaveBeenCalledTimes(1)
})
it.each(['start', 'poll', 'load'] as const)('drops late %s results after scope detachment', async stage => {
  const s = setup(), pending = deferred<any>()
  const method = stage === 'start' ? s.client.startRender : stage === 'poll' ? s.client.renderStatus : s.client.loadTimelinePreview
  method.mockImplementationOnce(() => pending.promise)
  const task = s.session.run()
  await vi.waitFor(() => expect(method).toHaveBeenCalled())
  s.session.detach(); const count = s.states.length
  pending.resolve(stage === 'load' ? new Blob(['stale']) : job('succeeded'))
  await task
  expect(s.states).toHaveLength(count); expect(s.accept).not.toHaveBeenCalled()
})
it.each(['cancelled', 'succeeded'] as const)('cancellation supersedes a slow poll and handles racing %s', async outcome => {
  const s = setup(), pending = deferred<RenderJobRecord>()
  s.client.renderStatus.mockImplementationOnce(() => pending.promise)
  s.client.cancelRender.mockResolvedValue(job(outcome))
  const task = s.session.run()
  await vi.waitFor(() => expect(s.client.renderStatus).toHaveBeenCalledTimes(1))
  await s.session.cancel()
  pending.resolve(job('running')); await task
  expect(s.states.at(-1)?.phase).toBe(outcome === 'succeeded' ? 'ready' : 'cancelled')
  expect(s.accept).toHaveBeenCalledTimes(outcome === 'succeeded' ? 1 : 0)
})
it('keeps cancellation failure recoverable on the same job and serializes repeated cancellation', async () => {
  const s = setup(), pending = deferred<RenderJobRecord>(), cancelled = deferred<RenderJobRecord>()
  s.client.renderStatus.mockImplementationOnce(() => pending.promise)
  s.client.cancelRender.mockRejectedValueOnce(new Error('offline')).mockImplementationOnce(() => cancelled.promise)
  const task = s.session.run()
  await vi.waitFor(() => expect(s.client.renderStatus).toHaveBeenCalled())
  await s.session.cancel(); expect(s.states.at(-1)?.phase).toBe('cancelFailed')
  const retry = s.session.cancel(); await s.session.cancel()
  expect(s.client.cancelRender).toHaveBeenCalledTimes(2)
  cancelled.resolve(job('cancelled')); await retry
  pending.resolve(job('succeeded')); await task
  expect(s.states.at(-1)?.phase).toBe('cancelled'); expect(s.accept).not.toHaveBeenCalled()
})
it('drops late cancellation after detachment', async () => {
  const s = setup(), pending = deferred<RenderJobRecord>(), cancelled = deferred<RenderJobRecord>()
  s.client.renderStatus.mockImplementationOnce(() => pending.promise)
  s.client.cancelRender.mockImplementationOnce(() => cancelled.promise)
  const task = s.session.run()
  await vi.waitFor(() => expect(s.client.renderStatus).toHaveBeenCalled())
  const cancel = s.session.cancel(); s.session.detach(); const count = s.states.length
  cancelled.resolve(job('succeeded')); pending.resolve(job('succeeded')); await Promise.all([task, cancel])
  expect(s.states).toHaveLength(count); expect(s.accept).not.toHaveBeenCalled()
})
it.each(['identity', 'path'] as const)('rejects mismatched %s without loading a preview', async mismatch => {
  const s = setup()
  s.client.renderStatus.mockResolvedValue({ ...job('succeeded'), ...(mismatch === 'identity' ? { id: 'other' } : { outputPath: 'KINAOU/Cache/Previews/other.mp4' }) })
  await s.session.run()
  expect(s.states.at(-1)?.phase).toBe('pollFailed'); expect(s.accept).not.toHaveBeenCalled()
})
it.each(uiLanguages)('shows translated Short controls and cancellation recovery in %s', language => {
  const project = fixture(), before = JSON.stringify(project)
  const html = renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: language, children: createElement(ShortPreviewPanel, { project, candidate: { id: 's', titles: ['Original'], sceneIds: ['s'], inMs: 500, outMs: 1500, durationMs: 1000 }, format: 'vertical', onFormatChange: vi.fn(), onBusyChange: vi.fn(), audioDucking: defaultAudioDucking, loudnessNormalization: defaultLoudnessNormalization, workerUrl: '', workerToken: '', workerConnected: false, workerCapabilities: [], disabled: false }) }))
  expect(html).toContain(translateUi(language, 'shortPreview.heading'))
  expect(html).toContain(translateUi(language, 'shortPreview.format'))
  expect(html).toContain(translateUi(language, 'preview.connect'))
  for (const phase of ['cancelling', 'cancelFailed'] as const) {
    const status = renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: language, children: createElement(ShortPreviewStatus, { feedback: { phase, detail: '<original error>' } }) }))
    expect(status).toContain(translateUi(language, `shortPreview.${phase}`))
    expect(status).toContain('&lt;original error&gt;')
  }
  expect(JSON.stringify(project)).toBe(before)
})
