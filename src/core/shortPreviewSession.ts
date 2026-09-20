import type { RenderPlan } from './render'
import type { RenderJobRecord } from './renderJobs'
import type { WorkerClient } from './workerClient'
import type { PreviewFeedback, PreviewPhase } from './previewSession'

export interface ShortPreviewFeedback extends Omit<PreviewFeedback, 'phase'> {
  phase: PreviewPhase | 'cancelling' | 'cancelFailed'
}

/** One submitted range/connection/file; cancellation supersedes pending status reads. */
export class ShortPreviewSession {
  private job?: RenderJobRecord
  private active = true
  private epoch = 0
  private running = false
  private uncertain = false
  private cancelling = false
  constructor(private plan: RenderPlan, private deps: {
    client: Pick<WorkerClient, 'startRender' | 'renderStatus' | 'cancelRender' | 'loadTimelinePreview'>
    publish: (feedback: ShortPreviewFeedback) => void
    accept: (blob: Blob) => void
    wait?: () => Promise<void>
  }) {}
  get busy() { return this.running }
  detach() { this.active = false; this.epoch++ }
  private publish(phase: ShortPreviewFeedback['phase'], detail?: string) { if (this.active) this.deps.publish({ phase, job: this.job, detail }) }
  private acceptJob(job: RenderJobRecord) {
    if (this.job && job.id !== this.job.id) throw new Error('Short preview status belongs to another job')
    if (job.outputPath && job.outputPath !== this.plan.outputRelativePath) {
      const parts = job.outputPath.split('/')
      if (!job.outputPath.startsWith('/') || parts.slice(1).some(part => !part || part === '.' || part === '..') || !job.outputPath.endsWith('/' + this.plan.outputRelativePath)) throw new Error('Short preview output does not match the submitted path')
    }
    this.job = job
  }
  async run() {
    if (!this.active || this.running || this.uncertain) return
    this.running = true
    const epoch = ++this.epoch
    const current = () => this.active && epoch === this.epoch
    let phase: ShortPreviewFeedback['phase'] = this.job ? 'running' : 'starting'
    try {
      this.publish(phase)
      if (!this.job) {
        const started = await this.deps.client.startRender(this.plan)
        if (!current()) return
        this.acceptJob(started)
      }
      let polls = 0
      while (this.job!.state === 'queued' || this.job!.state === 'running') {
        phase = this.job!.state
        this.publish(phase)
        if (++polls > 4800) throw new Error('Preview monitoring timed out; the worker may still be running')
        await (this.deps.wait?.() ?? new Promise<void>(resolve => setTimeout(resolve, 750)))
        if (!current()) return
        const next = await this.deps.client.renderStatus(this.job!.id)
        if (!current()) return
        this.acceptJob(next)
      }
      if (this.job!.state !== 'succeeded') { this.publish(this.job!.state, this.job!.error); return }
      phase = 'loading'
      this.publish(phase)
      const blob = await this.deps.client.loadTimelinePreview(this.plan.outputRelativePath)
      if (!current()) return
      this.deps.accept(blob)
      this.publish('ready')
    } catch (cause) {
      if (!current()) return
      this.uncertain = phase === 'starting'
      this.publish(phase === 'starting' ? 'startFailed' : phase === 'loading' ? 'loadFailed' : 'pollFailed', String(cause))
    } finally { if (current()) this.running = false }
  }
  async cancel() {
    if (!this.active || this.cancelling || !this.job || !['queued', 'running'].includes(this.job.state)) return
    this.cancelling = true
    const epoch = ++this.epoch
    this.running = true
    this.publish('cancelling')
    try {
      const job = await this.deps.client.cancelRender(this.job.id)
      if (!this.active || epoch !== this.epoch) return
      this.acceptJob(job)
      this.cancelling = false
      this.running = false
      await this.run()
    } catch (cause) {
      if (this.active && epoch === this.epoch) { this.cancelling = false; this.running = false; this.publish('cancelFailed', String(cause)) }
    }
  }
}
