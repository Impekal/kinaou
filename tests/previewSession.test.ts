import { expect, it, vi } from 'vitest'
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createProject, parseProject } from '../src/core/project'
import { createTimelinePreviewPlan } from '../src/core/render'
import { renderReadiness } from '../src/core/renderUi'
import { freshPreviewPlan, loadSourcePreview, PreviewScope, runTimelinePreview, type PreviewFeedback } from '../src/core/previewSession'
import type { RenderJobRecord } from '../src/core/renderJobs'
import { TimelinePreview } from '../src/components/TimelinePreview'
import { StudioProxyPreview } from '../src/components/StudioProxyPreview'
import { PreviewStatus } from '../src/components/PreviewFeedback'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import { uiLanguages } from '../src/core/uiLanguage'
import { translateUi } from '../src/core/uiMessages'

const project = () => parseProject({ ...createProject('Original project'), assets: [{ id: 'source', kind: 'video', uri: 'KINAOU/Assets/video.mp4', managed: true, metadata: { name: 'Original <media>', durationMs: 1000, proxyPath: 'KINAOU/Cache/Proxies/source.mp4' } }], tracks: [{ id: 'main', type: 'video', name: 'Original track', clips: [{ id: 'clip', assetId: 'source', startMs: 0, durationMs: 1000 }] }] })
const job = (state: RenderJobRecord['state']): RenderJobRecord => ({ id: 'job-1', state, progress: state === 'succeeded' ? 1 : 0.5, createdAt: '2026-09-20T00:00:00Z', updatedAt: '2026-09-20T00:00:01Z' })
function setup() {
  const plan = freshPreviewPlan(createTimelinePreviewPlan(project()))
  const client = { startRender: vi.fn(async () => job('queued')), renderStatus: vi.fn(async () => job('succeeded')), loadTimelinePreview: vi.fn(async (_path: string) => new Blob(['video'])) }
  const scope = new PreviewScope(), states: PreviewFeedback[] = [], accept = vi.fn(), publish = (value: PreviewFeedback) => { states.push(value) }
  return { plan, client, scope, states, accept, publish }
}
const wait = async () => {}
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (cause: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }

it('gives each preview a distinct managed cache path without modifying its plan or export', () => {
  const plan = createTimelinePreviewPlan(project()), before = structuredClone(plan)
  const a = freshPreviewPlan(plan), b = freshPreviewPlan(plan)
  expect(a.outputRelativePath).not.toBe(b.outputRelativePath)
  expect(a.outputRelativePath).toMatch(/^KINAOU\/Cache\/Previews\/preview-[a-f0-9-]+\.mp4$/)
  expect(plan).toEqual(before)
  expect(a.clips).toEqual(plan.clips)
  expect(() => freshPreviewPlan(plan, '../escape')).toThrow()
  expect(() => freshPreviewPlan({ ...plan, purpose: 'export' })).toThrow()
})

it('runs one real lifecycle serially and loads only the submitted path after success', async () => {
  const s = setup()
  await runTimelinePreview(s.plan, s.client, s.scope.capture(), s.publish, s.accept, undefined, wait)
  expect(s.states.map((entry) => entry.phase)).toEqual(['starting', 'queued', 'loading', 'ready'])
  expect(s.client.startRender).toHaveBeenCalledTimes(1)
  expect(s.client.loadTimelinePreview).toHaveBeenCalledWith(s.plan.outputRelativePath)
  expect(s.accept).toHaveBeenCalledTimes(1)
})

it.each(['failed', 'cancelled'] as const)('reports immediate terminal %s without polling/loading', async (state) => {
  const s = setup(); s.client.startRender.mockResolvedValue(job(state))
  await runTimelinePreview(s.plan, s.client, s.scope.capture(), s.publish, s.accept, undefined, wait)
  expect(s.states.at(-1)?.phase).toBe(state)
  expect(s.client.renderStatus).not.toHaveBeenCalled(); expect(s.accept).not.toHaveBeenCalled()
})

