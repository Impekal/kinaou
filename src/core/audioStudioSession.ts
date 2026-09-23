import { registerGeneratedVoice } from './generatedVoice'
import { buildSpeechSynthesisRequest, type SpeechDeliveryOptions } from './speechDelivery'
import type { KinaouProject } from './project'
import {
  parseSpeechVoiceCatalog,
  type SpeechVoiceDescriptor
} from './speech'
import {
  parseSpeechJob,
  speechJobFromLegacyTts,
  type SpeechJobRecord
} from './speechJobs'
import type { TtsJobRecord } from './ttsJobs'
import type { WorkerClient } from './workerClient'
import type { SpeechRetakeContext } from './speechRetakes'

export type AudioPhase =
  | 'starting'
  | 'queued'
  | 'running'
  | 'saving'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'startFailed'
  | 'pollFailed'
  | 'saveFailed'
  | 'cancelling'
  | 'cancelFailed'
  | 'detached'

export interface AudioFeedback {
  phase: AudioPhase
  job?: SpeechJobRecord | TtsJobRecord
  detail?: string
}

type GenericSpeechClient = Pick<
  WorkerClient,
  'startSpeech' | 'speechStatus' | 'cancelSpeech'
>

type LegacySpeechClient = Pick<
  WorkerClient,
  'startTts' | 'ttsStatus' | 'cancelTts'
>

type SpeechClient = GenericSpeechClient | LegacySpeechClient

function genericClient(
  client: SpeechClient
): client is GenericSpeechClient {
  return typeof (client as GenericSpeechClient).startSpeech === 'function'
}

function legacyVoice(value: string): SpeechVoiceDescriptor {
  if (!value.startsWith('KINAOU/Models/')) {
    throw new Error('Narration and a managed voice are required')
  }

  return {
    id: value,
    adapterId: 'piper',
    label: value.split('/').pop()?.replace(/\.onnx$/, '') || value,
    locale: null,
    capabilities: ['synthesis']
  }
}

function normalizeVoice(
  value: SpeechVoiceDescriptor | string
): SpeechVoiceDescriptor {
  return typeof value === 'string'
    ? legacyVoice(value)
    : parseSpeechVoiceCatalog([value])[0]
}

