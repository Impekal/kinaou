import { applyAssetAvailability, managedAssetPaths, type AssetAvailabilityResult } from './assetAvailability'
import type { KinaouProject } from './project'
import { assertSafeManagedPath } from './storage'
import type { WorkerClient } from './workerClient'
export interface AvailabilitySummary { checked: number; wentOffline: number; cameOnline: number; offline: number; checkedAt: string }
export interface AvailabilityFeedback { phase: 'checking' | 'succeeded' | 'failed' | 'detached'; summary?: AvailabilitySummary; detail?: string }

/** Read all batches before changing any offline flags. A new check always reads files again. */
export class AssetAvailabilitySession {
  private busy = false
  private complete = false
  private detached = false
  constructor(private project: KinaouProject, private connection: string, private deps: {
    client: Pick<WorkerClient, 'assetAvailability'>
    environment: () => { project: KinaouProject; connection: string }
    snapshot: (project: KinaouProject) => void
    persist: (project: KinaouProject) => void
    publish: (feedback: AvailabilityFeedback) => void
    now?: () => string
  }) {}
  get wasDetached() { return this.detached }
  get running() { return this.busy && !this.detached }
  observe(project: KinaouProject, connection: string) {
    if (!this.complete && (JSON.stringify(project) !== JSON.stringify(this.project) || connection !== this.connection)) this.detach()
  }
  detach() { this.detached = true }
  private current() { const current = this.deps.environment(); this.observe(current.project, current.connection); return !this.detached }
  async run() {
    if (this.busy || this.complete || !this.current()) return
    this.busy = true; this.deps.publish({ phase: 'checking' })
    try {
      const paths = managedAssetPaths(this.project)
      for (const path of paths) if (assertSafeManagedPath(path) !== path) throw Error('Noncanonical managed media path')
      const results: AssetAvailabilityResult[] = []
      for (let offset = 0; offset < paths.length; offset += 1000) {
        const batch = paths.slice(offset, offset + 1000)
        const response = await this.deps.client.assetAvailability(batch)
        if (!this.current()) return
        if (!Array.isArray(response) || response.length !== batch.length || new Set(response.map(entry => entry.path)).size !== batch.length || response.some(entry => !batch.includes(entry.path) || typeof entry.available !== 'boolean')) throw Error('Incomplete or mismatched media availability response')
        results.push(...response)
      }
      if (!this.current()) return
      const outcome = applyAssetAvailability(this.project, results)
      if (outcome.wentOffline || outcome.cameOnline) {
        this.deps.snapshot(this.project)
        const previous = this.project; this.project = outcome.project
        try { this.deps.persist(outcome.project) } catch (cause) { this.project = previous; throw cause }
      }
      this.complete = true
      this.deps.publish({ phase: 'succeeded', summary: { checked: outcome.checked, wentOffline: outcome.wentOffline, cameOnline: outcome.cameOnline, offline: outcome.project.assets.filter(asset => asset.offline).length, checkedAt: this.deps.now?.() ?? new Date().toISOString() } })
    } catch (cause) {
      if (this.current()) this.deps.publish({ phase: 'failed', detail: cause instanceof Error ? cause.message : String(cause) })
    } finally { this.busy = false }
  }
}
