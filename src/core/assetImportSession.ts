import { parseAssetUploadResult, type AssetUploadResult } from './assetUpload'
import { importProbedMedia, type ImportableMediaKind } from './mediaImport'
import { parseProject, type KinaouProject } from './project'
import { assertSafeManagedPath } from './storage'
import type { MediaProbeResult } from './workerProtocol'
import type { WorkerClient } from './workerClient'

export type AssetImportPhase = 'uploading' | 'probing' | 'saving' | 'succeeded' | 'uploadUncertain' | 'probeFailed' | 'saveFailed' | 'detached'
export interface AssetImportFeedback { phase: AssetImportPhase; name: string; path?: string; detail?: string }
export function inferImportKind(file: Pick<File, 'type'>): ImportableMediaKind | null {
  if (file.type.startsWith('video/')) return 'video'
  if (file.type.startsWith('audio/')) return 'audio'
  if (file.type.startsWith('image/')) return 'image'
  return null
}

/** One explicit file selection. Retry probes/saves the accepted copy, never uploads again. */
export class AssetImportSession {
  private uploaded?: AssetUploadResult
  private probe?: MediaProbeResult
  private next?: KinaouProject
  private busy = false
  private uncertain = false
  private complete = false
  private detached = false
  private snapshotDone = false
  constructor(private project: KinaouProject, private connection: string, private file: File, private kind: ImportableMediaKind, private deps: {
    client: Pick<WorkerClient, 'importAsset' | 'probe'>
    environment: () => { project: KinaouProject; connection: string }
    snapshot: (project: KinaouProject) => void
    persist: (project: KinaouProject) => void
    publish: (feedback: AssetImportFeedback) => void
  }) {}
  get unresolved() { return !this.complete && !this.detached }
  get wasDetached() { return this.detached }
  observe(project: KinaouProject, connection: string) {
    if (this.unresolved && (JSON.stringify(this.project) !== JSON.stringify(project) || this.connection !== connection)) this.detach()
  }
  detach() { this.detached = true }
  private current() { const current = this.deps.environment(); this.observe(current.project, current.connection); return !this.detached }
  private publish(phase: AssetImportPhase, detail?: string) { if (this.current()) this.deps.publish({ phase, name: this.file.name, path: this.uploaded?.managedPath, detail }) }
  async run() {
    if (this.busy || this.uncertain || this.complete || !this.current()) return
    this.busy = true
    let phase: AssetImportPhase = this.uploaded ? (this.probe ? 'saving' : 'probing') : 'uploading'
    try {
      this.publish(phase)
      if (!this.uploaded) {
        const uploaded = parseAssetUploadResult(await this.deps.client.importAsset(this.file, this.file.name))
        if (!this.current()) return
        assertSafeManagedPath(uploaded.managedPath)
        if (!Number.isSafeInteger(uploaded.sizeBytes) || uploaded.sizeBytes !== this.file.size || !uploaded.managedPath.split('/').at(-1)?.endsWith(`_${uploaded.name}`)) throw new Error('Upload acknowledgement does not match the selected file')
        this.uploaded = uploaded
      }
      if (!this.probe) {
        phase = 'probing'; this.publish(phase)
        const probe = await this.deps.client.probe(this.uploaded.managedPath)
        if (!this.current()) return
        // The existing local worker reports an absolute path; the upload acknowledgement is portable.
        // Keep that absolute path out of project metadata, and require the exact unique copy suffix.
        const samePath = probe && typeof probe.path === 'string' && (probe.path === this.uploaded.managedPath || (probe.path.startsWith('/') && probe.path.endsWith('/' + this.uploaded.managedPath.slice('KINAOU/'.length)) && !/[\\\x00-\x1f]/.test(probe.path) && !probe.path.split('/').some(part => part === '.' || part === '..')))
        if (!samePath || probe.sizeBytes !== this.uploaded.sizeBytes) throw new Error('Probe does not match the accepted file copy')
        for (const value of [probe.durationMs, probe.width, probe.height, probe.sampleRate, probe.channels, probe.fps]) if (value !== undefined && (!Number.isFinite(value) || value <= 0)) throw new Error('Invalid media measurements')
        if ((this.kind === 'audio' && !probe.audioCodec) || (this.kind !== 'audio' && (!probe.videoCodec || !probe.width || !probe.height))) throw new Error('Selected media kind does not match the detected streams')
        if (this.kind !== 'image' && !probe.durationMs) throw new Error('Media duration is required')
        this.probe = structuredClone(probe)
      }
      if (!this.current()) return
      phase = 'saving'; this.publish(phase)
      this.next ??= parseProject(importProbedMedia(this.project, { kind: this.kind, managedPath: this.uploaded.managedPath, name: this.uploaded.name, probe: { ...this.probe, mimeType: this.file.type || undefined } }))
      if (!this.snapshotDone) { this.deps.snapshot(this.project); this.snapshotDone = true }
      const previous = this.project; this.project = this.next
      try { this.deps.persist(this.next) } catch (cause) { this.project = previous; throw cause }
      this.complete = true; this.publish('succeeded')
    } catch (cause) {
      this.uncertain = phase === 'uploading'
      this.publish(phase === 'uploading' ? 'uploadUncertain' : phase === 'probing' ? 'probeFailed' : 'saveFailed', cause instanceof Error ? cause.message : String(cause))
    } finally { this.busy = false }
  }
}
