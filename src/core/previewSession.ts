import type { RenderPlan } from './render'
import type { RenderJobRecord } from './renderJobs'
import type { WorkerClient } from './workerClient'

export class PreviewScope {
  private generation = 0
  invalidate() { this.generation++ }
  capture() { const generation = this.generation; return () => generation === this.generation }
}

export type PreviewPhase = 'idle' | 'starting' | 'queued' | 'running' | 'loading' | 'ready' | 'failed' | 'cancelled' | 'startFailed' | 'pollFailed' | 'loadFailed'
export interface PreviewFeedback { phase: PreviewPhase; job?: RenderJobRecord; detail?: string }
export const previewBusy = (phase: PreviewPhase) => ['starting', 'queued', 'running', 'loading'].includes(phase)
type Client = Pick<WorkerClient, 'startRender' | 'renderStatus' | 'loadTimelinePreview'>

/** Each submission owns its file, even if an abandoned worker job finishes later. */
export function freshPreviewPlan(plan: RenderPlan, id: string = crypto.randomUUID()): RenderPlan {
  if (plan.purpose !== 'preview' || !/^[a-zA-Z0-9-]{1,80}$/.test(id)) throw new Error('Invalid preview submission')
  return { ...plan, outputRelativePath: `KINAOU/Cache/Previews/preview-${id}.mp4` }
}

/** Serial polling; retry resumes the same job/file and never submits another render. */
export async function runTimelinePreview(plan: RenderPlan, client: Client, current: () => boolean, publish: (state: PreviewFeedback) => void, accept: (blob: Blob) => void, resume?: RenderJobRecord, wait = () => new Promise<void>((resolve) => setTimeout(resolve, 750))): Promise<void> {
  let job = resume
  let phase: PreviewPhase = resume ? 'running' : 'starting'
  if (!current()) return
  publish({ phase, job })
  try {
    if (!job) job = await client.startRender(plan)
    if (!current()) return
    while (job.state === 'queued' || job.state === 'running') {
      phase = job.state
      publish({ phase, job })
      await wait()
      if (!current()) return
      const next = await client.renderStatus(job.id)
      if (!current()) return
      if (next.id !== job.id) throw new Error('Preview status belongs to another job')
      job = next
    }
    if (job.state !== 'succeeded') { publish({ phase: job.state, job, detail: job.error }); return }
    phase = 'loading'
    publish({ phase, job })
    const blob = await client.loadTimelinePreview(plan.outputRelativePath)
    if (!current()) return
    accept(blob)
    publish({ phase: 'ready', job })
  } catch (cause) {
    if (current()) publish({ phase: phase === 'starting' ? 'startFailed' : phase === 'loading' ? 'loadFailed' : 'pollFailed', job, detail: cause instanceof Error ? cause.message : String(cause) })
  }
}

export async function loadSourcePreview(load: () => Promise<Blob>, current: () => boolean, publish: (state: PreviewFeedback) => void, accept: (blob: Blob) => void): Promise<void> {
  if (!current()) return
  publish({ phase: 'loading' })
  try {
    const blob = await load()
    if (!current()) return
    accept(blob)
    publish({ phase: 'ready' })
  } catch (cause) {
    if (current()) publish({ phase: 'loadFailed', detail: cause instanceof Error ? cause.message : String(cause) })
  }
}
