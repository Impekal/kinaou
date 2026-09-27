import { z } from 'zod'
import { touchProject, type KinaouProject } from './project'
import { assertSafeManagedPath } from './storage'
import { courseExportContextSchema } from './course'

const MAX_EXPORT_RECEIPTS = 50

export const managedRenderPathSchema = z.string().min(1).max(500).refine((value) => {
  try {
    return assertSafeManagedPath(value) === value && value.startsWith('KINAOU/Renders/') && value.endsWith('.mp4')
  } catch {
    return false
  }
}, 'Export receipt must reference a canonical managed MP4 under KINAOU/Renders')

export const exportReceiptSchema = z.object({
  schemaVersion: z.literal(1),
  jobId: z.string().trim().min(1).max(200),
  label: z.string().trim().min(1).max(240),
  outputRelativePath: managedRenderPathSchema,
  format: z.enum(['landscape', 'vertical', 'square']),
  range: z.object({ inMs: z.number().int().nonnegative(), outMs: z.number().int().positive() }).refine((value) => value.outMs > value.inMs, 'Export receipt range must have Out after In'),
  sceneIds: z.array(z.string().min(1).max(200)).max(100).default([]),
  courseLesson: courseExportContextSchema.optional(),
  durationMs: z.number().int().positive(),
  sizeBytes: z.number().int().nonnegative().optional(),
  completedAt: z.string().datetime()
})

export type ExportReceipt = z.infer<typeof exportReceiptSchema>
export type SuccessfulExportReceiptInput = Omit<ExportReceipt, 'schemaVersion'>

export const courseOutputIndexLimits = { entries: 1000, bytes: 4 * 1024 * 1024 } as const
const courseOutputIndexSchema = z.object({
  schemaVersion: z.literal(1), projectId: z.string().min(1).max(200),
  receipts: z.array(exportReceiptSchema.extend({ courseLesson: courseExportContextSchema }).strict()).max(courseOutputIndexLimits.entries)
}).strict()

/** Retained metadata only: never evidence that a file still exists or is unchanged. */
export function projectCourseOutputIndex(project: KinaouProject): ExportReceipt[] {
  const value = project.metadata.courseOutputIndex
  if (value === undefined) return []
  if (new TextEncoder().encode(JSON.stringify(value)).length > courseOutputIndexLimits.bytes) throw new Error('Course output index exceeds its size limit; recover from Version History')
  const parsed = courseOutputIndexSchema.safeParse(value)
  if (!parsed.success || parsed.data.projectId !== project.id
    || new Set(parsed.data.receipts.map(receipt => receipt.jobId)).size !== parsed.data.receipts.length) throw new Error('Invalid course output index; recover from Version History or explicitly clear its references')
  return parsed.data.receipts
}

function mergeCourseOutputIndex(project: KinaouProject, receipts: ExportReceipt[]): KinaouProject {
  const current = projectCourseOutputIndex(project), additions: ExportReceipt[] = []
  const byJob = new Map(current.map(receipt => [receipt.jobId, receipt]))
  for (const receipt of receipts) {
    if (!receipt.courseLesson) continue
    const previous = byJob.get(receipt.jobId)
    if (previous && JSON.stringify(previous) !== JSON.stringify(receipt)) throw new Error('Conflicting course output reference for an existing job')
    if (!previous) { additions.push(receipt); byJob.set(receipt.jobId, receipt) }
  }
  if (!additions.length) return project
  if (current.length + additions.length > courseOutputIndexLimits.entries) throw new Error('Course output index is full. Use retained-reference recovery in this Studio view, then retry saving this same completed export; do not render again')
  const courseOutputIndex = { schemaVersion: 1, projectId: project.id, receipts: [...additions, ...current] }
  if (new TextEncoder().encode(JSON.stringify(courseOutputIndex)).length > courseOutputIndexLimits.bytes) throw new Error('Course output index size limit reached. Use retained-reference recovery in this Studio view, then retry saving this same completed export')
  return { ...project, metadata: { ...project.metadata, courseOutputIndex } }
}

/** Explicit migration can retain only references still present in the recent list. */
export function retainRecentCourseOutputs(project: KinaouProject, now = new Date()): KinaouProject {
  const next = mergeCourseOutputIndex(project, projectExportHistory(project))
  return next === project ? project : touchProject(next, now)
}

export function forgetCourseOutputReference(project: KinaouProject, jobId: string, now = new Date()): KinaouProject {
  const current = projectCourseOutputIndex(project)
  if (!current.some(receipt => receipt.jobId === jobId)) return project
  return touchProject({ ...project, metadata: { ...project.metadata, courseOutputIndex: {
    schemaVersion: 1, projectId: project.id, receipts: current.filter(receipt => receipt.jobId !== jobId)
  } } }, now)
}

/** Explicit recovery/reset; caller must save a safety version and confirm. */
export function clearCourseOutputIndex(project: KinaouProject, now = new Date()): KinaouProject {
  if (project.metadata.courseOutputIndex === undefined) return project
  const metadata = { ...project.metadata }; delete metadata.courseOutputIndex
  return touchProject({ ...project, metadata }, now)
}

export function projectExportHistory(project: KinaouProject): ExportReceipt[] {
  if (!Array.isArray(project.metadata.exportHistory)) return []
  const receipts: ExportReceipt[] = []
  const seenJobIds = new Set<string>()
  for (const value of project.metadata.exportHistory.slice(0, MAX_EXPORT_RECEIPTS * 4)) {
    const parsed = exportReceiptSchema.safeParse(value)
    if (parsed.success && !seenJobIds.has(parsed.data.jobId)) {
      receipts.push(parsed.data)
      seenJobIds.add(parsed.data.jobId)
    }
    if (receipts.length === MAX_EXPORT_RECEIPTS) break
  }
  return receipts
}

export function recordSuccessfulExport(project: KinaouProject, input: SuccessfulExportReceiptInput, now = new Date()): KinaouProject {
  const receipt = exportReceiptSchema.parse({ schemaVersion: 1, ...input })
  const current = projectExportHistory(project)
  const previous = current.find(item => item.jobId === receipt.jobId)
  if (receipt.courseLesson && previous && JSON.stringify(previous) !== JSON.stringify(receipt)) throw new Error('Conflicting course export receipt for an existing job')
  const retained = receipt.courseLesson ? mergeCourseOutputIndex(project, [receipt]) : project
  if (previous) return retained === project ? project : touchProject(retained, now)
  return touchProject({ ...retained, metadata: { ...retained.metadata, exportHistory: [receipt, ...current].slice(0, MAX_EXPORT_RECEIPTS) } }, now)
}

export function forgetExportReceipt(project: KinaouProject, jobId: string, now = new Date()): KinaouProject {
  const id = jobId.trim()
  if (!id) throw new Error('Export receipt job id is required.')
  const current = projectExportHistory(project)
  if (!current.some((item) => item.jobId === id)) return project
  return touchProject({ ...project, metadata: { ...project.metadata, exportHistory: current.filter((item) => item.jobId !== id) } }, now)
}