async function start(
  client: SpeechClient,
  text: string,
  voice: SpeechVoiceDescriptor,
  options: SpeechDeliveryOptions
): Promise<SpeechJobRecord> {
  if (genericClient(client)) {
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

async function status(
  client: SpeechClient,
  job: SpeechJobRecord
): Promise<SpeechJobRecord> {
  if (genericClient(client)) {
    return parseSpeechJob(await client.speechStatus(job.id))
  }

  if (job.adapterId !== 'piper') {
    throw new Error('Legacy TTS client only supports Piper')
  }

  return speechJobFromLegacyTts(
    await client.ttsStatus(job.id)
  )
}

async function cancel(
  client: SpeechClient,
  job: SpeechJobRecord
): Promise<SpeechJobRecord> {
  if (genericClient(client)) {
    return parseSpeechJob(await client.cancelSpeech(job.id))
  }

  if (job.adapterId !== 'piper') {
    throw new Error('Legacy TTS client only supports Piper')
  }

  return speechJobFromLegacyTts(
    await client.cancelTts(job.id)
  )
}

/** One immutable text/voice/job. Recovery never submits a second synthesis. */
export class AudioStudioSession {
  private job?: SpeechJobRecord
  private epoch = 0
  private running = false
  private cancelling = false
  private uncertain = false
  private complete = false
  private detached = false
  private snapshotDone = false
  private voice: SpeechVoiceDescriptor

  constructor(
    private project: KinaouProject,
    private connection: string,
    private text: string,
    voice: SpeechVoiceDescriptor | string,
    private deps: {
      client: SpeechClient
      environment: () => {
        project: KinaouProject
        connection: string
      }
      snapshot: (project: KinaouProject) => void
      persist: (project: KinaouProject) => void
      publish: (feedback: AudioFeedback) => void
      wait?: () => Promise<void>
      speechOptions?: SpeechDeliveryOptions
      retakeContext?: SpeechRetakeContext
      saveResult?: (
        project: KinaouProject,
        job: SpeechJobRecord,
        text: string,
        retakeContext?: SpeechRetakeContext
      ) => KinaouProject
    }
  ) {
    this.text = text.trim()
    this.voice = normalizeVoice(voice)

    if (!this.text) {
      throw new Error('Narration and a managed voice are required')
    }
  }

  get unresolved() {
    return !this.complete && !this.detached
  }

  get wasDetached() {
    return this.detached
  }

  observe(project: KinaouProject, connection: string) {
    if (
      this.unresolved
      && (
        JSON.stringify(this.project) !== JSON.stringify(project)
        || connection !== this.connection
      )
    ) {
      this.detach()
    }
  }

  detach() {
    this.detached = true
    this.epoch++
  }

  private current() {
    const current = this.deps.environment()
    this.observe(current.project, current.connection)
    return !this.detached
  }

  private publish(phase: AudioPhase, detail?: string) {
    if (this.current()) {
      this.deps.publish({
        phase,
        job: this.job,
        detail
      })
    }
  }

  private accept(value: SpeechJobRecord) {
    const job = parseSpeechJob(value)

    if (
      !job.id
      || (this.job && job.id !== this.job.id)
      || job.adapterId !== this.voice.adapterId
      || job.voiceId !== this.voice.id
    ) {
      throw new Error(
        'Voice result does not match the submitted job, adapter and voice'
      )
    }

    if (
      job.audioPath
      && job.audioPath !== `KINAOU/Assets/GeneratedVoice/${job.id}.wav`
    ) {
      throw new Error('Voice output does not match the accepted job')
    }

    if (
      job.state === 'succeeded'
      && (
        !Number.isFinite(job.durationMs)
        || !Number.isFinite(job.sizeBytes)
      )
    ) {
      throw new Error('Invalid voice output measurements')
    }

    this.job = job
  }

  async run() {
    if (
      this.running
      || this.uncertain
      || this.complete
      || !this.current()
    ) return

    this.running = true

    const epoch = ++this.epoch
    let phase: AudioPhase = this.job ? 'running' : 'starting'

    try {
      this.publish(phase)

      if (!this.job) {
        const job = await start(
          this.deps.client,
          this.text,
          this.voice,
          this.deps.speechOptions ?? {}
        )

        if (!this.current() || epoch !== this.epoch) return
        this.accept(job)
      }

      let polls = 0

      while (
        this.job!.state === 'queued'
        || this.job!.state === 'running'
      ) {
        phase = 'running'
        this.publish(this.job!.state)

        if (++polls > 4800) {
          throw new Error(
            'Monitoring timed out; the accepted voice job may still be running'
          )
        }

        await (
          this.deps.wait?.()
          ?? new Promise<void>(resolve => setTimeout(resolve, 750))
        )

        if (!this.current() || epoch !== this.epoch) return

        const next = await status(
          this.deps.client,
          this.job!
        )

        if (!this.current() || epoch !== this.epoch) return

        this.accept(next)
      }

      if (!this.current() || epoch !== this.epoch) return

      if (this.job!.state === 'succeeded') {
        phase = 'saving'
        this.publish(phase)

        const next =
          this.deps.saveResult
            ? this.deps.saveResult(
                this.project,
                this.job!,
                this.text,
                this.deps.retakeContext
              )
            : registerGeneratedVoice(
                this.project,
                this.job!,
                this.text,
                this.deps.retakeContext
              )

        if (!this.snapshotDone) {
          this.deps.snapshot(this.project)
          this.snapshotDone = true
        }

        const previous = this.project
        this.project = next

        try {
          this.deps.persist(next)
        } catch (cause) {
          this.project = previous
          throw cause
        }
      }

      this.complete = true

      this.publish(
        this.job!.state as 'succeeded' | 'failed' | 'cancelled',
        this.job!.error
      )
    } catch (cause) {
      if (epoch !== this.epoch) return

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
      if (epoch === this.epoch) this.running = false
    }
  }

  async cancel() {
    if (
      this.cancelling
      || !this.job
      || !['queued', 'running'].includes(this.job.state)
      || !this.current()
    ) return

    const epoch = ++this.epoch

    this.running = true
    this.cancelling = true
    this.publish('cancelling')

    try {
      const next = await cancel(
        this.deps.client,
        this.job
      )

      if (!this.current() || epoch !== this.epoch) return

      this.accept(next)

      this.running = false
      this.cancelling = false

      await this.run()
    } catch (cause) {
      if (epoch === this.epoch) {
        this.running = false
        this.cancelling = false

        this.publish(
          'cancelFailed',
          cause instanceof Error ? cause.message : String(cause)
        )
      }
    }
  }
}
