export type TtsJobState = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'
export interface TtsJobRecord { id: string; state: TtsJobState; progress: number; createdAt: string; updatedAt: string; voicePath: string; audioPath?: string; durationMs?: number; sizeBytes?: number; error?: string }

export function parseTtsJob(value: unknown): TtsJobRecord {
  if (!value || typeof value !== 'object') throw new Error('Invalid TTS job response')
  const job = value as Partial<TtsJobRecord>
  if (typeof job.id !== 'string' || !['queued', 'running', 'succeeded', 'failed', 'cancelled'].includes(String(job.state)) || typeof job.progress !== 'number' || job.progress < 0 || job.progress > 1) throw new Error('Invalid TTS job state')
  if (typeof job.createdAt !== 'string' || typeof job.updatedAt !== 'string' || typeof job.voicePath !== 'string' || !job.voicePath.startsWith('KINAOU/Models/')) throw new Error('Invalid TTS job metadata')
  if (job.state === 'succeeded' && (!job.audioPath?.startsWith('KINAOU/Assets/GeneratedVoice/') || typeof job.durationMs !== 'number' || job.durationMs <= 0 || typeof job.sizeBytes !== 'number' || job.sizeBytes < 0)) throw new Error('Invalid completed TTS result')
  return job as TtsJobRecord
}
