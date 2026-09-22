import type { TtsJobRecord } from './ttsJobs'

export type SpeechJobState =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'

export interface SpeechJobRecord {
  id: string
  adapterId: string
  voiceId: string
  state: SpeechJobState
  progress: number
  createdAt: string
  updatedAt: string
  audioPath?: string
  durationMs?: number
  sizeBytes?: number
  error?: string
}

export interface SpeechReferenceAudio {
  assetId: string
  path: string
  authorized: true
}

export interface SpeechSynthesisRequest {
  adapterId: string
  voiceId: string
  text: string
  language?: string
  styleInstruction?: string
  pace?: number
  referenceAudio?: SpeechReferenceAudio
}

export function parseSpeechJob(value: unknown): SpeechJobRecord {
  if (!value || typeof value !== 'object') {
    throw new Error('Invalid speech job response')
  }

  const job = value as Partial<SpeechJobRecord>

  if (
    typeof job.id !== 'string'
    || !job.id
    || typeof job.adapterId !== 'string'
    || !/^[a-z0-9][a-z0-9._-]*$/.test(job.adapterId)
    || typeof job.voiceId !== 'string'
    || !job.voiceId
    || !['queued', 'running', 'succeeded', 'failed', 'cancelled']
      .includes(String(job.state))
    || typeof job.progress !== 'number'
    || !Number.isFinite(job.progress)
    || job.progress < 0
    || job.progress > 1
    || typeof job.createdAt !== 'string'
    || typeof job.updatedAt !== 'string'
  ) {
    throw new Error('Invalid speech job metadata')
  }

  if (job.state === 'succeeded') {
    if (
      typeof job.audioPath !== 'string'
      || !job.audioPath.startsWith('KINAOU/Assets/GeneratedVoice/')
      || typeof job.durationMs !== 'number'
      || !Number.isFinite(job.durationMs)
      || job.durationMs <= 0
      || typeof job.sizeBytes !== 'number'
      || !Number.isSafeInteger(job.sizeBytes)
      || job.sizeBytes < 0
    ) {
      throw new Error('Invalid completed speech result')
    }
  }

  return job as SpeechJobRecord
}


export function speechJobFromLegacyTts(job: TtsJobRecord): SpeechJobRecord {
  return parseSpeechJob({
    id: job.id,
    adapterId: 'piper',
    voiceId: job.voicePath,
    state: job.state,
    progress: job.progress,
    // Older in-memory Piper fixtures and integrations predate generic speech
    // timestamps. Keep that legacy boundary readable without weakening the
    // generic worker response parser.
    createdAt: typeof job.createdAt === 'string' ? job.createdAt : '',
    updatedAt: typeof job.updatedAt === 'string' ? job.updatedAt : '',
    ...(job.audioPath ? {
      audioPath: job.audioPath,
      durationMs: job.durationMs,
      sizeBytes: job.sizeBytes
    } : {}),
    ...(job.error ? { error: job.error } : {})
  })
}
