import type { ComfyTemplateDescriptor, ImageJobParameters } from './imageJobs'
import { reviewImageDraft, type ImageDraft, type ImageDraftIssue } from './imageStudioDraft'
import { buildGenerationReferences, referenceAssetAvailable, type ReferenceRole } from './generationReferences'
import type { KinaouProject } from './project'
export type VideoDraftIssue = ImageDraftIssue | 'referenceMissing' | 'referencePermission' | 'referenceSize'
export function reviewVideoDraft(template: ComfyTemplateDescriptor | null, draft: ImageDraft, project: KinaouProject, selected: Partial<Record<ReferenceRole, string>>, authorized: Partial<Record<ReferenceRole, boolean>>): { parameters?: ImageJobParameters; issue?: VideoDraftIssue } {
  if (!template || template.mediaType !== 'video') return { issue: 'template' }
  // Prompt/seed/dimension constraints are identical for both ComfyUI media types.
  const review = reviewImageDraft({ ...template, mediaType: 'image' }, draft)
  if (!review.parameters) return review
  const roles = template.referenceRoles ?? []
  for (const role of roles) {
    const asset = project.assets.find(entry => entry.id === selected[role])
    if (!asset || !referenceAssetAvailable(asset, role)) return { issue: 'referenceMissing' }
    if (authorized[role] !== true) return { issue: 'referencePermission' }
    if (typeof asset.metadata.sizeBytes === 'number' && asset.metadata.sizeBytes > 32 * 1024 * 1024) return { issue: 'referenceSize' }
  }
  return { parameters: { ...review.parameters, ...(roles.length ? { references: buildGenerationReferences(project, roles, selected, authorized) } : {}) } }
}

