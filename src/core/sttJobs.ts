export type SttJobState = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'
export interface SttTranscript { schemaVersion: 1; adapterId: 'whisper.cpp'; language: string; text: string; segments: Array<{ startMs: number; endMs: number; text: string }> }
export interface SttJobRecord { id: string; state: SttJobState; progress: number; createdAt: string; updatedAt: string; transcriptPath?: string; transcript?: SttTranscript; error?: string }

export function parseSttJob(value: unknown): SttJobRecord {
  if (!value || typeof value !== 'object') throw new Error('Invalid STT job response')
  const job = value as Partial<SttJobRecord>
  if (typeof job.id !== 'string' || !['queued', 'running', 'succeeded', 'failed', 'cancelled'].includes(String(job.state))) throw new Error('Invalid STT job identity or state')
  if (typeof job.progress !== 'number' || job.progress < 0 || job.progress > 1 || typeof job.createdAt !== 'string' || typeof job.updatedAt !== 'string') throw new Error('Invalid STT job progress or timestamps')
  if (job.state === 'succeeded' && (!job.transcriptPath?.startsWith('KINAOU/Projects/Transcripts/') || job.transcript?.schemaVersion !== 1 || job.transcript.adapterId !== 'whisper.cpp')) throw new Error('Invalid completed STT result')
  return job as SttJobRecord
}
