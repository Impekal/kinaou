import { parseProject, type KinaouProject } from './project'
import { assertMediaPreviewPath, attachMediaPreview, expectedMediaPreviewPath, requirePreviewSource, type MediaPreviewKind } from './previewAssets'
import type { WorkerClient } from './workerClient'
import type { MediaProbeResult } from './workerProtocol'

export type MediaPreviewPhase = 'generating' | 'saving' | 'saved' | 'failed' | 'unconfirmed' | 'saveFailed' | 'detached'
export interface MediaPreviewFeedback { phase: MediaPreviewPhase; kind: MediaPreviewKind; assetId: string; sourceName: string; path?: string; detail?: string }
type Client = Pick<WorkerClient, 'health' | 'generateVideoThumbnail' | 'generateWaveform' | 'generateVideoProxy'>

export function validateMediaPreviewResult(kind: MediaPreviewKind, expected: string, value: unknown, roots: string[] = []): string {
  if (!value || typeof value !== 'object') throw Error('Missing media preview result')
  const result = value as { path?: string; sizeBytes?: number; probe?: MediaProbeResult }
  if (typeof result.path !== 'string' || result.path !== expected) throw Error('Preview response does not match the submitted source')
  assertMediaPreviewPath(kind, result.path)
  if (kind !== 'proxy') {
    if (!Number.isSafeInteger(result.sizeBytes) || result.sizeBytes! <= 0) throw Error('Invalid preview file size')
  } else {
    const probe = result.probe
    const absolute = roots.filter(root => root.startsWith('/') && !/[\\\x00-\x1f]/.test(root) && !root.split('/').some(part => part === '.' || part === '..')).map(root => root.replace(/\/$/, '') + '/' + expected.slice('KINAOU/'.length))
    if (!probe || (probe.path !== expected && !absolute.includes(probe.path))) throw Error('Proxy probe path does not match the result and worker root')
    if (!Number.isSafeInteger(probe.sizeBytes) || probe.sizeBytes! <= 0 || !probe.videoCodec || !probe.width || !probe.height || !probe.durationMs) throw Error('Missing proxy video measurements')
    for (const value of [probe.durationMs, probe.width, probe.height, probe.fps, probe.sampleRate, probe.channels]) if (value !== undefined && (!Number.isFinite(value) || value <= 0)) throw Error('Invalid proxy video measurements')
  }
  return result.path
}

export class MediaPreviewSession {
  private project: KinaouProject
  private busy = false
  private attempted = false
  private detached = false
  private complete = false
  private snapshotDone = false
  private path?: string
  private next?: KinaouProject
  private sourceName: string
  constructor(project: KinaouProject, private connection: string, private assetId: string, private kind: MediaPreviewKind, private deps: {
    client: Client
    environment: () => { project: KinaouProject; connection: string }
    snapshot: (project: KinaouProject) => void
    persist: (project: KinaouProject) => void
    publish: (value: MediaPreviewFeedback) => void
  }) {
    this.project = structuredClone(project)
    const asset = project.assets.find(value => value.id === assetId)
    this.sourceName = String(asset?.metadata.name ?? asset?.id ?? '')
  }
  get wasDetached() { return this.detached }
  get blocksGeneration() { return !this.detached && !this.complete && (this.busy || this.attempted) }
  get canSave() { return !this.detached && !this.busy && !this.complete && !!this.path }
  observe(project: KinaouProject, connection: string) { if (JSON.stringify(project) !== JSON.stringify(this.project) || connection !== this.connection) this.detach() }
  detach() { this.detached = true }
  private current() { const value = this.deps.environment(); this.observe(value.project, value.connection); return !this.detached }
  private publish(phase: MediaPreviewPhase, detail?: string) { if (this.current()) this.deps.publish({ phase, kind: this.kind, assetId: this.assetId, sourceName: this.sourceName, path: this.path, detail }) }
  async generate() {
    if (this.busy || this.attempted || this.complete || !this.current()) return
    this.busy = true; this.publish('generating')
    let failure: unknown
    try {
      const source = requirePreviewSource(this.project, this.assetId, this.kind)
      const expected = await expectedMediaPreviewPath(this.kind, source.uri)
      if (!this.current()) return
      const roots = this.kind === 'proxy' ? (await this.deps.client.health()).managedRoots : []
      if (!this.current()) return
      this.attempted = true
      const result = await (this.kind === 'thumbnail' ? this.deps.client.generateVideoThumbnail(source.uri) : this.kind === 'waveform' ? this.deps.client.generateWaveform(source.uri) : this.deps.client.generateVideoProxy(source.uri))
      if (!this.current()) return
      this.path = validateMediaPreviewResult(this.kind, expected, result, roots)
    } catch (cause) { failure = cause }
    finally { this.busy = false }
    if (!this.current()) return
    if (this.path) this.save()
    else this.publish(this.attempted ? 'unconfirmed' : 'failed', failure instanceof Error ? failure.message : String(failure))
  }
  save() {
    if (!this.canSave || !this.current()) return
    this.busy = true; this.publish('saving')
    let failure: unknown
    try {
      this.next ??= parseProject(attachMediaPreview(this.project, this.assetId, this.kind, this.path!))
      if (!this.snapshotDone) { this.deps.snapshot(this.project); this.snapshotDone = true }
      if (!this.current()) return
      const previous = this.project; this.project = this.next
      try { this.deps.persist(this.next) } catch (cause) { this.project = previous; throw cause }
      this.complete = true
    } catch (cause) { failure = cause }
    finally { this.busy = false }
    this.publish(this.complete ? 'saved' : 'saveFailed', failure === undefined ? undefined : failure instanceof Error ? failure.message : String(failure))
  }
}

export type PreviewImagePhase = 'loading' | 'ready' | 'loadFailed'
export interface PreviewImageFeedback { phase: PreviewImagePhase; url?: string; detail?: string }
export class PreviewImageSession {
  private detached = false
  private busy = false
  private url?: string
  constructor(private deps: { load: () => Promise<Blob>; mime: string; createUrl: (blob: Blob) => string; revokeUrl: (url: string) => void; publish: (value: PreviewImageFeedback) => void }) {}
  private release() { if (this.url) { this.deps.revokeUrl(this.url); this.url = undefined } }
  detach() { this.detached = true; this.release() }
  failDisplay() { if (!this.detached) { this.release(); this.deps.publish({ phase: 'loadFailed' }) } }
  async load() {
    if (this.busy || this.detached) return
    this.busy = true; this.release(); this.deps.publish({ phase: 'loading' })
    let feedback: PreviewImageFeedback
    try {
      const blob = await this.deps.load()
      if (this.detached) return
      if (!blob.size || blob.type.split(';')[0] !== this.deps.mime) throw Error('Invalid or empty preview image')
      this.url = this.deps.createUrl(blob); feedback = { phase: 'ready', url: this.url }
    } catch (cause) { feedback = { phase: 'loadFailed', detail: cause instanceof Error ? cause.message : String(cause) } }
    finally { this.busy = false }
    if (!this.detached) this.deps.publish(feedback)
  }
}
