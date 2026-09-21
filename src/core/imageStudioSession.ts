import { registerGeneratedImage } from './generatedImages'
import type { KinaouProject } from './project'
import { parseImageJob, type ImageJobRecord, type ImageJobParameters } from './imageJobs'
import type { WorkerClient } from './workerClient'

export type ImagePhase = 'starting' | 'queued' | 'running' | 'saving' | 'succeeded' | 'failed' | 'cancelled' | 'startFailed' | 'pollFailed' | 'saveFailed' | 'cancelling' | 'cancelFailed' | 'detached'
export interface ImageFeedback { phase: ImagePhase; job?: ImageJobRecord; detail?: string }

/** One immutable prompt/template/job. Recovery never submits a second generation. */
export class ImageStudioSession {
  private job?: ImageJobRecord
  private epoch = 0
  private running = false
  private cancelling = false
  private uncertain = false
  private complete = false
  private detached = false
  private snapshotDone = false
  constructor(private project: KinaouProject, private connection: string, private parameters: ImageJobParameters, private templateId: string, private deps: {
    client: Pick<WorkerClient, 'startImageJob' | 'imageJobStatus' | 'cancelImageJob'>
    environment: () => { project: KinaouProject; connection: string }
    snapshot: (project: KinaouProject) => void
    persist: (project: KinaouProject) => void
    publish: (feedback: ImageFeedback) => void
    wait?: () => Promise<void>
  }) { this.parameters = structuredClone(parameters) }
  get unresolved() { return !this.complete && !this.detached }
  get wasDetached() { return this.detached }
  observe(project: KinaouProject, connection: string) {
    if (this.unresolved && (JSON.stringify(this.project) !== JSON.stringify(project) || connection !== this.connection)) this.detach()
  }
  detach() { this.detached = true; this.epoch++ }
  private current() { const current = this.deps.environment(); this.observe(current.project, current.connection); return !this.detached }
  private publish(phase: ImagePhase, detail?: string) { if (this.current()) this.deps.publish({ phase, job: this.job, detail }) }
  private accept(value: ImageJobRecord) {
    const job = parseImageJob(value)
    const p = job.provenance, expected = this.parameters
    if (!/^[A-Za-z0-9_-]+$/.test(job.id) || (this.job && job.id !== this.job.id) || job.templatePath !== expected.templatePath) throw new Error('Image result does not match the submitted job and template')
    if (p.templateId !== this.templateId || (p.mediaType !== undefined && p.mediaType !== 'image') || p.seed !== expected.seed || p.positivePrompt !== expected.positivePrompt || p.negativePrompt !== (expected.negativePrompt ?? '') || p.width !== (expected.width ?? null) || p.height !== (expected.height ?? null) || (p.references?.length ?? 0)) throw new Error('Image provenance does not match submitted parameters')
    if (job.imagePath && !['png', 'jpg', 'webp'].some(extension => job.imagePath === `KINAOU/Assets/GeneratedImages/${job.id}.${extension}`)) throw new Error('Image output does not match the accepted job')
    if (!Number.isFinite(job.progress) || (job.state === 'succeeded' && !Number.isSafeInteger(job.sizeBytes))) throw new Error('Invalid image output measurements')
    this.job = job
  }
  async run() {
    if (this.running || this.uncertain || this.complete || !this.current()) return
    this.running = true
    const epoch = ++this.epoch
    let phase: ImagePhase = this.job ? 'running' : 'starting'
    try {
      this.publish(phase)
      if (!this.job) {
        const job = await this.deps.client.startImageJob(this.parameters)
        if (!this.current() || epoch !== this.epoch) return
        this.accept(job)
      }
      let polls = 0
      while (this.job!.state === 'queued' || this.job!.state === 'running') {
        phase = 'running'; this.publish(this.job!.state as 'queued' | 'running')
        if (++polls > 4800) throw new Error('Monitoring timed out; the accepted image job may still be running')
        await (this.deps.wait?.() ?? new Promise<void>(resolve => setTimeout(resolve, 750)))
        if (!this.current() || epoch !== this.epoch) return
        const next = await this.deps.client.imageJobStatus(this.job!.id)
        if (!this.current() || epoch !== this.epoch) return
        this.accept(next)
      }
      if (!this.current() || epoch !== this.epoch) return
      if (this.job!.state === 'succeeded') {
        phase = 'saving'; this.publish(phase)
        const next = registerGeneratedImage(this.project, this.job!)
        if (!this.snapshotDone) { this.deps.snapshot(this.project); this.snapshotDone = true }
        const previous = this.project
        this.project = next // Owned synchronous writes must not look like external changes.
        try { this.deps.persist(next) } catch (cause) { this.project = previous; throw cause }
      }
      this.complete = true
      this.publish(this.job!.state as 'succeeded' | 'failed' | 'cancelled', this.job!.error)
    } catch (cause) {
      if (epoch !== this.epoch) return
      this.uncertain = phase === 'starting'
      this.publish(phase === 'starting' ? 'startFailed' : phase === 'saving' ? 'saveFailed' : 'pollFailed', cause instanceof Error ? cause.message : String(cause))
    } finally { if (epoch === this.epoch) this.running = false }
  }
  async cancel() {
    if (this.cancelling || !this.job || !['queued', 'running'].includes(this.job.state) || !this.current()) return
    const epoch = ++this.epoch
    this.running = true; this.cancelling = true; this.publish('cancelling')
    try {
      const next = await this.deps.client.cancelImageJob(this.job.id)
      if (!this.current() || epoch !== this.epoch) return
      this.accept(next)
      this.running = false; this.cancelling = false
      await this.run() // A completed file wins a cancellation race; register its actual result.
    } catch (cause) {
      if (epoch === this.epoch) { this.running = false; this.cancelling = false; this.publish('cancelFailed', cause instanceof Error ? cause.message : String(cause)) }
    }
  }
}
