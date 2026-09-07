import { parseImageGenerationProvenance, type ImageGenerationProvenance, type ImageJobState } from './imageJobs'

export type VideoJobState = ImageJobState

export interface VideoJobRecord {
  id: string
  state: VideoJobState
  progress: number
  createdAt: string
  updatedAt: string
  templatePath: string
  provenance: ImageGenerationProvenance
  videoPath?: string
  sizeBytes?: number
  durationMs?: number
  width?: number
  height?: number
  error?: string
}

const TEMPLATE_PREFIX = 'KINAOU/Models/ComfyUI/Workflows/'
const GENERATED_VIDEO_PREFIX = 'KINAOU/Assets/GeneratedVideo/'

export function parseVideoJob(value: unknown): VideoJobRecord {
  if (!value || typeof value !== 'object') throw new Error('Invalid video job response')
  const job = value as Partial<VideoJobRecord>
  if (typeof job.id !== 'string' || !['queued', 'running', 'succeeded', 'failed', 'cancelled'].includes(String(job.state))) throw new Error('Invalid video job identity or state')
  if (typeof job.progress !== 'number' || job.progress < 0 || job.progress > 1 || typeof job.createdAt !== 'string' || typeof job.updatedAt !== 'string') throw new Error('Invalid video job progress or timestamps')
  if (typeof job.templatePath !== 'string' || !job.templatePath.startsWith(TEMPLATE_PREFIX)) throw new Error('Invalid video job template path')
  const provenance = parseImageGenerationProvenance(job.provenance)
  if (provenance.mediaType !== undefined && provenance.mediaType !== 'video') throw new Error('Invalid video job provenance media type')
  if (job.state === 'succeeded' && (!job.videoPath?.startsWith(GENERATED_VIDEO_PREFIX) || typeof job.sizeBytes !== 'number' || job.sizeBytes <= 0 || typeof job.durationMs !== 'number' || job.durationMs <= 0)) throw new Error('Invalid completed video result')
  return job as VideoJobRecord
}
