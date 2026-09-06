export type RenderJobState = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'

export interface RenderJobRecord {
  id: string
  state: RenderJobState
  progress: number
  createdAt: string
  updatedAt: string
  outputPath?: string
  durationMs?: number
  sizeBytes?: number
  error?: string
}

export function parseRenderJob(value: unknown): RenderJobRecord {
  if (!value || typeof value !== 'object') throw new Error('Invalid render job response')
  const job = value as Partial<RenderJobRecord>
  if (typeof job.id !== 'string' || !job.id) throw new Error('Render job id missing')
  if (!['queued', 'running', 'succeeded', 'failed', 'cancelled'].includes(String(job.state))) throw new Error('Invalid render job state')
  if (typeof job.progress !== 'number' || job.progress < 0 || job.progress > 1) throw new Error('Invalid render job progress')
  if (typeof job.createdAt !== 'string' || typeof job.updatedAt !== 'string') throw new Error('Render job timestamps missing')
  return job as RenderJobRecord
}
