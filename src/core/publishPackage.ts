import { z } from 'zod'
import { exportReceiptSchema, managedRenderPathSchema, type ExportReceipt } from './exportHistory'
import { touchProject, type KinaouProject } from './project'
import { formatProfiles, type TargetFormat } from './render'
import { assertSafeManagedPath } from './storage'
import {
  defaultPublishPlacementForPlatform,
  publishPlacementProfile,
  publishPlacementSchema,
  reviewPublishPlacement,
  type PublishPlacement
} from './publishProfiles'

export const publishTargetSchema = z.enum(['youtube', 'instagram', 'tiktok', 'generic'])
export type PublishTarget = z.infer<typeof publishTargetSchema>

export const publishTargetLabels: Record<PublishTarget, string> = {
  youtube: 'YouTube',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  generic: 'Generic handoff'
}

export const publishFormatDimensions: Record<TargetFormat, { width: number; height: number }> = {
  landscape: { width: formatProfiles.landscape.export.width, height: formatProfiles.landscape.export.height },
  vertical: { width: formatProfiles.vertical.export.width, height: formatProfiles.vertical.export.height },
  square: { width: formatProfiles.square.export.width, height: formatProfiles.square.export.height }
}

export const publishProjectIdSchema = z.string().trim().min(1).max(200)

const publishTagsSchema = z.array(z.string().trim().min(1).max(80)).max(30).refine((tags) => {
  return new Set(tags.map((tag) => tag.toLocaleLowerCase())).size === tags.length
}, 'Publish tags must be unique')

const publishTitleSchema = z.string().trim().min(1).max(200)
const publishDescriptionSchema = z.string().trim().max(5000)

const publishPackageRequestV1Schema = z.object({
  schemaVersion: z.literal(1),
  projectId: publishProjectIdSchema,
  export: exportReceiptSchema,
  platform: publishTargetSchema,
  title: publishTitleSchema,
  description: publishDescriptionSchema,
  tags: publishTagsSchema
})

const publishPackageRequestV2Schema = z.object({
  schemaVersion: z.literal(2),
  projectId: publishProjectIdSchema,
  export: exportReceiptSchema,
  platform: publishTargetSchema,
  placement: publishPlacementSchema,
  title: publishTitleSchema,
  description: publishDescriptionSchema,
  tags: publishTagsSchema
}).strict().superRefine((request, context) => {
  const profile = publishPlacementProfile(request.placement)

  if (profile.platform !== request.platform) {
    context.addIssue({
      code: 'custom',
      path: ['placement'],
      message: 'Publish placement does not belong to the selected platform'
    })
  }

  const review = reviewPublishPlacement(
    request.export,
    request.placement,
    {
      title: request.title,
      description: request.description,
      tags: request.tags
    }
  )

  for (const issue of review.issues) {
    context.addIssue({
      code: 'custom',
      path: ['placement'],
      message: issue.message
    })
  }
})

export const publishPackageRequestSchema = z.union([
  publishPackageRequestV1Schema,
  publishPackageRequestV2Schema
])

export const managedPublishPathSchema = z.string().min(1).max(700).refine((value) => {
  try {
    return assertSafeManagedPath(value) === value && value.startsWith('KINAOU/Renders/') && value.endsWith('.publish.json')
  } catch {
    return false
  }
}, 'Publish package must be a canonical managed JSON file under KINAOU/Renders')

const publishPackageResultV2Schema = z.object({
  schemaVersion: z.literal(2),
  path: managedPublishPathSchema,
  sourcePath: managedRenderPathSchema,
  platform: publishTargetSchema,
  createdAt: z.string().datetime(),
  sizeBytes: z.number().int().positive(),
  sourceSha256: z.string().regex(/^[a-f0-9]{64}$/)
}).strict()

const publishPackageResultV3Schema = z.object({
  schemaVersion: z.literal(3),
  path: managedPublishPathSchema,
  sourcePath: managedRenderPathSchema,
  platform: publishTargetSchema,
  placement: publishPlacementSchema,
  createdAt: z.string().datetime(),
  sizeBytes: z.number().int().positive(),
  sourceSha256: z.string().regex(/^[a-f0-9]{64}$/)
}).strict()

export const publishPackageResultSchema = z.union([
  publishPackageResultV2Schema,
  publishPackageResultV3Schema
])

const publishActualMediaFactsSchema = z.object({
  sizeBytes: z.number().int().positive(),
  durationMs: z.number().int().nonnegative().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  videoCodec: z.string().trim().min(1).max(100).optional(),
  audioCodec: z.string().trim().min(1).max(100).optional()
}).strict()

