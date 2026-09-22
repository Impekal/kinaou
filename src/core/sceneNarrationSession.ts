import type { KinaouProject } from './project'
import { buildSpeechSynthesisRequest, type SpeechDeliveryOptions } from './speechDelivery'
import {
  placeSceneNarration,
  planSceneVoiceovers,
  type NarratedScene,
  type SkippedVoiceoverScene
} from './sceneVoiceover'
import {
  parseSpeechVoiceCatalog,
  type SpeechVoiceDescriptor
} from './speech'
import {
  parseSpeechJob,
  speechJobFromLegacyTts,
  type SpeechJobRecord
} from './speechJobs'
import type { WorkerClient } from './workerClient'

export type NarrationPhase =
  | 'idle'
  | 'starting'
  | 'queued'
  | 'running'
  | 'saving'
  | 'complete'
  | 'startFailed'
  | 'pollFailed'
  | 'saveFailed'
  | 'detached'

export interface NarrationFeedback {
  phase: NarrationPhase
  title?: string
  index: number
  total: number
  done: NarratedScene[]
  skipped: SkippedVoiceoverScene[]
  detail?: string
}

type GenericClient = Pick<
  WorkerClient,
  'startSpeech' | 'speechStatus'
>

type LegacyClient = Pick<
  WorkerClient,
  'startTts' | 'ttsStatus'
>

type Client = GenericClient | LegacyClient

function isGeneric(client: Client): client is GenericClient {
  return typeof (client as GenericClient).startSpeech === 'function'
}

function normalizeVoice(
  voice: SpeechVoiceDescriptor | string
): SpeechVoiceDescriptor {
  if (typeof voice !== 'string') {
    return parseSpeechVoiceCatalog([voice])[0]
  }

  if (!voice.startsWith('KINAOU/Models/')) {
    throw new Error('Managed speech voice required')
  }

  return {
    id: voice,
    adapterId: 'piper',
    label: voice.split('/').pop()?.replace(/\.onnx$/, '') || voice,
    locale: null,
    capabilities: ['synthesis']
  }
}

async function startJob(
  client: Client,
  text: string,
  voice: SpeechVoiceDescriptor,
  options: SpeechDeliveryOptions
): Promise<SpeechJobRecord> {
  if (isGeneric(client)) {
    return parseSpeechJob(
      await client.startSpeech(
        buildSpeechSynthesisRequest(
          text,
          voice,
          options
        )
      )
    )
  }

  if (voice.adapterId !== 'piper') {
    throw new Error('Legacy TTS client only supports Piper')
  }

  return speechJobFromLegacyTts(
    await client.startTts(text, voice.id)
  )
}

async function readJob(
  client: Client,
  job: SpeechJobRecord
): Promise<SpeechJobRecord> {
  if (isGeneric(client)) {
    return parseSpeechJob(await client.speechStatus(job.id))
  }

  if (job.adapterId !== 'piper') {
    throw new Error('Legacy TTS client only supports Piper')
  }

  return speechJobFromLegacyTts(
    await client.ttsStatus(job.id)
  )
}

/** One immutable request context. Retries reuse the accepted job; stale runs never write. */
export class SceneNarrationSession {
  project: KinaouProject

  private pending: ReturnType<typeof planSceneVoiceovers>['pending']
  private skipped: SkippedVoiceoverScene[]
  private done: NarratedScene[] = []
  private index = 0
  private job?: SpeechJobRecord
  private snapshotDone = false
  private active = true
  private running = false
  private uncertain = false
  private voice: SpeechVoiceDescriptor

  constructor(
    project: KinaouProject,
    visualTrack: string,
    private voiceTrack: string,
    voice: SpeechVoiceDescriptor | string,
    private deps: {
      client: Client
      current: (project: KinaouProject) => boolean
      snapshot: () => void
      persist: (project: KinaouProject) => void
      publish: (feedback: NarrationFeedback) => void
      wait?: () => Promise<void>
      speechOptions?: SpeechDeliveryOptions
    }
  ) {
    this.project = project
    this.voice = normalizeVoice(voice)

    const plan = planSceneVoiceovers(project, visualTrack)
    this.pending = plan.pending
    this.skipped = plan.skipped
  }

  detach() {
    this.active = false
  }

  private current() {
    return this.active && this.deps.current(this.project)
  }

  private publish(phase: NarrationPhase, detail?: string) {
    if (this.current()) {
      this.deps.publish({
        phase,
        title: this.pending[this.index]?.title,
        index: Math.min(this.index + 1, this.pending.length),
        total: this.pending.length,
        done: [...this.done],
        skipped: [...this.skipped],
        detail
      })
    }
  }

  private accept(job: SpeechJobRecord) {
    const parsed = parseSpeechJob(job)

    if (
      (this.job && parsed.id !== this.job.id)
      || parsed.adapterId !== this.voice.adapterId
      || parsed.voiceId !== this.voice.id
    ) {
      throw new Error(
        'Narration status does not match the submitted job, adapter and voice'
      )
    }

    this.job = parsed
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
          phase = 'starting'
          this.publish(phase)

          this.accept(
            await startJob(
              this.deps.client,
              scene.text,
              this.voice,
              this.deps.speechOptions ?? {}
            )
          )

          if (!this.current()) return
        }

        phase = 'running'
        let polls = 0

        let job = this.job

        if (!job) {
          throw new Error('Accepted narration job is missing')
        }

        while (
          job.state === 'queued'
          || job.state === 'running'
        ) {
          this.publish(job.state)

          if (++polls > 600) {
            throw new Error(
              'Monitoring timed out; the accepted job may still be running'
            )
          }

          await (
            this.deps.wait?.()
            ?? new Promise<void>(resolve => setTimeout(resolve, 500))
          )

          if (!this.current()) return

          const next = await readJob(
            this.deps.client,
            job
          )

          if (!this.current()) return

          this.accept(next)

          job = this.job

          if (!job) {
            throw new Error('Accepted narration job disappeared')
          }
        }

        if (!this.current()) return

        if (job.state !== 'succeeded') {
          this.skipped.push({
            sceneId: scene.sceneId,
            title: scene.title,
            code: job.state,
            reason: job.error ?? job.state
          })
        } else {
          phase = 'saving'
          this.publish(phase)

          const placed = placeSceneNarration(
            this.project,
            scene,
            job,
            this.voiceTrack
          )

          this.deps.persist(placed.project)
          this.project = placed.project
          this.done.push(placed.narrated)
        }

        this.job = undefined
      }

      this.publish('complete')
    } catch (cause) {
      this.uncertain = phase === 'starting'

      this.publish(
        phase === 'starting'
          ? 'startFailed'
          : phase === 'saving'
            ? 'saveFailed'
            : 'pollFailed',
        cause instanceof Error ? cause.message : String(cause)
      )
    } finally {
      this.running = false
    }
  }
}
