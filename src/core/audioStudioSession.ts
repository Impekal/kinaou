import { registerGeneratedVoice } from './generatedVoice'
import type { KinaouProject } from './project'
import { parseTtsJob, type TtsJobRecord } from './ttsJobs'
import type { WorkerClient } from './workerClient'

export type AudioPhase = 'starting' | 'queued' | 'running' | 'saving' | 'succeeded' | 'failed' | 'cancelled' | 'startFailed' | 'pollFailed' | 'saveFailed' | 'cancelling' | 'cancelFailed' | 'detached'
export interface AudioFeedback { phase: AudioPhase; job?: TtsJobRecord; detail?: string }

/** One immutable text/voice/job. Recovery never submits a second synthesis. */
export class AudioStudioSession {
  private job?: TtsJobRecord
  private epoch = 0
  private running = false
  private cancelling = false
  private uncertain = false
  private complete = false
  private detached = false
  private snapshotDone = false
  constructor(private project: KinaouProject, private connection: string, private text: string, private voice: string, private deps: {
    client: Pick<WorkerClient, 'startTts' | 'ttsStatus' | 'cancelTts'>
    environment: () => { project: KinaouProject; connection: string }
    snapshot: (project: KinaouProject) => void
    persist: (project: KinaouProject) => void
    publish: (feedback: AudioFeedback) => void
    wait?: () => Promise<void>
  }) { this.text = text.trim(); if (!this.text || !voice.startsWith('KINAOU/Models/')) throw new Error('Narration and a managed voice are required') }
  get unresolved() { return !this.complete && !this.detached }
  get wasDetached() { return this.detached }
  observe(project: KinaouProject, connection: string) {
    if (this.unresolved && (JSON.stringify(this.project) !== JSON.stringify(project) || connection !== this.connection)) this.detach()
  }
  detach() { this.detached = true; this.epoch++ }
  private current() { const current = this.deps.environment(); this.observe(current.project, current.connection); return !this.detached }
  private publish(phase: AudioPhase, detail?: string) { if (this.current()) this.deps.publish({ phase, job: this.job, detail }) }
  private accept(value: TtsJobRecord) {
    const job = parseTtsJob(value)
    if (!job.id || (this.job && job.id !== this.job.id) || job.voicePath !== this.voice) throw new Error('Voice result does not match the submitted job and voice')
    if (job.audioPath && job.audioPath !== `KINAOU/Assets/GeneratedVoice/${job.id}.wav`) throw new Error('Voice output does not match the accepted job')
    if (job.state === 'succeeded' && (!Number.isFinite(job.durationMs) || !Number.isFinite(job.sizeBytes))) throw new Error('Invalid voice output measurements')
    this.job = job
  }
  async run() {
    if (this.running || this.uncertain || this.complete || !this.current()) return
    this.running = true
    const epoch = ++this.epoch
    let phase: AudioPhase = this.job ? 'running' : 'starting'
    try {
      this.publish(phase)
      if (!this.job) {
        const job = await this.deps.client.startTts(this.text, this.voice)
        if (!this.current() || epoch !== this.epoch) return
        this.accept(job)
      }
      let polls = 0
      while (this.job!.state === 'queued' || this.job!.state === 'running') {
        phase = 'running'; this.publish(this.job!.state as 'queued' | 'running')
        if (++polls > 4800) throw new Error('Monitoring timed out; the accepted voice job may still be running')
        await (this.deps.wait?.() ?? new Promise<void>(resolve => setTimeout(resolve, 750)))
        if (!this.current() || epoch !== this.epoch) return
        const next = await this.deps.client.ttsStatus(this.job!.id)
        if (!this.current() || epoch !== this.epoch) return
        this.accept(next)
      }
      if (!this.current() || epoch !== this.epoch) return
      if (this.job!.state === 'succeeded') {
        phase = 'saving'; this.publish(phase)
        const next = registerGeneratedVoice(this.project, this.job!, this.text)
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
      const next = await this.deps.client.cancelTts(this.job.id)
      if (!this.current() || epoch !== this.epoch) return
      this.accept(next)
      this.running = false; this.cancelling = false
      await this.run() // A completed file wins a cancellation race; register its actual result.
    } catch (cause) {
      if (epoch === this.epoch) { this.running = false; this.cancelling = false; this.publish('cancelFailed', cause instanceof Error ? cause.message : String(cause)) }
    }
  }
}
