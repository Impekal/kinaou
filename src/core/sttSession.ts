import type { KinaouProject } from './project'
import { assertSttPath, parseSttJob, type SttJobRecord } from './sttJobs'
import { registerTranscriptAsset } from './transcripts'
import type { WorkerClient } from './workerClient'

export interface SttDraft { sourceId: string; model: string; language: string }
export type SttPhase = 'invalid' | 'starting' | 'unknown' | 'queued' | 'running' | 'checking' | 'cancelling' | 'ready' | 'saving' | 'saved' | 'saveFailed' | 'statusFailed' | 'cancelFailed' | 'failed' | 'cancelled' | 'detached'
export interface SttFeedback { phase: SttPhase; draft: SttDraft; sourceName: string; job?: SttJobRecord; detail?: string }
type Environment = { project: KinaouProject; connection: string }
type Client = Pick<WorkerClient, 'startStt' | 'sttStatus' | 'cancelStt'>
const terminal = new Set(['succeeded', 'failed', 'cancelled'])
const detail = (cause: unknown) => cause instanceof Error ? cause.message : String(cause)

export class SttSession {
  private project: KinaouProject
  private draft: SttDraft
  private sourceName: string
  private job?: SttJobRecord
  private next?: KinaouProject
  private phase: SttPhase = 'invalid'
  private error?: string
  private busy = false
  private attempted = false
  private detached = false
  private snapshotDone = false
  constructor(project: KinaouProject, private connection: string, draft: SttDraft, private deps: {
    client: Client
    environment: () => Environment
    snapshot: (project: KinaouProject) => void
    persist: (project: KinaouProject) => void
    publish: (feedback: SttFeedback) => void
  }) {
    this.project = structuredClone(project); this.draft = structuredClone(draft)
    const source = project.assets.find(asset => asset.id === draft.sourceId)
    this.sourceName = String(source?.metadata.name ?? source?.id ?? '')
  }
  get wasDetached() { return this.detached }
  get blocksStart() { return !this.detached && (this.busy || (this.attempted && !['saved', 'failed', 'cancelled'].includes(this.phase))) }
  get canCheck() { return !this.detached && !this.busy && !!this.job && !terminal.has(this.job.state) }
  get shouldPoll() { return this.canCheck && ['queued', 'running'].includes(this.phase) }
  get canSave() { return !this.detached && !this.busy && this.job?.state === 'succeeded' && this.phase !== 'saved' }
  observe(project: KinaouProject, connection: string) {
    if (JSON.stringify(project) !== JSON.stringify(this.project) || connection !== this.connection) this.detach()
  }
  detach() { this.detached = true }
  private current() { const value = this.deps.environment(); this.observe(value.project, value.connection); return !this.detached }
  private emit() {
    if (this.current()) this.deps.publish({ phase: this.phase, draft: structuredClone(this.draft), sourceName: this.sourceName, job: this.job && structuredClone(this.job), detail: this.error })
  }
  private accept(value: SttJobRecord) {
    const job = parseSttJob(value)
    if (this.job && job.id !== this.job.id) throw Error('STT response belongs to another job')
    if (this.job?.state === 'running' && job.state === 'queued') throw Error('STT job state moved backwards')
    this.job = structuredClone(job)
    this.phase = job.state === 'succeeded' ? 'ready' : job.state
    this.error = job.state === 'failed' ? job.error : undefined
  }
  async start() {
    if (this.attempted || this.busy || !this.current()) return
    try {
      const source = this.project.assets.find(asset => asset.id === this.draft.sourceId)
      if (!source || !source.managed || source.offline || !['audio', 'video'].includes(source.kind)) throw Error('Select an available managed audio or video source')
      assertSttPath(source.uri, 'KINAOU/Assets/'); assertSttPath(this.draft.model, 'KINAOU/Models/')
      if (!/^(auto|[a-z]{2,3})$/.test(this.draft.language)) throw Error('Use auto or a two/three-letter transcription language')
    } catch (cause) { this.phase = 'invalid'; this.error = detail(cause); this.emit(); return }
    this.attempted = true; this.busy = true; this.phase = 'starting'; this.error = undefined; this.emit()
    try {
      const source = this.project.assets.find(asset => asset.id === this.draft.sourceId)!
      const job = await this.deps.client.startStt(source.uri, this.draft.model, this.draft.language)
      if (this.current()) this.accept(job)
    } catch (cause) { this.phase = 'unknown'; this.error = detail(cause) }
    finally { this.busy = false; this.emit() }
    if (this.canSave) this.save()
  }
  async check() { await this.read('status') }
  async cancel() { await this.read('cancel') }
  private async read(action: 'status' | 'cancel') {
    if (!this.canCheck || !this.current()) return
    this.busy = true; this.phase = action === 'status' ? 'checking' : 'cancelling'; this.error = undefined; this.emit()
    try {
      const job = await (action === 'status' ? this.deps.client.sttStatus(this.job!.id) : this.deps.client.cancelStt(this.job!.id))
      if (this.current()) this.accept(job)
    } catch (cause) { this.phase = action === 'status' ? 'statusFailed' : 'cancelFailed'; this.error = detail(cause) }
    finally { this.busy = false; this.emit() }
    if (this.canSave) this.save()
  }
  save() {
    if (!this.canSave || !this.current()) return
    this.busy = true; this.phase = 'saving'; this.error = undefined; this.emit()
    try {
      this.next ??= registerTranscriptAsset(this.project, this.draft.sourceId, this.job!)
      if (!this.snapshotDone) { this.deps.snapshot(this.project); this.snapshotDone = true }
      if (!this.current()) return
      const previous = this.project; this.project = this.next
      try { this.deps.persist(this.next) } catch (cause) { this.project = previous; throw cause }
      this.phase = 'saved'
    } catch (cause) { this.phase = 'saveFailed'; this.error = detail(cause) }
    finally { this.busy = false; this.emit() }
  }
}

export interface SttDiscoveryFeedback { phase: 'detecting' | 'modelsReady' | 'noModels' | 'discoveryFailed'; models: string[]; detail?: string }
export class SttModelDiscovery {
  private baseline: string
  private detached = false
  private busy = false
  constructor(project: KinaouProject, private connection: string, private deps: {
    client: Pick<WorkerClient, 'listSttModels'>
    environment: () => Environment
    publish: (feedback: SttDiscoveryFeedback) => void
  }) { this.baseline = JSON.stringify(project) }
  get running() { return this.busy && !this.detached }
  get wasDetached() { return this.detached }
  observe(project: KinaouProject, connection: string) { if (JSON.stringify(project) !== this.baseline || connection !== this.connection) this.detach() }
  detach() { this.detached = true }
  private current() { const value = this.deps.environment(); this.observe(value.project, value.connection); return !this.detached }
  async detect() {
    if (this.busy || !this.current()) return
    this.busy = true; this.deps.publish({ phase: 'detecting', models: [] })
    let result: SttDiscoveryFeedback
    try {
      const models = await this.deps.client.listSttModels()
      if (!Array.isArray(models)) throw Error('Invalid STT model list')
      const unique = [...new Set(models.map(path => assertSttPath(path, 'KINAOU/Models/')))]
      result = { phase: unique.length ? 'modelsReady' : 'noModels', models: unique }
    } catch (cause) { result = { phase: 'discoveryFailed', models: [], detail: detail(cause) } }
    finally { this.busy = false }
    if (this.current()) this.deps.publish(result)
  }
}