it('loads an immediately succeeded submission instead of leaving it stuck', async () => {
  const s = setup(); s.client.startRender.mockResolvedValue(job('succeeded'))
  await runTimelinePreview(s.plan, s.client, s.scope.capture(), s.publish, s.accept, undefined, wait)
  expect(s.states.at(-1)?.phase).toBe('ready'); expect(s.client.renderStatus).not.toHaveBeenCalled()
})

it('reports an uncertain start without success or automatic duplicate submission', async () => {
  const s = setup(); s.client.startRender.mockRejectedValue(new Error('Network lost'))
  await runTimelinePreview(s.plan, s.client, s.scope.capture(), s.publish, s.accept, undefined, wait)
  expect(s.states.at(-1)).toEqual({ phase: 'startFailed', job: undefined, detail: 'Network lost' })
  expect(s.client.startRender).toHaveBeenCalledTimes(1); expect(s.accept).not.toHaveBeenCalled()
})

it('retains a failed-poll job and resumes it without submitting a second job', async () => {
  const s = setup(); s.client.renderStatus.mockRejectedValueOnce(new Error('offline'))
  await runTimelinePreview(s.plan, s.client, s.scope.capture(), s.publish, s.accept, undefined, wait)
  expect(s.states.at(-1)?.phase).toBe('pollFailed')
  await runTimelinePreview(s.plan, s.client, s.scope.capture(), s.publish, s.accept, s.states.at(-1)?.job, wait)
  expect(s.states.at(-1)?.phase).toBe('ready'); expect(s.client.startRender).toHaveBeenCalledTimes(1)
})

it('retries a failed blob load against the same completed job and exact file', async () => {
  const s = setup(); s.client.loadTimelinePreview.mockRejectedValueOnce(new Error('read failed'))
  await runTimelinePreview(s.plan, s.client, s.scope.capture(), s.publish, s.accept, undefined, wait)
  expect(s.states.at(-1)?.phase).toBe('loadFailed'); expect(s.accept).not.toHaveBeenCalled()
  await runTimelinePreview(s.plan, s.client, s.scope.capture(), s.publish, s.accept, s.states.at(-1)?.job, wait)
  expect(s.states.at(-1)?.phase).toBe('ready'); expect(s.client.startRender).toHaveBeenCalledTimes(1)
  expect(s.client.renderStatus).toHaveBeenCalledTimes(1)
  expect(s.client.loadTimelinePreview.mock.calls.map(([path]) => path)).toEqual([s.plan.outputRelativePath, s.plan.outputRelativePath])
})

it('rejects a mismatched job status without loading media', async () => {
  const s = setup(); s.client.renderStatus.mockResolvedValue({ ...job('succeeded'), id: 'other' })
  await runTimelinePreview(s.plan, s.client, s.scope.capture(), s.publish, s.accept, undefined, wait)
  expect(s.states.at(-1)?.phase).toBe('pollFailed'); expect(s.accept).not.toHaveBeenCalled()
})

it.each(['start', 'poll', 'blob'] as const)('drops stale %s completions after edit/connection/unmount invalidation', async (stage) => {
  const s = setup(), pending = deferred<any>()
  if (stage === 'start') s.client.startRender.mockImplementation(() => pending.promise)
  if (stage === 'poll') s.client.renderStatus.mockImplementation(() => pending.promise)
  if (stage === 'blob') s.client.loadTimelinePreview.mockImplementation(() => pending.promise)
  const task = runTimelinePreview(s.plan, s.client, s.scope.capture(), s.publish, s.accept, undefined, wait)
  await vi.waitFor(() => expect(stage === 'start' ? s.client.startRender : stage === 'poll' ? s.client.renderStatus : s.client.loadTimelinePreview).toHaveBeenCalled())
  s.scope.invalidate(); const count = s.states.length
  pending.resolve(stage === 'blob' ? new Blob(['old']) : job('succeeded')); await task
  expect(s.states).toHaveLength(count); expect(s.accept).not.toHaveBeenCalled()
  expect(s.scope.capture()()).toBe(true)
})