export const publishPreflightResultSchema = z.object({
  schemaVersion: z.literal(1),
  sourcePath: managedRenderPathSchema,
  checkedAt: z.string().datetime(),
  ready: z.boolean(),
  durationToleranceMs: z.literal(250),
  expected: z.object({
    jobId: z.string().trim().min(1).max(200),
    format: z.enum(['landscape', 'vertical', 'square']),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    durationMs: z.number().int().positive(),
    sizeBytes: z.number().int().nonnegative().optional()
  }).strict(),
  actual: publishActualMediaFactsSchema,
  checks: z.object({
    size: z.boolean(),
    videoStream: z.boolean(),
    dimensions: z.boolean(),
    duration: z.boolean()
  }).strict()
}).strict().superRefine((result, context) => {
  const dimensions = publishFormatDimensions[result.expected.format]
  if (result.expected.width !== dimensions.width || result.expected.height !== dimensions.height) context.addIssue({ code: 'custom', path: ['expected'], message: 'Publish preflight expected dimensions do not match the format' })
  const checks = {
    size: result.expected.sizeBytes === undefined || result.actual.sizeBytes === result.expected.sizeBytes,
    videoStream: Boolean(result.actual.videoCodec),
    dimensions: Boolean(result.actual.videoCodec) && result.actual.width === result.expected.width && result.actual.height === result.expected.height,
    duration: result.actual.durationMs !== undefined && Math.abs(result.actual.durationMs - result.expected.durationMs) <= result.durationToleranceMs
  }
  for (const [key, valid] of Object.entries(checks)) {
    if (result.checks[key as keyof typeof checks] !== valid) context.addIssue({ code: 'custom', path: ['checks', key], message: `Publish preflight ${key} check is inconsistent` })
  }
  if (result.ready !== Object.values(checks).every(Boolean)) context.addIssue({ code: 'custom', path: ['ready'], message: 'Publish preflight readiness is inconsistent with its checks' })
})

const publishPackageBaseSchema = z.object({
  kind: z.literal('kinaou-publish-package'),
  createdAt: z.string().datetime(),
  projectId: publishProjectIdSchema,
  platform: publishTargetSchema,
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000),
  tags: publishTagsSchema,
  media: exportReceiptSchema.extend({ sizeBytes: z.number().int().positive() })
})

const publishPackageDocumentV1Schema = publishPackageBaseSchema.extend({
  schemaVersion: z.literal(1),
}).strict()

export const publishPackageIntegrityFactsSchema = z.object({
  checkedAt: z.string().datetime(),
  actual: publishActualMediaFactsSchema,
  sha256: z.string().regex(/^[a-f0-9]{64}$/)
}).strict().superRefine((facts, context) => {
  if (facts.actual.sizeBytes <= 0) context.addIssue({ code: 'custom', path: ['actual', 'sizeBytes'], message: 'Publish integrity size must be positive' })
})

const publishPackageDocumentV2Schema = publishPackageBaseSchema.extend({
  schemaVersion: z.literal(2),
  integrity: publishPackageIntegrityFactsSchema
}).strict().superRefine((document, context) => {
  if (document.integrity.actual.sizeBytes !== document.media.sizeBytes) context.addIssue({ code: 'custom', path: ['integrity', 'actual', 'sizeBytes'], message: 'Publish integrity size must match the media receipt' })
})

const publishDeliveryReviewSchema = z.object({
  checkedAt: z.string().datetime(),
  ready: z.literal(true),
  preferredFormat: z.enum(['landscape', 'vertical', 'square'])
}).strict()

const publishPackageDocumentV3Schema = publishPackageBaseSchema.extend({
  schemaVersion: z.literal(3),
  placement: publishPlacementSchema,
  delivery: publishDeliveryReviewSchema,
  integrity: publishPackageIntegrityFactsSchema
}).strict().superRefine((document, context) => {
  if (document.integrity.actual.sizeBytes !== document.media.sizeBytes) {
    context.addIssue({
      code: 'custom',
      path: ['integrity', 'actual', 'sizeBytes'],
      message: 'Publish integrity size must match the media receipt'
    })
  }

  const profile = publishPlacementProfile(document.placement)

  if (profile.platform !== document.platform) {
    context.addIssue({
      code: 'custom',
      path: ['placement'],
      message: 'Publish package placement does not belong to its platform'
    })
  }

  const review = reviewPublishPlacement(
    document.media,
    document.placement,
    {
      title: document.title,
      description: document.description,
      tags: document.tags
    }
  )

  if (!review.ready) {
    context.addIssue({
      code: 'custom',
      path: ['delivery'],
      message: 'Publish package delivery review is not ready'
    })
  }

  if (document.delivery.preferredFormat !== review.preferredFormat) {
    context.addIssue({
      code: 'custom',
      path: ['delivery', 'preferredFormat'],
      message: 'Publish package preferred format does not match its placement'
    })
  }
})

