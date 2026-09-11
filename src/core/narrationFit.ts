import type { KinaouAsset, KinaouProject, TimelineClip, TimelineTrack } from './project'
import { applyTimelineOperation } from './timeline'

/** A scene whose narration runs past the picture underneath it. */
export interface NarrationOverrun {
  sceneId: string
  title: string
  clipId: string
  startMs: number
  clipDurationMs: number
  narrationEndMs: number
  /** How much longer the narration is than its visual. */
  overrunMs: number
  /** How much of that overrun the visual can actually absorb. */
  extendableMs: number
  /** Why the visual cannot cover the whole overrun, when it cannot. */
  limit?: string
}

export interface NarrationFitResult {
  project: KinaouProject
  /** Scenes whose visual was lengthened, `extendableMs` being the amount granted. */
  fitted: NarrationOverrun[]
  /** Scenes that still overrun afterwards, each carrying the reason in `limit`. */
  remaining: NarrationOverrun[]
  /** How much longer the timeline became in total. */
  addedMs: number
}

interface SceneRegion {
  sceneId: string
  startMs: number
  grantedMs: number
}

function narrationEnd(project: KinaouProject, voiceTrack: TimelineTrack, sceneId: string): number | undefined {
  const assetIds = new Set(project.assets
    .filter((asset) => asset.kind === 'audio' && String(asset.metadata.sceneId ?? '') === sceneId)
    .map((asset) => asset.id))
  if (!assetIds.size) return undefined
  const ends = voiceTrack.clips.filter((clip) => assetIds.has(clip.assetId)).map((clip) => clip.startMs + clip.durationMs)
  return ends.length ? Math.max(...ends) : undefined
}

/**
 * How much longer this clip may run before it outlives its source. A still has no
 * source length to outlive; footage of unknown length is left alone rather than
 * stretched into frozen frames nobody asked for.
 */
function extendableBy(asset: KinaouAsset | undefined, clip: TimelineClip): { ms: number; limit?: string } {
  if (!asset) return { ms: 0, limit: 'Its asset is missing from the project' }
  if (asset.kind === 'image') return { ms: Number.POSITIVE_INFINITY }
  const sourceMs = typeof asset.metadata.durationMs === 'number' ? asset.metadata.durationMs : undefined
  if (sourceMs === undefined) return { ms: 0, limit: 'The source length of this footage is unknown, so it cannot be extended safely' }
  const speed = clip.speed || 1
  const spare = Math.max(0, Math.floor((sourceMs - clip.sourceOffsetMs - clip.durationMs * speed) / speed))
  // The reason travels with the ceiling even when some room is left: a partial
  // extension needs to say why it stopped just as much as a refused one does.
  return { ms: spare, limit: 'The footage runs out before the narration does' }
}

function sceneClips(project: KinaouProject, visualTrack: TimelineTrack): { sceneId: string; title: string; clip: TimelineClip }[] {
  const seen = new Set<string>()
  const found: { sceneId: string; title: string; clip: TimelineClip }[] = []
  for (const scene of project.storyboard) {
    if (!scene.assetId) continue
    // The stamp decides which clip is this scene's; a clip carrying no stamp at all —
    // placed before scenes were recorded — is matched by its media instead.
    const clip = visualTrack.clips.find((entry) => entry.sceneId === scene.id)
      ?? visualTrack.clips.find((entry) => !entry.sceneId && entry.assetId === scene.assetId && !seen.has(entry.id))
    if (!clip) continue
    seen.add(clip.id)
    found.push({ sceneId: scene.id, title: scene.title, clip })
  }
  return found.sort((left, right) => left.clip.startMs - right.clip.startMs)
}

function requireTracks(project: KinaouProject, visualTrackId: string, voiceTrackId: string): { visualTrack: TimelineTrack; voiceTrack: TimelineTrack } {
  const visualTrack = project.tracks.find((track) => track.id === visualTrackId)
  if (!visualTrack) throw new Error(`Timeline track not found: ${visualTrackId}`)
  const voiceTrack = project.tracks.find((track) => track.id === voiceTrackId)
  if (!voiceTrack) throw new Error(`Timeline track not found: ${voiceTrackId}`)
  return { visualTrack, voiceTrack }
}

/**
 * Lists every scene whose narration is longer than its visual, in timeline order,
 * together with how much of that the visual could absorb. Changes nothing.
 */
