import type { KinaouProject } from './project'
import { placeSceneNarration, planSceneVoiceovers, type NarratedScene, type SkippedVoiceoverScene } from './sceneVoiceover'
import type { TtsJobRecord } from './ttsJobs'
import type { WorkerClient } from './workerClient'

export type NarrationPhase = 'idle' | 'starting' | 'queued' | 'running' | 'saving' | 'complete' | 'startFailed' | 'pollFailed' | 'saveFailed' | 'detached'
export interface NarrationFeedback {
  phase: NarrationPhase
  title?: string
  index: number
  total: number
  done: NarratedScene[]
  skipped: SkippedVoiceoverScene[]
  detail?: string
}

/** One immutable request context. Retries reuse the accepted job; stale runs never write. */
export class SceneNarrationSession {
  project: KinaouProject
  private pending: ReturnType<typeof planSceneVoiceovers>['pending']
  private skipped: SkippedVoiceoverScene[]
  private done: NarratedScene[] = []
  private index = 0
  private job?: TtsJobRecord
  private snapshotDone = false
  private active = true
  private running = false
  private uncertain = false

  constructor(project: KinaouProject, visualTrack: string, private voiceTrack: string, private voice: string, private deps: {
    client: Pick<WorkerClient, 'startTts' | 'ttsStatus'>
    current: (project: KinaouProject) => boolean
    snapshot: () => void
    persist: (project: KinaouProject) => void
    publish: (feedback: NarrationFeedback) => void
    wait?: () => Promise<void>
  }) {
    this.project = project
    const plan = planSceneVoiceovers(project, visualTrack)
    this.pending = plan.pending
    this.skipped = plan.skipped
  }

  detach() { this.active = false }
  private current() { return this.active && this.deps.current(this.project) }
  private publish(phase: NarrationPhase, detail?: string) {
    if (this.current()) this.deps.publish({ phase, title: this.pending[this.index]?.title, index: Math.min(this.index + 1, this.pending.length), total: this.pending.length, done: [...this.done], skipped: [...this.skipped], detail })
  }

  async run() {
    if (this.running || this.uncertain || !this.current()) return
    this.running = true
    let phase: NarrationPhase = 'saving'
    try {
      if (this.pending.length && !this.snapshotDone) {
        this.deps.snapshot()
        this.snapshotDone = true
      }
      for (; this.index < this.pending.length; this.index++) {
        if (!this.current()) return
        const scene = this.pending[this.index]
        if (!this.job) {
          phase = 'starting'; this.publish(phase)
          this.job = await this.deps.client.startTts(scene.text, this.voice)
          if (!this.current()) return
        }
        phase = 'running'
        let polls = 0
        while (this.job.state === 'queued' || this.job.state === 'running') {
          this.publish(this.job.state)
          if (++polls > 600) throw new Error('Monitoring timed out; the accepted job may still be running')
          await (this.deps.wait?.() ?? new Promise<void>((resolve) => setTimeout(resolve, 500)))
          if (!this.current()) return
          const next = await this.deps.client.ttsStatus(this.job.id)
          if (!this.current()) return
          if (next.id !== this.job.id || next.voicePath !== this.voice) throw new Error('Narration status does not match the submitted job and voice')
          this.job = next
        }
        if (!this.current()) return
        if (this.job.voicePath !== this.voice) throw new Error('Narration result belongs to another voice')
        if (this.job.state !== 'succeeded') {
          this.skipped.push({ sceneId: scene.sceneId, title: scene.title, code: this.job.state, reason: this.job.error ?? this.job.state })
        } else {
          phase = 'saving'; this.publish(phase)
          const placed = placeSceneNarration(this.project, scene, this.job, this.voiceTrack)
          this.deps.persist(placed.project)
          this.project = placed.project
          this.done.push(placed.narrated)
        }
        this.job = undefined
      }
      this.publish('complete')
    } catch (cause) {
      this.uncertain = phase === 'starting'
      this.publish(phase === 'starting' ? 'startFailed' : phase === 'saving' ? 'saveFailed' : 'pollFailed', cause instanceof Error ? cause.message : String(cause))
    } finally { this.running = false }
  }
}
