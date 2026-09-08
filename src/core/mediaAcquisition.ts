import { z } from 'zod'
import type { KinaouProject } from './project'

const baseItem = {
  sceneId: z.string().trim().min(1).max(120),
  rationale: z.string().trim().min(1).max(1000)
}

const webCaptureItemSchema = z.object({
  ...baseItem,
  kind: z.literal('web-capture'),
  url: z.string().trim().min(1).max(2000).superRefine((value, context) => {
    let url: URL
    try { url = new URL(value) } catch { context.addIssue({ code: 'custom', message: 'URL must be absolute.' }); return }
    if (!['http:', 'https:'].includes(url.protocol)) context.addIssue({ code: 'custom', message: 'URL must use http or https.' })
    if (url.username || url.password) context.addIssue({ code: 'custom', message: 'URL must not contain credentials.' })
  })
})

const appCaptureItemSchema = z.object({
  ...baseItem,
  kind: z.literal('app-capture'),
  appName: z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9][^"\\\u0000-\u001f]*$/, 'App name must start alphanumeric and contain no quotes, backslashes or control characters')
})

const generateImageItemSchema = z.object({
  ...baseItem,
  kind: z.literal('generate-image'),
  positivePrompt: z.string().trim().min(1).max(20_000),
  negativePrompt: z.string().trim().max(20_000).optional()
})

export const mediaAcquisitionPlanSchema = z.object({
  schemaVersion: z.literal(1),
  items: z.array(z.discriminatedUnion('kind', [webCaptureItemSchema, appCaptureItemSchema, generateImageItemSchema])).min(1).max(100),
  provenance: z.object({
    kind: z.enum(['manual', 'local-model']),
    adapterId: z.string().trim().min(1).max(160).optional(),
    modelId: z.string().trim().min(1).max(160).optional()
  })
})

export type MediaAcquisitionPlan = z.infer<typeof mediaAcquisitionPlanSchema>
export type MediaAcquisitionItem = MediaAcquisitionPlan['items'][number]

export function parseMediaAcquisitionPlan(value: unknown, project: KinaouProject): MediaAcquisitionPlan {
  const plan = mediaAcquisitionPlanSchema.parse(value)
  const sceneIds = new Set(project.storyboard.map((scene) => scene.id))
  for (const item of plan.items) {
    if (!sceneIds.has(item.sceneId)) throw new Error(`Media plan references an unknown storyboard scene: ${item.sceneId}`)
  }
  return plan
}

export function describeAcquisitionItem(item: MediaAcquisitionItem): string {
  if (item.kind === 'web-capture') return `Capture website ${item.url}`
  if (item.kind === 'app-capture') return `Capture app window "${item.appName}"`
  return `Generate image: ${item.positivePrompt.slice(0, 80)}`
}
