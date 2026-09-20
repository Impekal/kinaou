import { z } from 'zod'
import { validateAudioDucking, type AudioDuckingSettings } from './audioDucking'
import { validateLoudnessNormalization, type LoudnessNormalizationSettings } from './audioLoudness'
import { managedRenderPathSchema } from './exportHistory'
import { createRenderPlan, formatProfiles, projectFormatPreset, type RenderPlan, type TargetFormat } from './render'
import type { RenderJobState } from './renderJobs'
import { createRangeRenderPlan } from './renderRange'
import { shortExportVariant, type ShortExportBatchItem, type ShortExportCandidate } from './shortExportRanges'
import { touchProject, type KinaouProject } from './project'
import { renderOutputPath } from './renderUi'

export interface ShortBatchRenderItem extends ShortExportBatchItem {
  state: RenderJobState
  progress: number
  jobId?: string
  createdAt?: string
  updatedAt?: string
  sizeBytes?: number
  renderedPath?: string
  error?: string
}

const renderPresetSchema = z.object({
  name: z.string().trim().min(1).max(200),
  container: z.literal('mp4'),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fps: z.number().positive(),
  videoCodec: z.enum(['h264', 'hevc']),
  audioCodec: z.literal('aac'),
  fit: z.enum(['contain', 'cover']).optional(),
  focusX: z.number().min(0).max(1).optional(),
  focusY: z.number().min(0).max(1).optional()
}).strict().superRefine((preset, context) => {
  if ((preset.focusX !== undefined || preset.focusY !== undefined) && preset.fit !== 'cover') context.addIssue({ code: 'custom', message: 'Persisted Short batch focus requires cover fit' })
})

const audioDuckingSchema = z.object({
  enabled: z.boolean(),
  reductionDb: z.number().min(0).max(40),
  attackMs: z.number().int().min(0).max(5000),
  releaseMs: z.number().int().min(0).max(5000)
}).strict()

const loudnessNormalizationSchema = z.object({
  enabled: z.boolean(),
  targetLufs: z.number().min(-70).max(-5),
  truePeakDb: z.number().min(-9).max(0),
  loudnessRange: z.number().min(1).max(50)
}).strict()

