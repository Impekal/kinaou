import { registerGeneratedVideo } from './generatedVideos'
import type { KinaouProject } from './project'
import { parseVideoJob, type VideoJobRecord } from './videoJobs'
import type { ImageJobParameters as VideoJobParameters } from './imageJobs'
import type { WorkerClient } from './workerClient'

export type VideoPhase = 'starting' | 'queued' | 'running' | 'saving' | 'succeeded' | 'failed' | 'cancelled' | 'startFailed' | 'pollFailed' | 'saveFailed' | 'cancelling' | 'cancelFailed' | 'detached'
export interface VideoFeedback { phase: VideoPhase; job?: VideoJobRecord; detail?: string }

/** One immutable prompt/template/job. Recovery never submits a second generation. */
export class VideoStudioSession {
  private job?: VideoJobRecord
  private epoch = 0
  private running = false
  private cancelling = false
  private uncertain = false
  private complete = false
  private detached = false
  private snapshotDone = false
  constructor(private project: KinaouProject, private connection: string, private parameters: VideoJobParameters, private templateId: string, private deps: {
    client: Pick<WorkerClient, 'startVideoJob' | 'videoJobStatus' | 'cancelVideoJob'>
    environment: () => { project: KinaouProject; connection: string }
    snapshot: (project: KinaouProject) => void
    persist: (project: KinaouProject) => void
    publish: (feedback: VideoFeedback) => void
    wait?: () => Promise<void>
  }) { this.parameters = structuredClone(parameters) }
  get unresolved() { return !this.complete && !this.detached }
  get wasDetached() { return this.detached }
  observe(project: KinaouProject, connection: string) {
    if (this.unresolved && (JSON.stringify(this.project) !== JSON.stringify(project) || connection !== this.connection)) this.detach()
  }
  detach() { this.detached = true; this.epoch++ }
  private current() { const current = this.deps.environment(); this.observe(current.project, current.connection); return !this.detached }
  private publish(phase: VideoPhase, detail?: string) { if (this.current()) this.deps.publish({ phase, job: this.job, detail }) }
  private accept(value: VideoJobRecord) {
    const job = parseVideoJob(value)
    const p = job.provenance, expected = this.parameters
    if (!/^[A-Za-z0-9_-]+$/.test(job.id) || (this.job && job.id !== this.job.id) || job.templatePath !== expected.templatePath) throw new Error('Video result does not match the submitted job and template')
    if (p.templateId !== this.templateId || (p.mediaType !== undefined && p.mediaType !== 'video') || p.seed !== expected.seed || p.positivePrompt !== expected.positivePrompt || p.negativePrompt !== (expected.negativePrompt ?? '') || p.width !== (expected.width ?? null) || p.height !== (expected.height ?? null)) throw new Error('Video provenance does not match submitted parameters')
    const expectedRefs = Object.entries(expected.references ?? {})
    const actualRefs = p.references ?? []
    if ((job.state === 'succeeded' && actualRefs.length !== expectedRefs.length) || actualRefs.some(ref => {
      const source = expected.references?.[ref.role]
      const previous = this.job?.provenance.references?.find(entry => entry.role === ref.role)
      return !source || source.assetId !== ref.assetId || source.path !== ref.sourcePath || !ref.authorized || (previous && previous.sha256 !== ref.sha256)
    })) throw new Error('Video reference provenance does not match authorized submitted sources')
    if (this.job?.provenance.references?.some(previous => !actualRefs.some(ref => ref.role === previous.role))) throw new Error('Video reference provenance disappeared')
    if (job.videoPath && !['mp4', 'webm', 'mov'].some(extension => job.videoPath === `KINAOU/Assets/GeneratedVideo/${job.id}.${extension}`)) throw new Error('Video output does not match the accepted job')
    if (!Number.isFinite(job.progress) || (job.state === 'succeeded' && (!Number.isSafeInteger(job.sizeBytes) || !Number.isFinite(job.durationMs) || (job.durationMs ?? 0) <= 0 || !Number.isSafeInteger(job.width) || (job.width ?? 0) <= 0 || !Number.isSafeInteger(job.height) || (job.height ?? 0) <= 0))) throw new Error('Invalid video output measurements')
    this.job = job
  }
  async run() {
    if (this.running || this.uncertain || this.complete || !this.current()) return
    this.running = true
    const epoch = ++this.epoch
    let phase: VideoPhase = this.job ? 'running' : 'starting'
    try {
      this.publish(phase)
      if (!this.job) {
        const job = await this.deps.client.startVideoJob(this.parameters)
        if (!this.current() || epoch !== this.epoch) return
        this.accept(job)
      }
      let polls = 0
      while (this.job!.state === 'queued' || this.job!.state === 'running') {
        phase = 'running'; this.publish(this.job!.state as 'queued' | 'running')
        if (++polls > 4800) throw new Error('Monitoring timed out; the accepted video job may still be running')
        await (this.deps.wait?.() ?? new Promise<void>(resolve => setTimeout(resolve, 750)))
        if (!this.current() || epoch !== this.epoch) return
        const next = await this.deps.client.videoJobStatus(this.job!.id)
        if (!this.current() || epoch !== this.epoch) return
        this.accept(next)
      }
      if (!this.current() || epoch !== this.epoch) return
      if (this.job!.state === 'succeeded') {
        phase = 'saving'; this.publish(phase)
        const next = registerGeneratedVideo(this.project, this.job!)
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
      const next = await this.deps.client.cancelVideoJob(this.job.id)
      if (!this.current() || epoch !== this.epoch) return
      this.accept(next)
      this.running = false; this.cancelling = false
      await this.run() // A completed file wins a cancellation race; register its actual result.
    } catch (cause) {
      if (epoch === this.epoch) { this.running = false; this.cancelling = false; this.publish('cancelFailed', cause instanceof Error ? cause.message : String(cause)) }
    }
  }
}

