import { projectCourseOutputIndex, type ExportReceipt } from './exportHistory'
import type { CourseOutputCheckScope } from './courseOutputPreflight'

export const maxCoursePlaybackBytes = 256 * 1024 * 1024
export interface CoursePlaybackFeedback { phase: 'loading' | 'loaded' | 'failed' | 'detached'; url?: string; detail?: string }
function signature(scope: CourseOutputCheckScope) { return JSON.stringify([scope.project, scope.jobId, scope.connection, scope.dirty]) }

/** Ephemeral original-file playback. Owns its URL and aborts a discarded read. */
export class CourseOutputPlayback {
  private baseline: string
  private active = true
  private running = false
  private abort?: AbortController
  private url?: string
  constructor(scope: CourseOutputCheckScope, private deps: {
    environment: () => CourseOutputCheckScope
    load: (receipt: ExportReceipt, signal: AbortSignal) => Promise<Blob>
    publish: (feedback: CoursePlaybackFeedback) => void
    createUrl: (blob: Blob) => string
    revokeUrl: (url: string) => void
  }) { this.baseline = signature(scope) }
  get busy() { return this.active && this.running }
  get wasDetached() { return !this.active }
  private release() { if (this.url) { this.deps.revokeUrl(this.url); this.url = undefined } }
  detach() { this.active = false; this.abort?.abort(); this.release() }
  observe(scope: CourseOutputCheckScope) { if (signature(scope) !== this.baseline) this.detach() }
  private current() { this.observe(this.deps.environment()); return this.active }
  playbackFailed() { if (this.current()) { this.release(); this.deps.publish({ phase: 'failed' }) } }
  async load() {
    if (this.running || !this.current()) return
    this.running = true; this.release(); this.abort = new AbortController()
    try {
      const scope = this.deps.environment()
      if (scope.dirty) throw Error('Save the course draft before loading its video')
      const matches = projectCourseOutputIndex(scope.project).filter(item => item.jobId === scope.jobId)
      if (matches.length !== 1) throw Error('Select one retained lesson output')
      this.deps.publish({ phase: 'loading' })
      const blob = await this.deps.load(structuredClone(matches[0]), this.abort.signal)
      if (!this.current()) return
      if (blob.type !== 'video/mp4' || blob.size <= 0 || blob.size > maxCoursePlaybackBytes) throw Error('Invalid or oversized lesson playback file')
      this.url = this.deps.createUrl(blob)
      this.deps.publish({ phase: 'loaded', url: this.url })
    } catch (cause) {
      if (this.current()) this.deps.publish({ phase: 'failed', detail: cause instanceof Error ? cause.message : String(cause) })
    } finally { this.running = false }
  }
}