it('never overlaps slow status reads', async () => {
  const s = setup(), pending = deferred<RenderJobRecord>()
  s.client.renderStatus.mockImplementationOnce(() => pending.promise)
  const task = runTimelinePreview(s.plan, s.client, s.scope.capture(), s.publish, s.accept, undefined, wait)
  await vi.waitFor(() => expect(s.client.renderStatus).toHaveBeenCalledTimes(1))
  await Promise.resolve(); expect(s.client.renderStatus).toHaveBeenCalledTimes(1)
  pending.resolve(job('succeeded')); await task
})

it.each(['resolve', 'reject'] as const)('ignores stale source-proxy %s after another selection', async (outcome) => {
  const pending = deferred<Blob>(), scope = new PreviewScope(), publish = vi.fn(), accept = vi.fn()
  const task = loadSourcePreview(() => pending.promise, scope.capture(), publish, accept)
  scope.invalidate()
  if (outcome === 'resolve') pending.resolve(new Blob(['old']))
  else pending.reject(new Error('old error'))
  await task
  expect(publish).toHaveBeenCalledTimes(1); expect(accept).not.toHaveBeenCalled()
})

it('reports source loading failure, then accepts a fresh load', async () => {
  const scope = new PreviewScope(), publish = vi.fn(), accept = vi.fn()
  await loadSourcePreview(async () => { throw new Error('missing file') }, scope.capture(), publish, accept)
  expect(publish).toHaveBeenLastCalledWith({ phase: 'loadFailed', detail: 'missing file' })
  await loadSourcePreview(async () => new Blob(['new']), scope.capture(), publish, accept)
  expect(publish).toHaveBeenLastCalledWith({ phase: 'ready' }); expect(accept).toHaveBeenCalledTimes(1)
})

it.each(uiLanguages)('renders preview controls and all lifecycle feedback in %s with escaped original details', (language) => {
  const render = (children: ReactNode) => renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: language, children }))
  const original = project(), before = JSON.stringify(original)
  const props = { project: original, workerUrl: 'http://localhost:43117', workerToken: '', workerConnected: false, workerCapabilities: [] }
  const html = render(createElement(TimelinePreview, props)) + render(createElement(StudioProxyPreview, props))
  expect(html).toContain(translateUi(language, 'preview.connect'))
  expect(html).toContain(translateUi(language, 'preview.render'))
  expect(html).toContain('Original &lt;media&gt;')
  for (const phase of ['starting', 'queued', 'running', 'loading', 'ready', 'failed', 'cancelled', 'startFailed', 'pollFailed', 'loadFailed'] as const) {
    const status = render(createElement(PreviewStatus, { feedback: { phase, job: job('running'), detail: '<script>original error' } }))
    expect(status).toContain(translateUi(language, `preview.${phase}`, { progress: '50' }))
    expect(status).toContain('&lt;script&gt;original error')
  }
  expect(JSON.stringify(original)).toBe(before)
})

it.each(uiLanguages)('shows empty/offline/over-retimed readiness and blocked proxy in %s', (language) => {
  const render = (original: ReturnType<typeof project>) => renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: language, children: createElement(TimelinePreview, { project: original, workerUrl: '', workerToken: '', workerConnected: false, workerCapabilities: [] }) }))
  expect(render(createProject('Empty'))).toContain(translateUi(language, 'preview.reason.empty'))
  const original = project(); original.assets[0].offline = true
  expect(render(original)).toContain(translateUi(language, 'preview.reason.offline'))
  original.assets[0].offline = false; original.tracks[0].clips[0].speed = 2
  expect(renderReadiness(original)).toMatchObject({ code: 'source', track: 'Original track', speed: 2 })
  expect(render(original)).toContain(translateUi(language, 'preview.reason.source', { track: 'Original track', speed: 2 }))
})
