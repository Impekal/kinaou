import { parseImageGenerationProvenance } from './imageJobs'
import { parseProject, touchProject, type KinaouProject } from './project'
import type { VideoJobRecord } from './videoJobs'

const GENERATED_VIDEO_PREFIX = 'KINAOU/Assets/GeneratedVideo/'

function mimeTypeFor(videoPath: string): string {
  if (videoPath.endsWith('.mp4')) return 'video/mp4'
  if (videoPath.endsWith('.webm')) return 'video/webm'
  if (videoPath.endsWith('.mov')) return 'video/quicktime'
  throw new Error('Unsupported generated video type')
}

export function registerGeneratedVideo(project: KinaouProject, job: VideoJobRecord): KinaouProject {
  if (job.state !== 'succeeded' || !job.videoPath?.startsWith(GENERATED_VIDEO_PREFIX) || typeof job.sizeBytes !== 'number' || job.sizeBytes <= 0 || typeof job.durationMs !== 'number' || job.durationMs <= 0) throw new Error('Completed managed video job required')
  const provenance = parseImageGenerationProvenance(job.provenance)
  if (project.assets.some((asset) => asset.uri === job.videoPath)) return project
  return parseProject(touchProject({ ...project, assets: [...project.assets, {
    id: crypto.randomUUID(), kind: 'video', uri: job.videoPath, managed: true, offline: false,
    metadata: {
      name: `Generated video · ${provenance.positivePrompt.slice(0, 60)}`,
      mimeType: mimeTypeFor(job.videoPath),
      sizeBytes: job.sizeBytes,
      durationMs: job.durationMs,
      width: job.width ?? provenance.width,
      height: job.height ?? provenance.height,
      generated: true,
      adapterId: provenance.adapterId,
      videoJobId: job.id,
      templateId: provenance.templateId,
      templatePath: job.templatePath,
      seed: provenance.seed,
      positivePrompt: provenance.positivePrompt,
      negativePrompt: provenance.negativePrompt,
      generatedAt: job.updatedAt
    }
  }] }))
}
