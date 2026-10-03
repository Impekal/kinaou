import { z } from 'zod'
import { parseProject, type KinaouProject } from './project'
import { compatibleTracks } from './timelinePlacement'
import { applyTimelineOperation } from './timeline'
import { buildFrameProvenance, hasFrameProvenance } from './frameProvenance'

const requestSchema = z.object({ assetId: z.string().min(1), trackId: z.string().min(1), startMs: z.number().int().min(0), durationMs: z.number().int().positive() }).strict()
export type ImageIntervalRequest = z.infer<typeof requestSchema>
export class ImageIntervalError extends Error {
  constructor(readonly code: 'input' | 'media' | 'track' | 'overlap' | 'stale' | 'ack' | 'save') { super('Image interval: ' + code) }
}
function fail(code: ImageIntervalError['code']): never { throw new ImageIntervalError(code) }

/** Reviewed insertion, never ripple/replace; private prepared bytes survive save-only retries. */
export class ImageIntervalPlacement {
  readonly clipId = crypto.randomUUID()
  readonly review: Readonly<ImageIntervalRequest & { name: string; trackName: string; endMs: number; layered: boolean }>
  private baseline: string
  private active = true
  private running = false
  private done = false
  private snapshotDone = false
  private next: KinaouProject
  constructor(project: KinaouProject, value: ImageIntervalRequest, private scope = '') {
    const parsed = requestSchema.safeParse(value)
    if (!parsed.success) fail('input')
    const request = parsed.data, endMs = request.startMs + request.durationMs
    if (!Number.isSafeInteger(endMs) || endMs > 86400000) fail('input')
    const input = parseProject(project), assets = input.assets.filter(a => a.id === request.assetId), asset = assets[0]
    if (assets.length !== 1 || !asset || asset.kind !== 'image' || !asset.managed || asset.offline || !/^KINAOU\/Assets\/[^\\\x00-\x1f\x7f]+$/.test(asset.uri) || asset.uri.split('/').some(p => !p || p === '.' || p === '..')) fail('media')
    if (hasFrameProvenance(asset)) { try { buildFrameProvenance(input, asset.id, 'en') } catch { fail('media') } }
    const tracks = input.tracks.filter(t => t.id === request.trackId), track = tracks[0]
    if (tracks.length !== 1 || !track || track.locked || track.muted || !compatibleTracks(input, asset).some(t => t.id === track.id)) fail('track')
    const overlaps = (c: KinaouProject['tracks'][number]['clips'][number]) => c.startMs < endMs && c.startMs + c.durationMs > request.startMs
    if (track.clips.some(overlaps)) fail('overlap')
    this.review = Object.freeze({ ...request, endMs, name: String(asset.metadata.name ?? asset.id), trackName: track.name,
      layered: input.tracks.some(t => t.id !== track.id && !t.muted && ['video', 'broll', 'image', 'avatar', 'overlay'].includes(t.type) && t.clips.some(overlaps)) })
    this.baseline = JSON.stringify(project)
    this.next = parseProject(applyTimelineOperation(input, { type: 'add-clip', trackId: track.id, clip: { id: this.clipId, assetId: asset.id, startMs: request.startMs, durationMs: request.durationMs, sourceOffsetMs: 0, speed: 1, gain: 1 } }))
  }
  observe(project: KinaouProject, scope = '') { if (JSON.stringify(project) !== this.baseline || scope !== this.scope) this.active = false }
  get current() { return this.active && !this.done }
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
