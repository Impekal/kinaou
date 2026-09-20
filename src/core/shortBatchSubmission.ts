import type { RenderPlan } from './render'
import type { WorkerClient } from './workerClient'
import { acceptShortBatchJob, nextShortBatchItem, persistedShortBatchSchema, shortBatchTerminalStates, type PersistedShortBatch, type PersistedShortBatchItem } from './shortExportBatch'

/** Write-ahead marker, not evidence that the worker accepted or rejected a job. */
export function markShortBatchSubmission(batch: PersistedShortBatch, itemId: string, now = new Date()): PersistedShortBatch {
  const current = persistedShortBatchSchema.parse(batch)
  if (current.cancelRequested || current.items.some(item => item.jobId && !shortBatchTerminalStates.has(item.state)) || nextShortBatchItem(current.items)?.id !== itemId) {
    throw new Error('Only the next unsubmitted Short in an idle, uncancelled batch may start')
  }
  return persistedShortBatchSchema.parse({ ...current, updatedAt: now.toISOString(), items: current.items.map(item => item.id === itemId ? { ...item, submissionStartedAt: now.toISOString() } : item) })
}

/** One POST per lifetime; detachment never claims to cancel a remote operation. */
export class ShortBatchSubmission {
  private active = true
  private started = false
  constructor(private deps: {
    plan: RenderPlan
    client: Pick<WorkerClient, 'startRender'>
    isCurrent: () => boolean
    saveIntent: () => PersistedShortBatchItem
    accepted: (item: PersistedShortBatchItem) => void
    error: (detail: string) => void
    finished: () => void
  }) {}
  detach() { this.active = false }
  private current() { return this.active && this.deps.isCurrent() }
  async run() {
    if (this.started || !this.current()) return
    this.started = true
    let marked = false
    try {
      const item = this.deps.saveIntent()
      marked = true
      if (!this.current()) return
      const job = await this.deps.client.startRender(this.deps.plan)
      if (!this.current()) return
      this.deps.accepted(acceptShortBatchJob(item, job))
    } catch (cause) {
      if (this.current()) {
        const detail = cause instanceof Error ? cause.message : String(cause)
        this.deps.error(marked ? 'Worker acceptance is unconfirmed; automatic resubmission is blocked. ' + detail : 'Could not save the submission intent; no job was sent. ' + detail)
      }
    } finally { if (this.current()) this.deps.finished() }
  }
}
