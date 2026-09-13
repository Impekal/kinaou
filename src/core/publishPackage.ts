import { z } from 'zod'
import { exportReceiptSchema, managedRenderPathSchema, type ExportReceipt } from './exportHistory'
import type { KinaouProject } from './project'
import { assertSafeManagedPath } from './storage'

export const publishTargetSchema = z.enum(['youtube', 'instagram', 'tiktok', 'generic'])
export type PublishTarget = z.infer<typeof publishTargetSchema>

export const publishTargetLabels: Record<PublishTarget, string> = {
  youtube: 'YouTube',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  generic: 'Generic handoff'
}

const publishTagsSchema = z.array(z.string().trim().min(1).max(80)).max(30).refine((tags) => {
  return new Set(tags.map((tag) => tag.toLocaleLowerCase())).size === tags.length
}, 'Publish tags must be unique')

export const publishPackageRequestSchema = z.object({
  schemaVersion: z.literal(1),
  projectId: z.string().trim().min(1).max(200),
  export: exportReceiptSchema,
  platform: publishTargetSchema,
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000),
  tags: publishTagsSchema
})

const managedPublishPathSchema = z.string().min(1).max(700).refine((value) => {
  try {
    return assertSafeManagedPath(value) === value && value.startsWith('KINAOU/Renders/') && value.endsWith('.publish.json')
  } catch {
    return false
  }
}, 'Publish package must be a canonical managed JSON file under KINAOU/Renders')

export const publishPackageResultSchema = z.object({
  path: managedPublishPathSchema,
  sourcePath: managedRenderPathSchema,
  platform: publishTargetSchema,
  createdAt: z.string().datetime(),
  sizeBytes: z.number().int().positive()
})

export type PublishPackageRequest = z.infer<typeof publishPackageRequestSchema>
export type PublishPackageResult = z.infer<typeof publishPackageResultSchema>

export function parsePublishTags(input: string): string[] {
  const tags: string[] = []
  const seen = new Set<string>()
  for (const raw of input.split(/[\n,]/)) {
    const tag = raw.trim().replace(/^#+/, '').trim()
    if (!tag) continue
    const key = tag.toLocaleLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    tags.push(tag)
  }
  return publishTagsSchema.parse(tags)
}

export function buildPublishPackageRequest(project: KinaouProject, receipt: ExportReceipt, input: { platform: PublishTarget; title: string; description: string; tags: string }): PublishPackageRequest {
  return publishPackageRequestSchema.parse({
    schemaVersion: 1,
    projectId: project.id,
    export: receipt,
    platform: input.platform,
    title: input.title,
    description: input.description,
    tags: parsePublishTags(input.tags)
  })
}
