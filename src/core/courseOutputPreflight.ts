import { projectCourseOutputIndex, type ExportReceipt } from './exportHistory'
import type { KinaouProject } from './project'
import { parsePublishPreflightResult, type PublishPreflightResult } from './publishPackage'

export interface CourseOutputCheckScope { project: KinaouProject; jobId: string; connection: string; dirty: boolean }
export interface CourseOutputCheckFeedback {
  phase: 'checking' | 'matched' | 'mismatch' | 'failed' | 'detached'
  receipt?: ExportReceipt; result?: PublishPreflightResult; detail?: string
}
function signature(scope: CourseOutputCheckScope) { return JSON.stringify([scope.project, scope.jobId, scope.connection, scope.dirty]) }

/** Explicit read-only preflight. No file integrity hash, quality assertion or project write. */
export class CourseOutputPreflight {
  private baseline: string
  private active = true
  private running = false
  constructor(scope: CourseOutputCheckScope, private deps: {
    environment: () => CourseOutputCheckScope
    client: { preflightPublishExport: (receipt: ExportReceipt) => Promise<PublishPreflightResult> }
    publish: (feedback: CourseOutputCheckFeedback) => void
  }) { this.baseline = signature(scope) }
  get busy() { return this.running && this.active }
  get wasDetached() { return !this.active }
  detach() { this.active = false }
  observe(scope: CourseOutputCheckScope) { if (signature(scope) !== this.baseline) this.detach() }
  private current() { this.observe(this.deps.environment()); return this.active }
  async check() {
    if (this.running || !this.current()) return
    this.running = true
    let receipt: ExportReceipt | undefined
    try {
      const scope = this.deps.environment()
      if (scope.dirty) throw new Error('Save the course draft before inspecting its output')
      const receipts = projectCourseOutputIndex(scope.project).filter(entry => entry.jobId === scope.jobId)
      if (receipts.length !== 1) throw new Error('Select one retained lesson export in this project')
      receipt = structuredClone(receipts[0])
      this.deps.publish({ phase: 'checking', receipt })
      const value = await this.deps.client.preflightPublishExport(structuredClone(receipt))
      if (!this.current()) return
      const result = parsePublishPreflightResult(value, receipt)
      this.deps.publish({ phase: result.ready ? 'matched' : 'mismatch', receipt, result })
    } catch (cause) {
      if (this.current()) this.deps.publish({ phase: 'failed', receipt, detail: cause instanceof Error ? cause.message : String(cause) })
    } finally { this.running = false }
  }
}
