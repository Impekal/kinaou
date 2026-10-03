import { z } from 'zod'
import { parseProject, type KinaouProject } from './project'
import { compatibleTracks } from './timelinePlacement'
import { applyTimelineOperation } from './timeline'
import { buildSourceProvenance } from './sourceProvenance'
import { createRenderPlan, formatProfiles, projectTargetFormat } from './render'
import { defaultAudioDucking } from './audioDucking'

const requestSchema = z.object({ assetId: z.string().min(1), trackId: z.string().min(1), sourceInMs: z.number().int().min(0).max(86400000),
  sourceOutMs: z.number().int().positive().max(86400000), timelineInMs: z.number().int().min(0).max(86400000),
  speed: z.number().min(0.25).max(4), includeAudio: z.boolean() }).strict()
export type MediaExcerptRequest = z.infer<typeof requestSchema>
export type MediaExcerptErrorCode = 'input' | 'media' | 'track' | 'range' | 'precision' | 'overlap' | 'stale' | 'ack' | 'save' | 'previewLength'
export class MediaExcerptError extends Error {
  constructor(readonly code: MediaExcerptErrorCode) { super('Media excerpt: ' + code) }
}
function fail(code: MediaExcerptErrorCode): never { throw new MediaExcerptError(code) }
export function parseExcerptSeconds(value: string): number {
  const normalized = value.trim().replace(',', '.')
  if (!/^\d+(?:\.\d{1,3})?$/.test(normalized)) fail('input')
  const ms = Math.round(Number(normalized) * 1000)
  if (!Number.isSafeInteger(ms) || ms > 86400000) fail('input')
  return ms
}
function plan(project: KinaouProject, value: MediaExcerptRequest) {
  const parsed = requestSchema.safeParse(value)
  if (!parsed.success) fail('input')
  const request = parsed.data, input = parseProject(project), matches = input.assets.filter(a => a.id === request.assetId)
  const asset = matches[0]
  if (matches.length !== 1 || !asset || !['video', 'audio'].includes(asset.kind) || !asset.managed || asset.offline || !/^KINAOU\/Assets\/[^\\]+$/.test(asset.uri) || asset.uri.split('/').some(p => !p || p === '.' || p === '..')) fail('media')
  const duration = asset.metadata.durationMs
  if (typeof duration !== 'number' || !Number.isFinite(duration) || duration <= 0 || duration > 86400000) fail('media')
  if (asset.metadata.sourceImport !== undefined) {
    try {
      const report = JSON.parse(buildSourceProvenance(input, asset.id, 'en').files.json.text)
      if (Math.abs(report.acquisition.result.probe.durationMs - duration) > 1) fail('media')
    } catch { fail('media') }
  }
  const tracks = compatibleTracks(input, asset).filter(t => t.id === request.trackId), track = tracks[0]
  if (tracks.length !== 1 || !track || track.locked || track.muted) fail('track')
  if (request.sourceOutMs <= request.sourceInMs || request.sourceOutMs > duration) fail('range')
  const requestedDuration = (request.sourceOutMs - request.sourceInMs) / request.speed, durationMs = Math.round(requestedDuration)
  // Do not silently shift the reviewed source boundary to accommodate timeline precision.
  if (Math.abs(requestedDuration - durationMs) > 1e-7 || durationMs < 1) fail('precision')
  const endMs = request.timelineInMs + durationMs
  if (!Number.isSafeInteger(endMs) || endMs > 86400000) fail('range')
  if (track.clips.some(c => c.startMs < endMs && c.startMs + c.durationMs > request.timelineInMs)) fail('overlap')
  return { input, request, name: String(asset.metadata.name ?? asset.id), trackName: track.name, durationMs, endMs, sourceDurationMs: duration,
    gain: asset.kind === 'video' || request.includeAudio ? 1 : 0, layered: input.tracks.some(t => t.id !== track.id && !t.muted && t.clips.some(c => c.startMs < endMs && c.startMs + c.durationMs > request.timelineInMs)) }
}

/** Non-destructive prepared clip; one snapshot and stable bytes across synchronous save-only retries. */
export class MediaExcerptPlacement {
  readonly review: Readonly<Omit<ReturnType<typeof plan>, 'input' | 'request'> & MediaExcerptRequest>
  readonly clipId = crypto.randomUUID()
  private baseline: string
  private scope: string
  private active = true
  private running = false
  private done = false
  private snapshotDone = false
  private next: KinaouProject
  constructor(project: KinaouProject, request: MediaExcerptRequest, scope = '') {
    const { input, request: accepted, ...facts } = plan(project, request)
    this.review = Object.freeze({ ...facts, ...accepted })
    this.baseline = JSON.stringify(project); this.scope = scope
    this.next = parseProject(applyTimelineOperation(input, { type: 'add-clip', trackId: accepted.trackId, clip: { id: this.clipId, assetId: accepted.assetId,
      startMs: accepted.timelineInMs, durationMs: facts.durationMs, sourceOffsetMs: accepted.sourceInMs, speed: accepted.speed, gain: facts.gain,
      ...(input.assets.find(a => a.id === accepted.assetId)!.kind === 'video' ? { embeddedAudio: accepted.includeAudio } : {}) } }))
  }
  observe(project: KinaouProject, scope = '') { if (JSON.stringify(project) !== this.baseline || scope !== this.scope) this.active = false }
  get current() { return this.active && !this.done }
  /** Read-only source audition, not a project composition or finished export. */
  preview(project: KinaouProject, scope = '') {
    this.observe(project, scope)
    if (!this.current) fail('stale')
    if (this.review.durationMs > 60000) fail('previewLength')
    const isolated = structuredClone(this.next)
    const track = isolated.tracks.find(t => t.id === this.review.trackId)!
    const clip = track.clips.find(c => c.id === this.clipId)!
    clip.startMs = 0
    isolated.tracks = [{ ...track, clips: [clip] }]
    isolated.assets = isolated.assets.filter(a => a.id === clip.assetId)
    // Contain the full source; final project framing/mixing is a separate review.
    return createRenderPlan(isolated, { ...formatProfiles[projectTargetFormat(project)].preview, fit: 'contain' }, 'KINAOU/Cache/Previews/media-excerpt.mp4', { audioDucking: { ...defaultAudioDucking, enabled: false } })
  }
  commit(project: KinaouProject, scope: string, acknowledged: boolean, snapshot: (p: KinaouProject) => unknown, persist: (p: KinaouProject) => unknown) {
    this.observe(project, scope)
    if (!acknowledged) fail('ack')
    if (!this.current || this.running) fail('stale')
    this.running = true
    try {
      if (!this.snapshotDone) { if (snapshot(structuredClone(project)) === false) fail('save'); this.snapshotDone = true }
      if (persist(structuredClone(this.next)) === false) fail('save')
      this.done = true
      return structuredClone(this.next)
    } finally { this.running = false }
  }
}