export const persistedShortBatchItemSchema = z.object({
  id: z.string().trim().min(1).max(500),
  title: z.string().trim().min(1).max(240),
  sceneIds: z.array(z.string().trim().min(1).max(200)).max(100),
  format: z.enum(['landscape', 'vertical', 'square']),
  inMs: z.number().int().nonnegative(),
  outMs: z.number().int().positive(),
  durationMs: z.number().int().positive(),
  outputPath: managedRenderPathSchema,
  state: z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled']),
  progress: z.number().min(0).max(1),
  jobId: z.string().trim().min(1).max(200).optional(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
  sizeBytes: z.number().int().positive().optional(),
  renderedPath: managedRenderPathSchema.optional(),
  error: z.string().trim().min(1).max(2000).optional(),
  preset: renderPresetSchema,
  planSignature: z.string().regex(/^[a-f0-9]{16}$/),
  candidateId: z.string().trim().min(1).max(500).optional(),
  attempt: z.number().int().min(1).max(100).optional(),
  retryOfId: z.string().trim().min(1).max(500).optional()
}).strict().superRefine((item, context) => {
  if (item.outMs <= item.inMs || item.durationMs !== item.outMs - item.inMs) context.addIssue({ code: 'custom', path: ['durationMs'], message: 'Persisted Short batch range is inconsistent' })
  if (new Set(item.sceneIds).size !== item.sceneIds.length) context.addIssue({ code: 'custom', path: ['sceneIds'], message: 'Persisted Short batch scene ids must be unique' })
  if ((item.state === 'running' || item.state === 'succeeded') && !item.jobId) context.addIssue({ code: 'custom', path: ['jobId'], message: 'Persisted active or successful Short batch item requires a job id' })
  if (item.jobId && (!item.createdAt || !item.updatedAt)) context.addIssue({ code: 'custom', path: ['updatedAt'], message: 'Persisted submitted Short batch item requires worker timestamps' })
  if (item.state === 'succeeded' && (item.progress !== 1 || !item.renderedPath || !item.sizeBytes)) context.addIssue({ code: 'custom', path: ['state'], message: 'Persisted successful Short batch item requires a complete terminal receipt' })
  if (item.renderedPath && item.renderedPath !== item.outputPath) context.addIssue({ code: 'custom', path: ['renderedPath'], message: 'Persisted Short batch result path must match its planned path' })
  if ((item.attempt ?? 1) > 1 && !item.retryOfId) context.addIssue({ code: 'custom', path: ['retryOfId'], message: 'Persisted Short batch retry must name the previous attempt' })
  if ((item.attempt ?? 1) > 1 && !item.candidateId) context.addIssue({ code: 'custom', path: ['candidateId'], message: 'Persisted Short batch retry must retain its candidate identity' })
  if ((item.attempt ?? 1) === 1 && item.retryOfId) context.addIssue({ code: 'custom', path: ['retryOfId'], message: 'A first Short batch attempt cannot retry another item' })
  if (item.retryOfId === item.id) context.addIssue({ code: 'custom', path: ['retryOfId'], message: 'Persisted Short batch retry cannot reference itself' })
})

export const persistedShortBatchSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  audioDucking: audioDuckingSchema,
  loudnessNormalization: loudnessNormalizationSchema,
  items: z.array(persistedShortBatchItemSchema).min(1).max(100)
}).strict().superRefine((batch, context) => {
  if (new Set(batch.items.map((item) => item.id)).size !== batch.items.length) context.addIssue({ code: 'custom', path: ['items'], message: 'Persisted Short batch item ids must be unique' })
  if (new Set(batch.items.map((item) => item.outputPath)).size !== batch.items.length) context.addIssue({ code: 'custom', path: ['items'], message: 'Persisted Short batch outputs must be unique' })
  batch.items.forEach((item, index) => {
    if (!item.retryOfId) return
    const previousIndex = batch.items.findIndex((candidate) => candidate.id === item.retryOfId)
    const previous = batch.items[previousIndex]
    if (!previous || previousIndex >= index) {
      context.addIssue({ code: 'custom', path: ['items', index, 'retryOfId'], message: 'Persisted Short batch retry must reference an earlier attempt' })
      return
    }
    if (itemCandidateId(previous) !== itemCandidateId(item) || previous.format !== item.format || itemAttempt(item) !== itemAttempt(previous) + 1) context.addIssue({ code: 'custom', path: ['items', index, 'retryOfId'], message: 'Persisted Short batch retry lineage is inconsistent' })
  })
})

export const shortBatchArchiveLimit = 10

export const persistedShortBatchArchiveItemSchema = z.object({
  id: z.string().trim().min(1).max(500),
  candidateId: z.string().trim().min(1).max(500),
  title: z.string().trim().min(1).max(240),
  format: z.enum(['landscape', 'vertical', 'square']),
  inMs: z.number().int().nonnegative(),
  outMs: z.number().int().positive(),
  durationMs: z.number().int().positive(),
  outputPath: managedRenderPathSchema,
  state: z.enum(['succeeded', 'failed', 'cancelled']),
  attempt: z.number().int().min(1).max(100),
  sizeBytes: z.number().int().positive().optional()
}).strict().superRefine((item, context) => {
  if (item.outMs <= item.inMs || item.durationMs !== item.outMs - item.inMs) context.addIssue({ code: 'custom', path: ['durationMs'], message: 'Archived Short batch range is inconsistent' })
  if (item.state !== 'succeeded' && item.sizeBytes !== undefined) context.addIssue({ code: 'custom', path: ['sizeBytes'], message: 'Only a successful archived Short attempt can retain an output size' })
  if (item.state === 'succeeded' && item.sizeBytes === undefined) context.addIssue({ code: 'custom', path: ['sizeBytes'], message: 'A successful archived Short attempt must retain its output size' })
})

export const persistedShortBatchArchiveEntrySchema = z.object({
  schemaVersion: z.literal(1),
  batchId: z.string().uuid(),
  createdAt: z.string().datetime(),
  completedAt: z.string().datetime(),
  archivedAt: z.string().datetime(),
  items: z.array(persistedShortBatchArchiveItemSchema).min(1).max(100)
}).strict().superRefine((entry, context) => {
  if (new Set(entry.items.map((item) => item.id)).size !== entry.items.length) context.addIssue({ code: 'custom', path: ['items'], message: 'Archived Short batch item ids must be unique' })
  if (new Set(entry.items.map((item) => item.outputPath)).size !== entry.items.length) context.addIssue({ code: 'custom', path: ['items'], message: 'Archived Short batch output paths must be unique' })
})

