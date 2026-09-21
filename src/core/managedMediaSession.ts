import { importProbedMedia, type ImportableMediaKind } from './mediaImport'
import { parseProject, type KinaouProject } from './project'
import { assertSafeManagedPath } from './storage'
import type { WorkerClient } from './workerClient'
import type { MediaProbeResult } from './workerProtocol'

export interface ManagedMediaDraft { path: string; kind: ImportableMediaKind; name: string }
export interface ManagedMediaFeedback { phase: 'checking' | 'review' | 'saving' | 'succeeded' | 'failed' | 'saveFailed' | 'detached'; draft: ManagedMediaDraft; probe?: MediaProbeResult; detail?: string }
export function validateManagedMediaDraft(draft: ManagedMediaDraft) {
  const path = assertSafeManagedPath(draft.path)
  if (path !== draft.path || !path.startsWith('KINAOU/Assets/') || /[\\\x00-\x1f]/.test(path) || path.split('/').some(part => !part || part === '.' || part === '..')) throw Error('Enter a canonical file path inside KINAOU/Assets')
  if (!['audio', 'video', 'image'].includes(draft.kind)) throw Error('Invalid media kind')
  const image = /\.(png|jpe?g|webp|gif|bmp|tiff?|avif)$/i.test(path)
  if ((draft.kind === 'image') !== image) throw Error('Image files require the image kind; moving media requires audio or video')
}
export function validateManagedMediaProbe(draft: ManagedMediaDraft, roots: string[], probe: MediaProbeResult) {
  validateManagedMediaDraft(draft)
  const absolutePaths = roots.filter(root => root.startsWith('/') && !/[\\\x00-\x1f]/.test(root) && !root.split('/').some(part => part === '.' || part === '..')).map(root => root.replace(/\/$/, '') + '/' + draft.path.slice('KINAOU/'.length))
  if (!probe || (probe.path !== draft.path && !absolutePaths.includes(probe.path))) throw Error('Probe path does not match the requested file and worker root')
  if (!Number.isSafeInteger(probe.sizeBytes) || probe.sizeBytes! <= 0) throw Error('Missing or invalid file size')
  for (const value of [probe.durationMs, probe.width, probe.height, probe.sampleRate, probe.channels, probe.fps]) if (value !== undefined && (!Number.isFinite(value) || value <= 0)) throw Error('Invalid media measurements')
  if (draft.kind === 'audio' ? !probe.audioCodec : !probe.videoCodec || !probe.width || !probe.height) throw Error('Media kind does not match the detected streams')
  if (draft.kind !== 'image' && !probe.durationMs) throw Error('Media duration is required')
}

/** Read-only inspection followed by an explicit reversible metadata save. No file copy or mutation. */
export class ManagedMediaSession {
  private probe?: MediaProbeResult
  private next?: KinaouProject
  private busy = false
  private complete = false
  private detached = false
  private snapshotDone = false
  readonly draft: ManagedMediaDraft
  constructor(private project: KinaouProject, private connection: string, draft: ManagedMediaDraft, private deps: {
    client: Pick<WorkerClient, 'health' | 'probe'>
    environment: () => { project: KinaouProject; connection: string }
    snapshot: (project: KinaouProject) => void
    persist: (project: KinaouProject) => void
    publish: (feedback: ManagedMediaFeedback) => void
  }) { this.draft = structuredClone(draft) }
  get running() { return this.busy && !this.detached }
  get wasDetached() { return this.detached }
  get canSave() { return !!this.probe && !this.busy && !this.complete && !this.detached }
  observe(project: KinaouProject, connection: string) {
    if (!this.complete && (JSON.stringify(project) !== JSON.stringify(this.project) || connection !== this.connection)) this.detach()
  }
  detach() { this.detached = true }
  private current() { const value = this.deps.environment(); this.observe(value.project, value.connection); return !this.detached }
  private publish(phase: ManagedMediaFeedback['phase'], detail?: string) { if (this.current()) this.deps.publish({ phase, draft: structuredClone(this.draft), probe: this.probe && structuredClone(this.probe), detail }) }
  async inspect() {
    if (this.busy || this.complete || this.probe || !this.current()) return
    this.busy = true; this.publish('checking')
    try {
      validateManagedMediaDraft(this.draft)
      if (this.project.assets.some(asset => asset.managed && asset.uri === this.draft.path)) throw Error('This file is already registered in this project')
      const health = await this.deps.client.health()
      if (!this.current()) return
      const probe = await this.deps.client.probe(this.draft.path)
      if (!this.current()) return
      validateManagedMediaProbe(this.draft, health.managedRoots, probe)
      // Never retain the machine-specific absolute path in the portable project/review.
      this.probe = { ...structuredClone(probe), path: this.draft.path }
      this.publish('review')
    } catch (cause) { this.publish('failed', cause instanceof Error ? cause.message : String(cause)) }
    finally { this.busy = false }
  }
  save() {
    if (!this.canSave || !this.current()) return
    this.busy = true; this.publish('saving')
    try {
      this.next ??= parseProject(importProbedMedia(this.project, { kind: this.draft.kind, managedPath: this.draft.path, name: this.draft.name.trim() || this.draft.path.split('/').at(-1)!, probe: this.probe! }))
      if (!this.snapshotDone) { this.deps.snapshot(this.project); this.snapshotDone = true }
      const previous = this.project; this.project = this.next
      try { this.deps.persist(this.next) } catch (cause) { this.project = previous; throw cause }
      this.complete = true; this.publish('succeeded')
    } catch (cause) { this.publish('saveFailed', cause instanceof Error ? cause.message : String(cause)) }
    finally { this.busy = false }
  }
}
