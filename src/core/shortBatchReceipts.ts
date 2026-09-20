import { z } from 'zod'
import { touchProject, type KinaouProject } from './project'
import { forgetExportReceipt, recordSuccessfulExport } from './exportHistory'
import { persistedShortBatchItemSchema, projectPersistedShortBatch, type PersistedShortBatchItem } from './shortExportBatch'

const receiptLedgerSchema = z.object({
  batchId: z.string().uuid(),
  jobIds: z.array(z.string().trim().min(1).max(200)).max(100)
}).strict().refine(value => new Set(value.jobIds).size === value.jobIds.length, 'Duplicate Short receipt acknowledgement')

/** Forgetting and acknowledging are one write, including before legacy-batch migration finishes. */
export function forgetExportReceiptWithShortAcknowledgement(project: KinaouProject, jobId: string): KinaouProject {
  const next = forgetExportReceipt(project, jobId)
  if (next === project) return project
  const batch = projectPersistedShortBatch(project)
  if (!batch?.items.some(item => item.state === 'succeeded' && item.jobId === jobId.trim())) return next
  const raw = project.metadata.shortExportReceiptLedger
  const ledger = raw === undefined ? undefined : receiptLedgerSchema.parse(raw)
  const recorded = new Set(ledger?.batchId === batch.id ? ledger.jobIds : [])
  recorded.add(jobId.trim())
  const updated = receiptLedgerSchema.parse({ batchId: batch.id, jobIds: [...recorded] })
  return touchProject({ ...next, metadata: { ...next.metadata, shortExportReceiptLedger: updated } })
}

/** Persist receipts and bounded acknowledgements together. Never submits, reads or changes media. */
export function persistShortBatchReceipts(project: KinaouProject, batchId: string, items: PersistedShortBatchItem[], persist: (project: KinaouProject) => void): void {
  const batch = projectPersistedShortBatch(project)
  if (!batch || batch.id !== batchId) throw new Error('Short receipt recovery belongs to another saved batch')
  const raw = project.metadata.shortExportReceiptLedger
  const ledger = raw === undefined ? undefined : receiptLedgerSchema.parse(raw)
  const recorded = new Set(ledger?.batchId === batchId ? ledger.jobIds : [])
  const pending = items.filter(item => item.state === 'succeeded' && item.jobId && !recorded.has(item.jobId))
  if (!pending.length) return
  let next = project
  for (const value of pending) {
    const item = persistedShortBatchItemSchema.parse(value)
    const saved = batch.items.find(candidate => candidate.id === item.id)
    if (!saved || saved.outputPath !== item.outputPath || saved.planSignature !== item.planSignature) throw new Error('Short receipt does not match its saved attempt')
    next = recordSuccessfulExport(next, {
      jobId: item.jobId!, label: item.title, outputRelativePath: item.outputPath,
      format: item.format, range: { inMs: item.inMs, outMs: item.outMs },
      sceneIds: item.sceneIds, durationMs: item.durationMs, sizeBytes: item.sizeBytes,
      completedAt: item.updatedAt!
    })
    recorded.add(item.jobId!)
  }
  const updated = receiptLedgerSchema.parse({ batchId, jobIds: [...recorded] })
  persist(touchProject({ ...next, metadata: { ...next.metadata, shortExportReceiptLedger: updated } }))
}