export const persistedShortBatchArchiveSchema = z.array(persistedShortBatchArchiveEntrySchema).max(shortBatchArchiveLimit).superRefine((entries, context) => {
  if (new Set(entries.map((entry) => entry.batchId)).size !== entries.length) context.addIssue({ code: 'custom', message: 'Archived Short batch ids must be unique' })
})

export type PersistedShortBatchItem = z.infer<typeof persistedShortBatchItemSchema>
export type PersistedShortBatch = z.infer<typeof persistedShortBatchSchema>
export type PersistedShortBatchArchiveEntry = z.infer<typeof persistedShortBatchArchiveEntrySchema>
export interface SelectiveShortBatchRetryResult { batch: PersistedShortBatch; plans: Map<string, RenderPlan> }
export interface ArchivedShortBatchSelectionReview {
  candidateIds: string[]
  formats: TargetFormat[]
  unavailable: Array<{ candidateId: string; title: string }>
}

export const shortBatchTerminalStates = new Set<RenderJobState>(['succeeded', 'failed', 'cancelled'])

export function shortBatchBusy(items: ShortBatchRenderItem[]): boolean {
  return items.some((item) => !shortBatchTerminalStates.has(item.state))
}

export function nextShortBatchItem<T extends ShortBatchRenderItem>(items: T[]): T | undefined {
  if (items.some((item) => item.jobId && !shortBatchTerminalStates.has(item.state))) return undefined
  return items.find((item) => item.state === 'queued' && !item.jobId)
}

export function cancelPendingShortBatchItems<T extends ShortBatchRenderItem>(items: T[]): T[] {
  return items.map((item) => item.state === 'queued' && !item.jobId ? { ...item, state: 'cancelled' } : item) as T[]
}

export function requeueMissingShortBatchJob<T extends ShortBatchRenderItem>(items: T[], itemId: string): T[] {
  return items.map((item) => {
    if (item.id !== itemId || !item.jobId || shortBatchTerminalStates.has(item.state)) return item
    const { jobId: _jobId, createdAt: _createdAt, updatedAt: _updatedAt, error: _error, ...queued } = item
    return { ...queued, state: 'queued', progress: 0 } as T
  })
}

export function failMissingShortBatchJob<T extends ShortBatchRenderItem>(items: T[], itemId: string, error: string): T[] {
  const message = error.trim()
  if (!message || message.length > 2000) throw new Error('Interrupted Short batch error must contain at most 2000 characters.')
  return items.map((item) => item.id === itemId && item.jobId && !shortBatchTerminalStates.has(item.state) ? { ...item, state: 'failed', error: message } : item) as T[]
}

function canonicalJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJsonValue)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => [key, canonicalJsonValue(entry)]))
}

export function shortBatchPlanSignature(plan: RenderPlan): string {
  const serialized = JSON.stringify(canonicalJsonValue({
    purpose: plan.purpose,
    projectId: plan.projectId,
    outputRelativePath: plan.outputRelativePath,
    preset: plan.preset,
    durationMs: plan.durationMs,
    requiredCapabilities: plan.requiredCapabilities,
    clips: plan.clips,
    audioDucking: plan.audioDucking,
    loudnessNormalization: plan.loudnessNormalization
  }))
  let left = 0x811c9dc5
  let right = 0x9e3779b9
  for (let index = 0; index < serialized.length; index += 1) {
    const value = serialized.charCodeAt(index)
    left = Math.imul(left ^ value, 0x01000193)
    right = Math.imul(right ^ value, 0x85ebca6b)
  }
  return `${(left >>> 0).toString(16).padStart(8, '0')}${(right >>> 0).toString(16).padStart(8, '0')}`
}

function itemCandidateId(item: Pick<PersistedShortBatchItem, 'id' | 'format' | 'sceneIds' | 'candidateId'>): string {
  if (item.candidateId) return item.candidateId
  const suffix = `:${item.format}`
  return item.id.endsWith(suffix) ? item.id.slice(0, -suffix.length) : item.sceneIds.join('--')
}

function itemAttempt(item: Pick<PersistedShortBatchItem, 'attempt'>): number {
  return item.attempt ?? 1
}

