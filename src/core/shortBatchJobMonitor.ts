import type { WorkerClient } from './workerClient'
import { acceptShortBatchJob, failMissingShortBatchJob, requeueMissingShortBatchJob, shortBatchTerminalStates, type PersistedShortBatchItem } from './shortExportBatch'
import type { ShortBatchNotice } from './shortBatchCommit'

/** One accepted job in one connection lifetime. Never submits or trusts an existing file. */
export class ShortBatchJobMonitor {
  private active = true
  private epoch = 0
  private running = false
  private cancelling = false
  constructor(private item: PersistedShortBatchItem, private deps: {
    client: Pick<WorkerClient, 'renderStatus' | 'exportAvailability' | 'cancelRender'>
    publish: (item: PersistedShortBatchItem) => void
    notice: (notice: ShortBatchNotice) => void
    error: (detail: string) => void
    onCancelling: (value: boolean) => void
    wait?: () => Promise<void>
  }) {
    if (!item.jobId) throw new Error('Short monitoring requires an accepted job')
  }
  detach() { this.active = false; this.epoch++ }
  private unfinished() { return Boolean(this.item.jobId) && !shortBatchTerminalStates.has(this.item.state) }
  private publish(item: PersistedShortBatchItem) { this.item = item; this.deps.publish(item) }
  async run() {
    if (!this.active || this.running || this.cancelling || !this.unfinished()) return
    this.running = true
    const epoch = ++this.epoch
    const current = () => this.active && this.epoch === epoch
    try {
      while (current() && this.unfinished()) {
        try {
          const result = await this.deps.client.renderStatus(this.item.jobId!)
          if (!current()) return
          this.publish(acceptShortBatchJob(this.item, result))
        } catch (cause) {
          if (!current()) return
          const detail = cause instanceof Error ? cause.message : String(cause)
          if (/render job not found/i.test(detail)) {
            try {
              const results = await this.deps.client.exportAvailability([this.item.outputPath])
              if (!current()) return
              if (results.length !== 1 || results[0].path !== this.item.outputPath || typeof results[0].available !== 'boolean') throw new Error('Interrupted Short availability did not match its exact output')
              const exists = results[0].available
              const updated = exists
                ? failMissingShortBatchJob([this.item], this.item.id, 'The worker lost this job but an output file already exists. KINAOU did not overwrite or trust it; prepare a new batch if this variant must be rendered again.')[0]
                : requeueMissingShortBatchJob([this.item], this.item.id)[0]
              this.publish(updated)
              this.deps.notice({ kind: exists ? 'existingKept' : 'requeued' })
            } catch (error) { if (current()) this.deps.error(error instanceof Error ? error.message : String(error)) }
          } else this.deps.error(detail)
        }
        if (!current() || !this.unfinished()) return
        await (this.deps.wait?.() ?? new Promise<void>(resolve => setTimeout(resolve, 1000)))
      }
    } finally { if (current()) this.running = false }
  }
  async cancel() {
    if (!this.active || this.cancelling || !this.unfinished()) return
    const epoch = ++this.epoch
    const current = () => this.active && this.epoch === epoch
    this.cancelling = true
    this.deps.onCancelling(true)
    try {
      const result = await this.deps.client.cancelRender(this.item.jobId!)
      if (!current()) return
      this.publish(acceptShortBatchJob(this.item, result))
    } catch (cause) { if (current()) this.deps.error(cause instanceof Error ? cause.message : String(cause)) }
    finally {
      if (current()) {
        this.cancelling = false
        this.running = false
        this.deps.onCancelling(false)
        // A failed cancellation (or still-active reply) resumes the same accepted job.
        void this.run()
      }
    }
  }
}
