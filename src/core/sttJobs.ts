import { assertSafeManagedPath } from './storage'

export type SttJobState = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'
export interface SttTranscript { schemaVersion: 1; adapterId: 'whisper.cpp'; language: string; text: string; segments: Array<{ startMs: number; endMs: number; text: string }> }
export interface SttJobRecord { id: string; state: SttJobState; progress: number; createdAt: string; updatedAt: string; transcriptPath?: string; transcript?: SttTranscript; error?: string }

export function assertSttPath(value: string, prefix: string): string {
  if (typeof value !== 'string' || assertSafeManagedPath(value) !== value || !value.startsWith(prefix) || value.length <= prefix.length || /[\\\x00-\x1f\x7f]/.test(value) || value.split('/').some(part => !part || part === '.' || part === '..')) throw Error('Invalid canonical managed STT path')
  return value
}

export function parseSttTranscript(value: unknown): SttTranscript {
  if (!value || typeof value !== 'object') throw new Error('Invalid STT transcript')
  const transcript = value as Partial<SttTranscript>
  if (transcript.schemaVersion !== 1 || transcript.adapterId !== 'whisper.cpp' || typeof transcript.language !== 'string' || !transcript.language.trim() || typeof transcript.text !== 'string' || !Array.isArray(transcript.segments)) throw new Error('Invalid STT transcript')
  for (const segment of transcript.segments) {
    if (!Number.isSafeInteger(segment?.startMs) || !Number.isSafeInteger(segment?.endMs) || segment.startMs < 0 || segment.endMs <= segment.startMs || typeof segment.text !== 'string' || !segment.text.trim()) throw new Error('Invalid STT transcript segment')
  }
  return transcript as SttTranscript
}

export function parseSttJob(value: unknown): SttJobRecord {
  if (!value || typeof value !== 'object') throw new Error('Invalid STT job response')
  const job = value as Partial<SttJobRecord>
  if (typeof job.id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(job.id) || !['queued', 'running', 'succeeded', 'failed', 'cancelled'].includes(String(job.state))) throw new Error('Invalid STT job identity or state')
  if (typeof job.progress !== 'number' || !Number.isFinite(job.progress) || job.progress < 0 || job.progress > 1 || typeof job.createdAt !== 'string' || typeof job.updatedAt !== 'string') throw new Error('Invalid STT job progress or timestamps')
  if (job.error !== undefined && typeof job.error !== 'string') throw Error('Invalid STT error detail')
  if (job.state === 'succeeded' && (typeof job.transcriptPath !== 'string' || !job.transcriptPath.startsWith('KINAOU/Projects/Transcripts/') || !job.transcript)) throw new Error('Invalid completed STT result')
  if (job.transcriptPath !== undefined) {
    assertSttPath(job.transcriptPath, 'KINAOU/Projects/Transcripts/')
    if (!job.transcriptPath.endsWith('.json')) throw Error('Invalid completed STT result path')
  }
  if (job.transcript !== undefined) parseSttTranscript(job.transcript)
  return job as SttJobRecord
}