function preparePersistedShortBatchItems(items: ShortBatchRenderItem[], plans: Map<string, RenderPlan>) {
  if (!items.length || items.length > 100) throw new Error('A durable Short batch must contain between 1 and 100 outputs.')
  if (items.some((item) => item.state !== 'queued' || item.jobId)) throw new Error('A new durable Short batch must start with unsubmitted queued outputs.')
  const firstPlan = plans.get(items[0].id)
  if (!firstPlan) throw new Error('The first Short batch render plan is missing.')
  if (!firstPlan.audioDucking || !firstPlan.loudnessNormalization) throw new Error('Durable Short batch render plans require explicit audio settings.')
  const audioDucking = validateAudioDucking(firstPlan.audioDucking)
  const loudnessNormalization = validateLoudnessNormalization(firstPlan.loudnessNormalization)
  const durableItems = items.map((item) => {
    const plan = plans.get(item.id)
    if (!plan) throw new Error(`The render plan for ${item.title} is missing.`)
    const format = formatProfiles[item.format].export
    if (plan.purpose !== 'export' || plan.outputRelativePath !== item.outputPath || plan.durationMs !== item.durationMs || plan.preset.width !== format.width || plan.preset.height !== format.height) throw new Error(`The render plan for ${item.title} does not match its reviewed range, format or output.`)
    if (JSON.stringify(plan.audioDucking) !== JSON.stringify(audioDucking) || JSON.stringify(plan.loudnessNormalization) !== JSON.stringify(loudnessNormalization)) throw new Error('Every output in a durable Short batch must share its audio settings.')
    const recovery = item as ShortBatchRenderItem & { candidateId?: string; attempt?: number; retryOfId?: string }
    const candidateId = recovery.candidateId ?? (() => {
      const suffix = `:${item.format}`
      if (!item.id.endsWith(suffix)) throw new Error(`The Short batch identity for ${item.title} does not match its format.`)
      return item.id.slice(0, -suffix.length)
    })()
    return { ...item, candidateId, attempt: recovery.attempt ?? 1, ...(recovery.retryOfId ? { retryOfId: recovery.retryOfId } : {}), preset: plan.preset, planSignature: shortBatchPlanSignature(plan) }
  })
  return { audioDucking, loudnessNormalization, durableItems }
}

export function createPersistedShortBatch(items: ShortBatchRenderItem[], plans: Map<string, RenderPlan>, now = new Date(), id: string = crypto.randomUUID()): PersistedShortBatch {
  const { audioDucking, loudnessNormalization, durableItems } = preparePersistedShortBatchItems(items, plans)
  const timestamp = now.toISOString()
  return persistedShortBatchSchema.parse({ schemaVersion: 1, id, createdAt: timestamp, updatedAt: timestamp, audioDucking, loudnessNormalization, items: durableItems })
}

export function retryableShortBatchItems(batch: PersistedShortBatch): PersistedShortBatchItem[] {
  const normalized = persistedShortBatchSchema.parse(batch)
  const latestByVariant = new Map<string, PersistedShortBatchItem>()
  for (const item of normalized.items) latestByVariant.set(`${itemCandidateId(item)}\u0000${item.format}`, item)
  return normalized.items.filter((item) => latestByVariant.get(`${itemCandidateId(item)}\u0000${item.format}`)?.id === item.id && (item.state === 'failed' || item.state === 'cancelled'))
}

