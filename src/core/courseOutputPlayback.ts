import { projectCourseOutputIndex, type ExportReceipt } from './exportHistory'
import type { CourseOutputCheckScope } from './courseOutputPreflight'

export const maxCoursePlaybackBytes = 256 * 1024 * 1024
export interface CourseStreamSource { url: string; expiresAt: number; release: () => void }
export interface CoursePlaybackFeedback { phase: 'loading' | 'loaded' | 'failed' | 'detached'; url?: string; detail?: string }
function signature(scope: CourseOutputCheckScope) { return JSON.stringify([scope.project, scope.jobId, scope.connection, scope.dirty]) }

/** Ephemeral original-file playback. Owns its URL and aborts a discarded read. */
export class CourseOutputPlayback {
  private baseline: string
  private active = true
  private running = false
  private abort?: AbortController
  private url?: string
  private releaseStream?: () => void
  private expiry?: ReturnType<typeof setTimeout>
  constructor(scope: CourseOutputCheckScope, private deps: {
    environment: () => CourseOutputCheckScope
    load: (receipt: ExportReceipt, signal: AbortSignal) => Promise<Blob | CourseStreamSource>
    publish: (feedback: CoursePlaybackFeedback) => void
    createUrl: (blob: Blob) => string
    revokeUrl: (url: string) => void
  }) { this.baseline = signature(scope) }
  get busy() { return this.active && this.running }
  get wasDetached() { return !this.active }
  private release() {
    clearTimeout(this.expiry)
    if (this.releaseStream) { this.releaseStream(); this.releaseStream = undefined }
    else if (this.url) this.deps.revokeUrl(this.url)
    this.url = undefined
  }
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
      const source = await this.deps.load(structuredClone(matches[0]), this.abort.signal)
      if (!this.current()) { if (!(source instanceof Blob)) source.release(); return }
      if (source instanceof Blob) {
        if (source.type !== 'video/mp4' || source.size <= 0 || source.size > maxCoursePlaybackBytes) throw Error('Invalid or oversized lesson playback file')
        this.url = this.deps.createUrl(source)
      } else {
        this.releaseStream = source.release
        const url = new URL(source.url), remaining = source.expiresAt - Date.now()
        if (!['http:', 'https:'].includes(url.protocol) || !['127.0.0.1', 'localhost'].includes(url.hostname) || url.username || url.password || url.search || url.hash || !/^\/course\/output-stream\/[a-f0-9]{64}$/.test(url.pathname) || !Number.isSafeInteger(source.expiresAt) || remaining <= 0 || remaining > 2 * 60 * 60 * 1000 + 1000) throw Error('Invalid or expired lesson stream')
        this.url = source.url
        this.expiry = setTimeout(() => this.playbackFailed(), remaining)
      }
      this.deps.publish({ phase: 'loaded', url: this.url })
    } catch (cause) {
      this.release()
      if (this.current()) this.deps.publish({ phase: 'failed', detail: cause instanceof Error ? cause.message : String(cause) })
    } finally { this.running = false }
  }
}
