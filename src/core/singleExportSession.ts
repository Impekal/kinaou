import type { RenderPlan } from './render'
import type { RenderJobRecord } from './renderJobs'
import type { WorkerClient } from './workerClient'
import type { SuccessfulExportReceiptInput } from './exportHistory'

export type ExportPhase = 'starting' | 'queued' | 'running' | 'saving' | 'succeeded' | 'failed' | 'cancelled' | 'startFailed' | 'pollFailed' | 'saveFailed' | 'cancelling' | 'cancelFailed' | 'detached'
export interface ExportFeedback { phase: ExportPhase; job?: RenderJobRecord; path: string; detail?: string }
export type ExportSubmission = Omit<SuccessfulExportReceiptInput, 'jobId' | 'completedAt' | 'sizeBytes'>

/** One submitted plan, file and connection. Retry never resubmits or changes the plan. */
export class SingleExportSession {
  private job?: RenderJobRecord
  private active = true
  private epoch = 0
  private running = false
  private uncertain = false
  private recorded = false
  constructor(private plan: RenderPlan, private receipt: ExportSubmission, private deps: {
    client: Pick<WorkerClient, 'startRender' | 'renderStatus' | 'cancelRender'>
    current: () => boolean
    record: (receipt: SuccessfulExportReceiptInput) => void
    publish: (feedback: ExportFeedback) => void
    wait?: () => Promise<void>
  }) {}
  get busy() { return this.running }
  detach() { this.active = false; this.epoch++ }
  private current() { return this.active && this.deps.current() }
  private publish(phase: ExportPhase, detail?: string) { if (this.current()) this.deps.publish({ phase, job: this.job, path: this.plan.outputRelativePath, detail }) }
  private accept(job: RenderJobRecord) {
    if (this.job && job.id !== this.job.id) throw new Error('Export status belongs to another job')
    // Current workers report an absolute managed path; older ones may echo the relative path.
    if (job.outputPath && job.outputPath !== this.plan.outputRelativePath && !job.outputPath.endsWith('/' + this.plan.outputRelativePath)) throw new Error('Export output does not match the submitted path')
    this.job = job
  }
  async run() {
    if (this.running || this.uncertain || !this.current()) return
    this.running = true
    const epoch = ++this.epoch
    let phase: ExportPhase = this.job ? 'running' : 'starting'
    try {
      this.publish(phase)
      if (!this.job) {
        const started = await this.deps.client.startRender(this.plan)
        if (!this.current() || epoch !== this.epoch) return
        this.accept(started)
      }
      let polls = 0
      while (this.job!.state === 'queued' || this.job!.state === 'running') {
        phase = 'running'; this.publish(this.job!.state as 'queued' | 'running')
        if (++polls > 4800) throw new Error('Monitoring timed out; the accepted export may still be running')
        await (this.deps.wait?.() ?? new Promise<void>(resolve => setTimeout(resolve, 750)))
        if (!this.current() || epoch !== this.epoch) return
        const next = await this.deps.client.renderStatus(this.job!.id)
        if (!this.current() || epoch !== this.epoch) return
        this.accept(next)
      }
      if (!this.current() || epoch !== this.epoch) return
      if (this.job!.state === 'succeeded') {
        phase = 'saving'; this.publish(phase)
        if (!this.recorded) {
          this.deps.record({ ...this.receipt, jobId: this.job!.id, durationMs: this.job!.durationMs ?? this.receipt.durationMs, completedAt: this.job!.updatedAt, ...(this.job!.sizeBytes === undefined ? {} : { sizeBytes: this.job!.sizeBytes }) })
          this.recorded = true
        }
      }
      this.publish(this.job!.state as 'succeeded' | 'failed' | 'cancelled', this.job!.error)
    } catch (cause) {
      if (epoch !== this.epoch) return
      this.uncertain = phase === 'starting'
      this.publish(phase === 'starting' ? 'startFailed' : phase === 'saving' ? 'saveFailed' : 'pollFailed', String(cause))
    } finally { if (epoch === this.epoch) this.running = false }
  }
  async cancel() {
    if (!this.job || !['queued', 'running'].includes(this.job.state) || !this.current()) return
    const epoch = ++this.epoch
    this.running = true; this.publish('cancelling')
    try {
      const next = await this.deps.client.cancelRender(this.job.id)
      if (!this.current() || epoch !== this.epoch) return
      this.accept(next)
      this.running = false
      await this.run() // A completion racing cancellation still records its actual successful file.
    } catch (cause) { if (epoch === this.epoch) { this.running = false; this.publish('cancelFailed', String(cause)) } }
  }
}