export function planSelectiveShortBatchRetry(project: KinaouProject, batch: PersistedShortBatch, candidates: ShortExportCandidate[], selectedItemIds: string[], settings: { audioDucking: AudioDuckingSettings; loudnessNormalization: LoudnessNormalizationSettings }, now = new Date()): SelectiveShortBatchRetryResult {
  const normalized = persistedShortBatchSchema.parse(batch)
  if (shortBatchBusy(normalized.items)) throw new Error('Wait for the current Short batch to finish or cancel it before retrying variants.')
  const selected = new Set(selectedItemIds)
  if (!selected.size) throw new Error('Select at least one failed or cancelled Short variant to retry.')
  if (selected.size !== selectedItemIds.length) throw new Error('Each Short variant can be selected for retry only once.')
  const retryable = retryableShortBatchItems(normalized)
  const retryableById = new Map(retryable.map((item) => [item.id, item]))
  const unknown = [...selected].find((id) => !retryableById.has(id))
  if (unknown) throw new Error('A selected Short variant is not the latest failed or cancelled attempt.')
  if (normalized.items.length + selected.size > 100) throw new Error('The saved Short batch cannot exceed 100 attempts. Discard it after reviewing the retained results, then prepare a new batch.')
  const audioDucking = validateAudioDucking(settings.audioDucking)
  const loudnessNormalization = validateLoudnessNormalization(settings.loudnessNormalization)
  const plans = new Map<string, RenderPlan>()
  const retryItems: Array<ShortBatchRenderItem & { candidateId: string; attempt: number; retryOfId: string }> = []
  const existingPaths = new Set(normalized.items.map((item) => item.outputPath))
  const existingIds = new Set(normalized.items.map((item) => item.id))
  for (const previous of retryable.filter((item) => selected.has(item.id))) {
    const candidateId = itemCandidateId(previous)
    const candidate = candidates.find((item) => item.id === candidateId)
    if (!candidate || candidate.inMs !== previous.inMs || candidate.outMs !== previous.outMs || JSON.stringify(candidate.sceneIds) !== JSON.stringify(previous.sceneIds)) throw new Error(`Cannot retry “${previous.title}” because its reviewed scene range changed. Review and prepare a new batch instead.`)
    const attempt = Math.max(...normalized.items.filter((item) => itemCandidateId(item) === candidateId && item.format === previous.format).map(itemAttempt)) + 1
    const id = `${candidate.id}:${previous.format}:retry-${attempt}`
    if (existingIds.has(id)) throw new Error(`A retry identity already exists for “${previous.title}”.`)
    const outputPath = renderOutputPath(project, now, `${previous.format}-${shortExportVariant(candidate)}-retry-${attempt}`)
    if (existingPaths.has(outputPath)) throw new Error(`A retry output identity already exists for “${previous.title}”.`)
    const item = { id, title: previous.title, sceneIds: [...candidate.sceneIds], format: previous.format, inMs: candidate.inMs, outMs: candidate.outMs, durationMs: candidate.durationMs, outputPath, state: 'queued' as const, progress: 0, candidateId, attempt, retryOfId: previous.id }
    const fullPlan = createRenderPlan(project, projectFormatPreset(project, item.format, 'export'), item.outputPath, { audioDucking, loudnessNormalization })
    plans.set(item.id, createRangeRenderPlan(fullPlan, { inMs: item.inMs, outMs: item.outMs }, item.outputPath))
    retryItems.push(item)
  }
  const retries = preparePersistedShortBatchItems(retryItems, plans)
  const updated = persistedShortBatchSchema.parse({ ...normalized, updatedAt: now.toISOString(), audioDucking, loudnessNormalization, items: [...normalized.items, ...retries.durableItems] })
  return { batch: updated, plans }
}

export function projectPersistedShortBatch(project: KinaouProject): PersistedShortBatch | null {
  const parsed = persistedShortBatchSchema.safeParse(project.metadata.shortExportBatch)
  return parsed.success ? parsed.data : null
}

export function projectShortBatchArchive(project: KinaouProject): PersistedShortBatchArchiveEntry[] {
  if (!Array.isArray(project.metadata.shortExportBatchArchive)) return []
  const entries: PersistedShortBatchArchiveEntry[] = []
  const seenBatchIds = new Set<string>()
  for (const value of project.metadata.shortExportBatchArchive.slice(0, shortBatchArchiveLimit * 4)) {
    const parsed = persistedShortBatchArchiveEntrySchema.safeParse(value)
    if (parsed.success && !seenBatchIds.has(parsed.data.batchId)) {
      entries.push(parsed.data)
      seenBatchIds.add(parsed.data.batchId)
    }
    if (entries.length === shortBatchArchiveLimit) break
  }
  return entries
}

export function reviewArchivedShortBatchSelection(entry: PersistedShortBatchArchiveEntry, candidates: ShortExportCandidate[]): ArchivedShortBatchSelectionReview {
  const archived = persistedShortBatchArchiveEntrySchema.parse(entry)
  const candidateIds = [...new Set(archived.items.map((item) => item.candidateId))]
  const formats = [...new Set(archived.items.map((item) => item.format))] as TargetFormat[]
  const archivedPairs = new Set(archived.items.map((item) => `${item.candidateId}\u0000${item.format}`))
  const missingPair = candidateIds.flatMap((candidateId) => formats.map((format) => `${candidateId}\u0000${format}`)).find((pair) => !archivedPairs.has(pair))
  if (missingPair) throw new Error('This archived Short batch does not contain a complete candidate × format selection and cannot be safely restored.')
  const current = new Set(candidates.map((candidate) => candidate.id))
  const titles = new Map(archived.items.map((item) => [item.candidateId, item.title]))
  const available = candidateIds.filter((id) => current.has(id))
  return {
    candidateIds: available,
    formats,
    unavailable: candidateIds.filter((id) => !current.has(id)).map((candidateId) => ({ candidateId, title: titles.get(candidateId) ?? candidateId }))
  }
}