export function planNarrationFit(project: KinaouProject, visualTrackId: string, voiceTrackId: string): NarrationOverrun[] {
  const { visualTrack, voiceTrack } = requireTracks(project, visualTrackId, voiceTrackId)
  const overruns: NarrationOverrun[] = []
  for (const scene of sceneClips(project, visualTrack)) {
    const endMs = narrationEnd(project, voiceTrack, scene.sceneId)
    if (endMs === undefined) continue
    const overrunMs = endMs - (scene.clip.startMs + scene.clip.durationMs)
    if (overrunMs <= 0) continue
    const { ms, limit } = extendableBy(project.assets.find((entry) => entry.id === scene.clip.assetId), scene.clip)
    const extendableMs = Math.min(overrunMs, ms)
    overruns.push({
      sceneId: scene.sceneId,
      title: scene.title,
      clipId: scene.clip.id,
      startMs: scene.clip.startMs,
      clipDurationMs: scene.clip.durationMs,
      narrationEndMs: endMs,
      overrunMs,
      extendableMs,
      ...(extendableMs < overrunMs && limit ? { limit } : {})
    })
  }
  return overruns
}

/**
 * Every scene absorbs its grant at its own end, so a clip moves by the grants of all
 * scenes that start before the scene it sits in — never by its own scene's grant,
 * which is added behind it.
 */
function shiftTable(regions: SceneRegion[]): (startMs: number) => number {
  return (startMs: number) => {
    let shift = 0
    for (let index = 0; index < regions.length; index += 1) {
      const region = regions[index]
      if (region.startMs > startMs) break
      const nextStart = index + 1 < regions.length ? regions[index + 1].startMs : Number.POSITIVE_INFINITY
      if (startMs < nextStart) break
      shift += region.grantedMs
    }
    return shift
  }
}

/**
 * Extends every overrunning scene visual so it covers its narration, and pushes
 * everything that sits in a later scene by the same amount, so no clip is overwritten
 * and the cross-dissolve overlaps stay exactly as wide as they were. Narration is
 * never shortened: the picture adapts to the words, not the other way round.
 */
export function fitScenesToNarration(project: KinaouProject, visualTrackId: string, voiceTrackId: string): NarrationFitResult {
  const { visualTrack } = requireTracks(project, visualTrackId, voiceTrackId)
  const overruns = planNarrationFit(project, visualTrackId, voiceTrackId)
  const grants = overruns.filter((entry) => entry.extendableMs > 0)
  if (!grants.length) return { project, fitted: [], remaining: overruns, addedMs: 0 }
  if (visualTrack.locked) throw new Error(`"${visualTrack.name}" is locked. Unlock it before fitting scenes to the narration.`)

  const granted = new Map(grants.map((entry) => [entry.sceneId, entry.extendableMs]))
  const regions: SceneRegion[] = sceneClips(project, visualTrack)
    .map((scene) => ({ sceneId: scene.sceneId, startMs: scene.clip.startMs, grantedMs: granted.get(scene.sceneId) ?? 0 }))
  const shiftFor = shiftTable(regions)

  const moves = project.tracks.flatMap((track) => track.clips
    .map((clip) => ({ track, clip, shift: shiftFor(clip.startMs) }))
    .filter((entry) => entry.shift > 0))
  const blocked = [...new Set(moves.filter((entry) => entry.track.locked).map((entry) => entry.track.name))]
  if (blocked.length) throw new Error(`Fitting would move clips on a locked track: ${blocked.join(', ')}. Unlock it first.`)

  let next = project
  for (const move of moves) {
    next = applyTimelineOperation(next, { type: 'move-clip', trackId: move.track.id, clipId: move.clip.id, startMs: move.clip.startMs + move.shift })
  }
  for (const grant of grants) {
    const clip = visualTrack.clips.find((entry) => entry.id === grant.clipId)!
    next = applyTimelineOperation(next, {
      type: 'trim-clip',
      trackId: visualTrackId,
      clipId: grant.clipId,
      startMs: clip.startMs + shiftFor(clip.startMs),
      durationMs: clip.durationMs + grant.extendableMs,
      sourceOffsetMs: clip.sourceOffsetMs
    })
  }

  return {
    project: next,
    fitted: grants,
    remaining: planNarrationFit(next, visualTrackId, voiceTrackId),
    addedMs: grants.reduce((total, entry) => total + entry.extendableMs, 0)
  }
}
