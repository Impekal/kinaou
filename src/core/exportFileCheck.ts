import type { WorkerClient } from './workerClient'

export interface ExportFileCheck { byPath: Record<string, boolean>; available: number; missing: number; checkedAt: string }
export type ExportCheckFeedback = { phase: 'checking' } | { phase: 'checked'; result: ExportFileCheck } | { phase: 'failed'; detail: string }

/** Read-only presence check. Its caller owns the project/connection lifetime. */
export class ExportFileCheckSession {
  private active = true
  private busy = false
  constructor(private paths: string[], private deps: {
    client: Pick<WorkerClient, 'exportAvailability'>
    current: () => boolean
    publish: (value: ExportCheckFeedback) => void
  }) {}
  detach() { this.active = false }
  private current() { return this.active && this.deps.current() }
  async run() {
    if (this.busy || !this.current()) return
    this.busy = true
    this.deps.publish({ phase: 'checking' })
    try {
      const paths = [...new Set(this.paths)]
      const results = await this.deps.client.exportAvailability(paths)
      if (!this.current()) return
      const byPath = Object.fromEntries(results.map(result => [result.path, result.available]))
      if (results.length !== paths.length || Object.keys(byPath).length !== paths.length || paths.some(path => typeof byPath[path] !== 'boolean')) throw new Error('Export availability response does not match the requested paths')
      const available = results.filter(result => result.available).length
      this.deps.publish({ phase: 'checked', result: { byPath, available, missing: paths.length - available, checkedAt: new Date().toISOString() } })
    } catch (cause) {
      if (this.current()) this.deps.publish({ phase: 'failed', detail: String(cause) })
    } finally { this.busy = false }
  }
}
