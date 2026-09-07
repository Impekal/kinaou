import { parseImageGenerationProvenance, type ImageJobRecord } from './imageJobs'
import { parseProject, touchProject, type KinaouProject } from './project'

const GENERATED_IMAGE_PREFIX = 'KINAOU/Assets/GeneratedImages/'

function mimeTypeFor(imagePath: string): string {
  if (imagePath.endsWith('.png')) return 'image/png'
  if (imagePath.endsWith('.webp')) return 'image/webp'
  if (imagePath.endsWith('.jpg')) return 'image/jpeg'
  throw new Error('Unsupported generated image type')
}

export function registerGeneratedImage(project: KinaouProject, job: ImageJobRecord): KinaouProject {
  if (job.state !== 'succeeded' || !job.imagePath?.startsWith(GENERATED_IMAGE_PREFIX) || typeof job.sizeBytes !== 'number' || job.sizeBytes <= 0) throw new Error('Completed managed image job required')
  const provenance = parseImageGenerationProvenance(job.provenance)
  if (project.assets.some((asset) => asset.uri === job.imagePath)) return project
  return parseProject(touchProject({ ...project, assets: [...project.assets, {
    id: crypto.randomUUID(), kind: 'image', uri: job.imagePath, managed: true, offline: false,
    metadata: {
      name: `Generated image · ${provenance.positivePrompt.slice(0, 60)}`,
      mimeType: mimeTypeFor(job.imagePath),
      sizeBytes: job.sizeBytes,
      generated: true,
      adapterId: provenance.adapterId,
      imageJobId: job.id,
      templateId: provenance.templateId,
      templatePath: job.templatePath,
      seed: provenance.seed,
      width: provenance.width,
      height: provenance.height,
      positivePrompt: provenance.positivePrompt,
      negativePrompt: provenance.negativePrompt,
      generatedAt: job.updatedAt
    }
  }] }))
}
