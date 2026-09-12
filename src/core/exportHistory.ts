import { z } from 'zod'
import { touchProject, type KinaouProject } from './project'
import { assertSafeManagedPath } from './storage'

const MAX_EXPORT_RECEIPTS = 50

const managedRenderPathSchema = z.string().min(1).max(500).refine((value) => {
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
  durationMs: z.number().int().positive(),
  sizeBytes: z.number().int().nonnegative().optional(),
  completedAt: z.string().datetime()
})

export type ExportReceipt = z.infer<typeof exportReceiptSchema>
export type SuccessfulExportReceiptInput = Omit<ExportReceipt, 'schemaVersion'>

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
  if (current.some((item) => item.jobId === receipt.jobId)) return project
  return touchProject({ ...project, metadata: { ...project.metadata, exportHistory: [receipt, ...current].slice(0, MAX_EXPORT_RECEIPTS) } }, now)
}

export function forgetExportReceipt(project: KinaouProject, jobId: string, now = new Date()): KinaouProject {
  const id = jobId.trim()
  if (!id) throw new Error('Export receipt job id is required.')
  const current = projectExportHistory(project)
  if (!current.some((item) => item.jobId === id)) return project
  return touchProject({ ...project, metadata: { ...project.metadata, exportHistory: current.filter((item) => item.jobId !== id) } }, now)
}
