import type { ComfyTemplateDescriptor, ImageJobParameters } from './imageJobs'
export interface ImageDraft { positivePrompt: string; negativePrompt: string; seed: string; width: string; height: string }
export type ImageDraftIssue = 'template' | 'prompt' | 'negative' | 'unsupportedNegative' | 'seed' | 'dimensions'
export function reviewImageDraft(template: ComfyTemplateDescriptor | null, draft: ImageDraft): { parameters?: ImageJobParameters; issue?: ImageDraftIssue } {
  if (!template || template.mediaType !== 'image') return { issue: 'template' }
  const positivePrompt = draft.positivePrompt.trim(), negativePrompt = draft.negativePrompt.trim()
  if (!positivePrompt || positivePrompt.length > 20000) return { issue: 'prompt' }
  if (negativePrompt.length > 20000) return { issue: 'negative' }
  if (negativePrompt && !template.supportsNegativePrompt) return { issue: 'unsupportedNegative' }
  const seed = Number(draft.seed), width = Number(draft.width), height = Number(draft.height)
  if (!/^\d+$/.test(draft.seed.trim()) || !Number.isSafeInteger(seed) || seed < 0) return { issue: 'seed' }
  const dimension = (value: number) => Number.isInteger(value) && value >= 64 && value <= 4096 && value % 8 === 0
  if ((template.supportsWidth && !dimension(width)) || (template.supportsHeight && !dimension(height))) return { issue: 'dimensions' }
  return { parameters: { templatePath: template.path, positivePrompt, ...(negativePrompt ? { negativePrompt } : {}), seed, ...(template.supportsWidth ? { width } : {}), ...(template.supportsHeight ? { height } : {}) } }
}
