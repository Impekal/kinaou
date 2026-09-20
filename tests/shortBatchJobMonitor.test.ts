import { expect, it, vi } from 'vitest'
import { ShortBatchJobMonitor } from '../src/core/shortBatchJobMonitor'
import { createProject, parseProject } from '../src/core/project'
import { createRenderPlan, formatProfiles } from '../src/core/render'
import { acceptShortBatchJob, createPersistedShortBatch, type PersistedShortBatchItem } from '../src/core/shortExportBatch'
import type { RenderJobRecord } from '../src/core/renderJobs'

const outputPath = 'KINAOU/Renders/original.mp4'
function job(state: RenderJobRecord['state']): RenderJobRecord {
  return { id: 'job-1', state, progress: state === 'succeeded' ? 1 : 0.1, createdAt: '2026-09-20T00:00:00Z', updatedAt: '2026-09-20T00:00:01Z', ...(state === 'succeeded' ? { outputPath, sizeBytes: 1024 } : {}) }
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(yes => { resolve = yes })
  return { promise, resolve }
}
function setup() {
  const project = parseProject({ ...createProject('Original'), assets: [{ id: 'image', kind: 'image', uri: 'KINAOU/Assets/image.png', managed: true }], tracks: [{ id: 'v', name: 'Original track', type: 'video', clips: [{ id: 'c', assetId: 'image', startMs: 0, durationMs: 1000 }] }] })
  const plan = createRenderPlan(project, formatProfiles.vertical.export, outputPath)
  const batch = createPersistedShortBatch([{ id: 'scene:vertical', title: 'Original title', sceneIds: ['scene'], format: 'vertical', inMs: 0, outMs: 1000, durationMs: 1000, outputPath, state: 'queued', progress: 0 }], new Map([['scene:vertical', plan]]))
  const item = acceptShortBatchJob(batch.items[0], job('queued'))
  const states: PersistedShortBatchItem[] = []
  const client = {
    renderStatus: vi.fn(async (_id: string) => job('succeeded')),
    cancelRender: vi.fn(async (_id: string) => job('cancelled')),
    exportAvailability: vi.fn(async (_paths: string[]) => [{ path: outputPath, available: false }])
  }
  const notice = vi.fn(), error = vi.fn(), onCancelling = vi.fn(), wait = vi.fn(async () => {})
  const monitor = new ShortBatchJobMonitor(item, { client, publish: value => states.push(value), notice, error, onCancelling, wait })
  return { monitor, item, states, client, notice, error, onCancelling, wait }
}
it('serializes status reads and ignores repeated run requests', async () => {
  const s = setup(), status = deferred<RenderJobRecord>(), pause = deferred<void>()
  s.client.renderStatus.mockImplementationOnce(() => status.promise)
  s.wait.mockImplementationOnce(() => pause.promise)
  const run = s.monitor.run()
  await s.monitor.run()
  expect(s.client.renderStatus).toHaveBeenCalledTimes(1)
  status.resolve(job('running'))
  await vi.waitFor(() => expect(s.wait).toHaveBeenCalledOnce())
  expect(s.client.renderStatus).toHaveBeenCalledTimes(1)
  pause.resolve(); await run
  expect(s.states.map(item => item.state)).toEqual(['running', 'succeeded'])
  expect(s.client.renderStatus.mock.calls).toEqual([['job-1'], ['job-1']])
})
it('recovers a transient status failure on the same accepted job', async () => {
  const s = setup()
  s.client.renderStatus.mockRejectedValueOnce(new Error('offline'))
  await s.monitor.run()
  expect(s.error).toHaveBeenCalledWith('offline')
  expect(s.states.at(-1)?.state).toBe('succeeded')
  expect(s.client.renderStatus.mock.calls).toEqual([['job-1'], ['job-1']])
})
it.each([true, false])('handles a lost job with exact file presence %s without trusting or overwriting it', async available => {
  const s = setup()
  s.client.renderStatus.mockRejectedValueOnce(new Error('Render job not found'))
  s.client.exportAvailability.mockResolvedValue([{ path: outputPath, available }])
  await s.monitor.run()
  expect(s.client.exportAvailability).toHaveBeenCalledWith([outputPath])
  expect(s.states.at(-1)?.state).toBe(available ? 'failed' : 'queued')
  expect(s.states.at(-1)?.jobId).toBe(available ? 'job-1' : undefined)
  expect(s.notice).toHaveBeenCalledWith({ kind: available ? 'existingKept' : 'requeued' })
  expect(s.states.some(item => item.state === 'succeeded')).toBe(false)
})
it.each(['status', 'availability'] as const)('drops late %s after scope detachment', async stage => {
  const s = setup(), status = deferred<RenderJobRecord>(), available = deferred<Array<{path: string; available: boolean}>>()
  if (stage === 'status') s.client.renderStatus.mockImplementationOnce(() => status.promise)
  else {
    s.client.renderStatus.mockRejectedValueOnce(new Error('Render job not found'))
    s.client.exportAvailability.mockImplementationOnce(() => available.promise)
  }
  const run = s.monitor.run()
  await vi.waitFor(() => expect(stage === 'status' ? s.client.renderStatus : s.client.exportAvailability).toHaveBeenCalledOnce())
  s.monitor.detach()
  status.resolve(job('succeeded')); available.resolve([{ path: outputPath, available: false }])
  await run
  expect(s.states).toEqual([]); expect(s.notice).not.toHaveBeenCalled(); expect(s.error).not.toHaveBeenCalled()
  await s.monitor.run()
  expect(s.client.renderStatus).toHaveBeenCalledOnce()
})
it.each(['status', 'availability'] as const)('cancellation supersedes a pending %s response', async stage => {
  const s = setup(), status = deferred<RenderJobRecord>(), available = deferred<Array<{path: string; available: boolean}>>()
  if (stage === 'status') s.client.renderStatus.mockImplementationOnce(() => status.promise)
  else {
    s.client.renderStatus.mockRejectedValueOnce(new Error('Render job not found'))
    s.client.exportAvailability.mockImplementationOnce(() => available.promise)
  }
  const run = s.monitor.run()
  await vi.waitFor(() => expect(stage === 'status' ? s.client.renderStatus : s.client.exportAvailability).toHaveBeenCalledOnce())
  await s.monitor.cancel()
  status.resolve(job('running')); available.resolve([{ path: outputPath, available: false }])
  await run
  expect(s.states.map(item => item.state)).toEqual(['cancelled'])
  expect(s.notice).not.toHaveBeenCalled()
  expect(s.onCancelling.mock.calls).toEqual([[true], [false]])
})
it('reports actual success when completion wins the cancellation race', async () => {
  const s = setup(), status = deferred<RenderJobRecord>()
  s.client.renderStatus.mockImplementationOnce(() => status.promise)
  s.client.cancelRender.mockResolvedValue(job('succeeded'))
  const run = s.monitor.run()
  await s.monitor.cancel()
  status.resolve(job('running')); await run
  expect(s.states.map(item => item.state)).toEqual(['succeeded'])
  expect(s.states[0].renderedPath).toBe(outputPath)
})
it('resumes the same job after cancellation failure without reviving an older poll', async () => {
  const s = setup(), status = deferred<RenderJobRecord>()
  s.client.renderStatus.mockImplementationOnce(() => status.promise)
  s.client.cancelRender.mockRejectedValueOnce(new Error('cancel offline'))
  const run = s.monitor.run()
  await s.monitor.cancel()
  await vi.waitFor(() => expect(s.states.at(-1)?.state).toBe('succeeded'))
  status.resolve(job('running')); await run
  expect(s.states.map(item => item.state)).toEqual(['succeeded'])
  expect(s.error).toHaveBeenCalledWith('cancel offline')
  expect(s.client.cancelRender).toHaveBeenCalledWith('job-1')
})
it('serializes repeated cancellation and drops its late result after detach', async () => {
  const s = setup(), cancellation = deferred<RenderJobRecord>()
  s.client.cancelRender.mockImplementationOnce(() => cancellation.promise)
  const cancel = s.monitor.cancel()
  await s.monitor.cancel()
  expect(s.client.cancelRender).toHaveBeenCalledOnce()
  s.monitor.detach(); cancellation.resolve(job('cancelled')); await cancel
  expect(s.states).toEqual([]); expect(s.error).not.toHaveBeenCalled()
  expect(s.onCancelling.mock.calls).toEqual([[true]])
})
it.each(['empty', 'wrong path', 'duplicate'] as const)('rejects %s availability and retries only known status', async invalid => {
  const s = setup()
  s.client.renderStatus.mockRejectedValueOnce(new Error('Render job not found'))
  s.client.exportAvailability.mockResolvedValue(invalid === 'empty' ? [] : invalid === 'wrong path' ? [{ path: 'KINAOU/Renders/other.mp4', available: false }] : [{ path: outputPath, available: false }, { path: outputPath, available: false }])
  await s.monitor.run()
  expect(s.error).toHaveBeenCalledOnce(); expect(s.notice).not.toHaveBeenCalled()
  expect(s.states.map(item => item.state)).toEqual(['succeeded'])
})
it.each(['identity', 'output'] as const)('rejects a mismatched job %s', async invalid => {
  const s = setup()
  s.client.renderStatus.mockResolvedValueOnce({ ...job('succeeded'), ...(invalid === 'identity' ? { id: 'wrong-job' } : { outputPath: 'KINAOU/Renders/wrong.mp4' }) })
  await s.monitor.run()
  expect(s.error).toHaveBeenCalledOnce()
  expect(s.states.map(item => item.state)).toEqual(['succeeded'])
  expect(s.states[0].jobId).toBe('job-1')
})