export function archiveProjectShortBatch(project: KinaouProject, batch: PersistedShortBatch, now = new Date()): KinaouProject {
  const normalized = persistedShortBatchSchema.parse(batch)
  if (shortBatchBusy(normalized.items)) throw new Error('Only a fully finished Short batch can be archived.')
  const archivedAt = now.toISOString()
  const entry = persistedShortBatchArchiveEntrySchema.parse({
    schemaVersion: 1,
    batchId: normalized.id,
    createdAt: normalized.createdAt,
    completedAt: normalized.updatedAt,
    archivedAt,
    items: normalized.items.map((item) => ({
      id: item.id,
      candidateId: itemCandidateId(item),
      title: item.title,
      format: item.format,
      inMs: item.inMs,
      outMs: item.outMs,
      durationMs: item.durationMs,
      outputPath: item.outputPath,
      state: item.state,
      attempt: itemAttempt(item),
      ...(item.state === 'succeeded' && item.sizeBytes !== undefined ? { sizeBytes: item.sizeBytes } : {})
    }))
  })
  const current = projectShortBatchArchive(project)
  const archive = persistedShortBatchArchiveSchema.parse([entry, ...current.filter((item) => item.batchId !== entry.batchId)].slice(0, shortBatchArchiveLimit))
  if (JSON.stringify(current) === JSON.stringify(archive)) return project
  return touchProject({ ...project, metadata: { ...project.metadata, shortExportBatchArchive: archive } }, now)
}

export function forgetProjectShortBatchArchiveEntry(project: KinaouProject, batchId: string, now = new Date()): KinaouProject {
  const normalizedId = z.string().uuid().parse(batchId)
  const current = projectShortBatchArchive(project)
  const archive = current.filter((entry) => entry.batchId !== normalizedId)
  if (archive.length === current.length) return project
  const metadata = { ...project.metadata }
  if (archive.length) metadata.shortExportBatchArchive = persistedShortBatchArchiveSchema.parse(archive)
  else delete metadata.shortExportBatchArchive
  return touchProject({ ...project, metadata }, now)
}

export function storeProjectShortBatch(project: KinaouProject, batch: PersistedShortBatch, now = new Date()): KinaouProject {
  const normalized = persistedShortBatchSchema.parse(batch)
  if (JSON.stringify(projectPersistedShortBatch(project)) === JSON.stringify(normalized)) return project
  return touchProject({ ...project, metadata: { ...project.metadata, shortExportBatch: normalized } }, now)
}

export function replacePersistedShortBatchItems(batch: PersistedShortBatch, items: PersistedShortBatchItem[], now = new Date()): PersistedShortBatch {
  return persistedShortBatchSchema.parse({ ...batch, updatedAt: now.toISOString(), items })
}

export function clearProjectShortBatch(project: KinaouProject, now = new Date()): KinaouProject {
  if (!Object.prototype.hasOwnProperty.call(project.metadata, 'shortExportBatch')) return project
  const metadata = { ...project.metadata }
  delete metadata.shortExportBatch
  return touchProject({ ...project, metadata }, now)
}

export function rebuildPersistedShortBatchPlans(project: KinaouProject, batch: PersistedShortBatch): Map<string, RenderPlan> {
  const normalized = persistedShortBatchSchema.parse(batch)
  const plans = new Map<string, RenderPlan>()
  for (const item of normalized.items) {
    if (shortBatchTerminalStates.has(item.state)) continue
    try {
      const fullPlan = createRenderPlan(project, item.preset, item.outputPath, { audioDucking: normalized.audioDucking, loudnessNormalization: normalized.loudnessNormalization })
      const plan = createRangeRenderPlan(fullPlan, { inMs: item.inMs, outMs: item.outMs }, item.outputPath)
      if (shortBatchPlanSignature(plan) !== item.planSignature) throw new Error('signature mismatch')
      plans.set(item.id, plan)
    } catch {
      throw new Error(`Cannot resume “${item.title}” because its timeline, media or render settings changed after the batch was prepared.`)
    }
  }
  return plans
}
