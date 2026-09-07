export type ImageJobState = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'

export interface ImageGenerationProvenance {
  kind: 'local-model'
  adapterId: 'comfyui'
  templateId: string
  seed: number
  width: number | null
  height: number | null
  positivePrompt: string
  negativePrompt: string
}

export interface ImageJobRecord {
  id: string
  state: ImageJobState
  progress: number
  createdAt: string
  updatedAt: string
  templatePath: string
  provenance: ImageGenerationProvenance
  imagePath?: string
  sizeBytes?: number
  error?: string
}

export interface ComfyTemplateDescriptor {
  path: string
  id: string
  label: string
  supportsNegativePrompt: boolean
  supportsWidth: boolean
  supportsHeight: boolean
}

export interface ImageGenerationAvailability {
  comfyui: { available: boolean; version?: string }
  templates: ComfyTemplateDescriptor[]
}

export interface ImageJobParameters {
  templatePath: string
  positivePrompt: string
  negativePrompt?: string
  seed: number
  width?: number
  height?: number
}

const TEMPLATE_PREFIX = 'KINAOU/Models/ComfyUI/Workflows/'
const GENERATED_IMAGE_PREFIX = 'KINAOU/Assets/GeneratedImages/'

export function parseImageGenerationProvenance(value: unknown): ImageGenerationProvenance {
  if (!value || typeof value !== 'object') throw new Error('Invalid image generation provenance')
  const provenance = value as Partial<ImageGenerationProvenance>
  if (provenance.kind !== 'local-model' || provenance.adapterId !== 'comfyui' || typeof provenance.templateId !== 'string' || !provenance.templateId) throw new Error('Invalid image generation provenance identity')
  if (!Number.isSafeInteger(provenance.seed) || (provenance.seed as number) < 0) throw new Error('Invalid image generation provenance seed')
  for (const dimension of [provenance.width, provenance.height]) if (dimension !== null && !Number.isInteger(dimension)) throw new Error('Invalid image generation provenance dimensions')
  if (typeof provenance.positivePrompt !== 'string' || !provenance.positivePrompt.trim() || typeof provenance.negativePrompt !== 'string') throw new Error('Invalid image generation provenance prompts')
  return provenance as ImageGenerationProvenance
}

export function parseImageJob(value: unknown): ImageJobRecord {
  if (!value || typeof value !== 'object') throw new Error('Invalid image job response')
  const job = value as Partial<ImageJobRecord>
  if (typeof job.id !== 'string' || !['queued', 'running', 'succeeded', 'failed', 'cancelled'].includes(String(job.state))) throw new Error('Invalid image job identity or state')
  if (typeof job.progress !== 'number' || job.progress < 0 || job.progress > 1 || typeof job.createdAt !== 'string' || typeof job.updatedAt !== 'string') throw new Error('Invalid image job progress or timestamps')
  if (typeof job.templatePath !== 'string' || !job.templatePath.startsWith(TEMPLATE_PREFIX)) throw new Error('Invalid image job template path')
  parseImageGenerationProvenance(job.provenance)
  if (job.state === 'succeeded' && (!job.imagePath?.startsWith(GENERATED_IMAGE_PREFIX) || typeof job.sizeBytes !== 'number' || job.sizeBytes <= 0)) throw new Error('Invalid completed image result')
  return job as ImageJobRecord
}

export function parseImageGenerationAvailability(value: unknown): ImageGenerationAvailability {
  if (!value || typeof value !== 'object') throw new Error('Invalid image generation availability response')
  const payload = value as { comfyui?: unknown; templates?: unknown }
  const comfyui = payload.comfyui as Partial<{ available: boolean; version: string }>
  if (!comfyui || typeof comfyui !== 'object' || typeof comfyui.available !== 'boolean' || (comfyui.version !== undefined && typeof comfyui.version !== 'string')) throw new Error('Invalid ComfyUI availability')
  if (!Array.isArray(payload.templates)) throw new Error('Invalid ComfyUI template list')
  const templates = payload.templates.map((entry) => {
    const template = entry as Partial<ComfyTemplateDescriptor>
    if (typeof template?.path !== 'string' || !template.path.startsWith(TEMPLATE_PREFIX)) throw new Error('Invalid ComfyUI template path')
    if (typeof template.id !== 'string' || !template.id || typeof template.label !== 'string' || !template.label) throw new Error('Invalid ComfyUI template identity')
    if (![template.supportsNegativePrompt, template.supportsWidth, template.supportsHeight].every((flag) => typeof flag === 'boolean')) throw new Error('Invalid ComfyUI template capability flags')
    return template as ComfyTemplateDescriptor
  })
  return { comfyui: { available: comfyui.available, ...(comfyui.version ? { version: comfyui.version } : {}) }, templates }
}