export const publishPackageDocumentSchema = z.union([
  publishPackageDocumentV1Schema,
  publishPackageDocumentV2Schema,
  publishPackageDocumentV3Schema
])

export const publishPackageEntrySchema = z.object({
  path: managedPublishPathSchema,
  sizeBytes: z.number().int().positive(),
  modifiedAt: z.string().datetime(),
  sourceAvailable: z.boolean(),
  document: publishPackageDocumentSchema
})

export const publishPackageListSchema = z.array(publishPackageEntrySchema).max(200)

export const publishIntegrityRequestSchema = z.object({ path: managedPublishPathSchema }).strict()

export const publishIntegrityResultSchema = z.object({
  schemaVersion: z.literal(1),
  packagePath: managedPublishPathSchema,
  sourcePath: managedRenderPathSchema,
  checkedAt: z.string().datetime(),
  status: z.enum(['unchanged', 'modified', 'missing', 'unverifiable']),
  expectedSha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  actualSha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  sizeBytes: z.number().int().positive().optional()
}).strict().superRefine((result, context) => {
  if (result.status === 'unchanged') {
    if (!result.expectedSha256 || result.actualSha256 !== result.expectedSha256 || !result.sizeBytes) context.addIssue({ code: 'custom', message: 'Unchanged publish integrity result is incomplete or inconsistent' })
  } else if (result.status === 'modified') {
    if (!result.expectedSha256 || !result.sizeBytes || (result.actualSha256 && result.actualSha256 === result.expectedSha256)) context.addIssue({ code: 'custom', message: 'Modified publish integrity result is incomplete or inconsistent' })
  } else if (result.status === 'missing') {
    if (result.actualSha256 || result.sizeBytes) context.addIssue({ code: 'custom', message: 'Missing publish integrity result cannot include current file facts' })
  } else if (result.expectedSha256 || result.actualSha256 || result.sizeBytes) {
    context.addIssue({ code: 'custom', message: 'Legacy publish package cannot include integrity facts' })
  }
})

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
export type PublishPreflightResult = z.infer<typeof publishPreflightResultSchema>
export type PublishPackageDocument = z.infer<typeof publishPackageDocumentSchema>
export type PublishPackageEntry = z.infer<typeof publishPackageEntrySchema>
export type PublishIntegrityResult = z.infer<typeof publishIntegrityResultSchema>
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

export function buildPublishPackageRequest(
  project: KinaouProject,
  receipt: ExportReceipt,
  input: {
    platform: PublishTarget
    placement?: PublishPlacement
    title: string
    description: string
    tags: string
  }
): PublishPackageRequest {
  const placement =
    input.placement
    ?? defaultPublishPlacementForPlatform(
      input.platform,
      receipt.format
    )

  return publishPackageRequestSchema.parse({
    schemaVersion: 2,
    projectId: project.id,
    export: receipt,
    platform: input.platform,
    placement,
    title: input.title,
    description: input.description,
    tags: parsePublishTags(input.tags)
  })
}

export function parsePublishPreflightResult(value: unknown, receipt: ExportReceipt): PublishPreflightResult {
  const expectedReceipt = exportReceiptSchema.parse(receipt)
  const result = publishPreflightResultSchema.parse(value)
  if (result.sourcePath !== expectedReceipt.outputRelativePath || result.expected.jobId !== expectedReceipt.jobId || result.expected.format !== expectedReceipt.format || result.expected.durationMs !== expectedReceipt.durationMs || result.expected.sizeBytes !== expectedReceipt.sizeBytes) throw new Error('Publish preflight does not match the selected export receipt')
  return result
}

export function publishPreflightMatchesReceipt(preflight: PublishPreflightResult | null, receipt: ExportReceipt | undefined): preflight is PublishPreflightResult {
  return Boolean(preflight && receipt && preflight.sourcePath === receipt.outputRelativePath && preflight.expected.jobId === receipt.jobId && preflight.expected.format === receipt.format && preflight.expected.durationMs === receipt.durationMs && preflight.expected.sizeBytes === receipt.sizeBytes)
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
