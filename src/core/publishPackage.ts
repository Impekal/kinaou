import { z } from 'zod'
import { exportReceiptSchema, managedRenderPathSchema, type ExportReceipt } from './exportHistory'
import { touchProject, type KinaouProject } from './project'
import { assertSafeManagedPath } from './storage'

export const publishTargetSchema = z.enum(['youtube', 'instagram', 'tiktok', 'generic'])
export type PublishTarget = z.infer<typeof publishTargetSchema>

export const publishTargetLabels: Record<PublishTarget, string> = {
  youtube: 'YouTube',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  generic: 'Generic handoff'
}

export const publishProjectIdSchema = z.string().trim().min(1).max(200)

const publishTagsSchema = z.array(z.string().trim().min(1).max(80)).max(30).refine((tags) => {
  return new Set(tags.map((tag) => tag.toLocaleLowerCase())).size === tags.length
}, 'Publish tags must be unique')

const publishTitleSchema = z.string().trim().min(1).max(200)
const publishDescriptionSchema = z.string().trim().max(5000)

export const publishPackageRequestSchema = z.object({
  schemaVersion: z.literal(1),
  projectId: publishProjectIdSchema,
  export: exportReceiptSchema,
  platform: publishTargetSchema,
  title: publishTitleSchema,
  description: publishDescriptionSchema,
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

export const publishPackageDocumentSchema = z.object({
  schemaVersion: z.literal(1),
  kind: z.literal('kinaou-publish-package'),
  createdAt: z.string().datetime(),
  projectId: publishProjectIdSchema,
  platform: publishTargetSchema,
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000),
  tags: publishTagsSchema,
  media: exportReceiptSchema.extend({ sizeBytes: z.number().int().positive() })
})

export const publishPackageEntrySchema = z.object({
  path: managedPublishPathSchema,
  sizeBytes: z.number().int().positive(),
  modifiedAt: z.string().datetime(),
  sourceAvailable: z.boolean(),
  document: publishPackageDocumentSchema
})

export const publishPackageListSchema = z.array(publishPackageEntrySchema).max(200)

export const projectPublishDefaultsSchema = z.object({
  schemaVersion: z.literal(1),
  platform: publishTargetSchema,
  title: publishTitleSchema,
  description: publishDescriptionSchema,
  tags: publishTagsSchema,
  updatedAt: z.string().datetime()
})

export type PublishPackageRequest = z.infer<typeof publishPackageRequestSchema>
export type PublishPackageResult = z.infer<typeof publishPackageResultSchema>
export type PublishPackageDocument = z.infer<typeof publishPackageDocumentSchema>
export type PublishPackageEntry = z.infer<typeof publishPackageEntrySchema>
export type ProjectPublishDefaults = z.infer<typeof projectPublishDefaultsSchema>

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

export function projectPublishDefaults(project: KinaouProject): ProjectPublishDefaults | null {
  const parsed = projectPublishDefaultsSchema.safeParse(project.metadata.publishDefaults)
  return parsed.success ? parsed.data : null
}

export function saveProjectPublishDefaults(project: KinaouProject, input: { platform: PublishTarget; title: string; description: string; tags: string }, now = new Date()): KinaouProject {
  const normalized = {
    platform: publishTargetSchema.parse(input.platform),
    title: publishTitleSchema.parse(input.title),
    description: publishDescriptionSchema.parse(input.description),
    tags: parsePublishTags(input.tags)
  }
  const current = projectPublishDefaults(project)
  if (current && current.platform === normalized.platform && current.title === normalized.title && current.description === normalized.description && current.tags.length === normalized.tags.length && current.tags.every((tag, index) => tag === normalized.tags[index])) return project
  const publishDefaults = projectPublishDefaultsSchema.parse({ schemaVersion: 1, ...normalized, updatedAt: now.toISOString() })
  return touchProject({ ...project, metadata: { ...project.metadata, publishDefaults } }, now)
}

export function clearProjectPublishDefaults(project: KinaouProject, now = new Date()): KinaouProject {
  if (!Object.prototype.hasOwnProperty.call(project.metadata, 'publishDefaults')) return project
  const metadata = { ...project.metadata }
  delete metadata.publishDefaults
  return touchProject({ ...project, metadata }, now)
}
