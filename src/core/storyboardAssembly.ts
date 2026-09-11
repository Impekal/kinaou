import type { KinaouProject, TimelineTrack } from './project'
import { applyTimelineOperation } from './timeline'

const visualTrackTypes = new Set<TimelineTrack['type']>(['video', 'broll', 'image', 'avatar', 'overlay'])

export interface AssembledScene {
  sceneId: string
  title: string
  assetId: string
  startMs: number
  durationMs: number
  trimmedToSource: boolean
  motion?: 'zoom-in' | 'zoom-out'
  crossfadeMs?: number
}

export interface AssemblyOptions {
  /** Give stills a gentle alternating push so a scene run is not a static slideshow. */
  motion?: boolean
  /** Overlap each scene with the previous one and dissolve into it. */
  crossfade?: boolean
}

export const CROSSFADE_MS = 500

export interface SkippedScene {
  sceneId: string
  title: string
  reason: string
}

export interface AssemblyResult {
  project: KinaouProject
  placed: AssembledScene[]
  skipped: SkippedScene[]
}

export function assemblyTargetTracks(project: KinaouProject): TimelineTrack[] {
  return project.tracks.filter((track) => visualTrackTypes.has(track.type))
}

export function fulfilledSceneCount(project: KinaouProject): number {
  return project.storyboard.filter((scene) => Boolean(scene.assetId)).length
}

/**
 * Appends every fulfilled storyboard scene to a visual track, in storyboard order and
 * gapless after whatever the track already holds. Existing clips are never moved or
 * replaced, and a scene whose asset already sits on this track is skipped, so the
 * action can be re-run after new scenes were fulfilled.
 */
export function assembleTimelineFromStoryboard(project: KinaouProject, trackId: string, options: AssemblyOptions = {}): AssemblyResult {
  const track = project.tracks.find((entry) => entry.id === trackId)
  if (!track) throw new Error(`Timeline track not found: ${trackId}`)
  if (!visualTrackTypes.has(track.type)) throw new Error(`Scenes can only be assembled on a visual track, not on ${track.type}`)
  if (track.locked) throw new Error(`"${track.name}" is locked. Unlock it before assembling scenes.`)
  if (!project.storyboard.length) throw new Error('This project has no storyboard scenes yet')

  const placed: AssembledScene[] = []
  const skipped: SkippedScene[] = []
  // A clip knows which scene put it there. Clips from before that was recorded are
  // adopted by their asset, so an older project keeps working and becomes precise.
  const placedScenes = new Set(track.clips.map((clip) => clip.sceneId).filter((id): id is string => Boolean(id)))
  const adoptable = new Map(track.clips.filter((clip) => !clip.sceneId).map((clip) => [clip.assetId, clip.id]))
  let cursorMs = track.clips.reduce((max, clip) => Math.max(max, clip.startMs + clip.durationMs), 0)
  let next = project
  const hadClips = track.clips.length > 0

  for (const scene of project.storyboard) {
    if (!scene.assetId) {
      skipped.push({ sceneId: scene.id, title: scene.title, reason: 'Scene has no visual yet' })
      continue
    }
    if (placedScenes.has(scene.id)) {
      skipped.push({ sceneId: scene.id, title: scene.title, reason: `Its visual is already on "${track.name}"` })
      continue
    }
    const legacyClipId = adoptable.get(scene.assetId)
    if (legacyClipId) {
      next = applyTimelineOperation(next, { type: 'set-clip-scene', trackId, clipId: legacyClipId, sceneId: scene.id })
      adoptable.delete(scene.assetId)
      placedScenes.add(scene.id)
      skipped.push({ sceneId: scene.id, title: scene.title, reason: `Its visual is already on "${track.name}"` })
      continue
    }
    const asset = project.assets.find((entry) => entry.id === scene.assetId)
    if (!asset) {
      skipped.push({ sceneId: scene.id, title: scene.title, reason: 'The assigned visual is missing from this project' })
      continue
    }
    if (asset.offline) {
      skipped.push({ sceneId: scene.id, title: scene.title, reason: 'Its visual is offline — reconnect the media first' })
      continue
    }
    if (!asset.managed || !asset.uri.startsWith('KINAOU/Assets/')) {
      skipped.push({ sceneId: scene.id, title: scene.title, reason: 'Only managed KINAOU media can be placed on the timeline' })
      continue
    }
    if (asset.kind !== 'image' && asset.kind !== 'video') {
      skipped.push({ sceneId: scene.id, title: scene.title, reason: `A ${asset.kind} asset cannot fill a visual scene` })
      continue
    }

    const sourceDuration = typeof asset.metadata.durationMs === 'number' && asset.metadata.durationMs > 0 ? Math.round(asset.metadata.durationMs) : undefined
    // A still image holds the scene for exactly as long as the storyboard asks; a video
    // can never be stretched beyond the footage that actually exists.
    const durationMs = asset.kind === 'image' || sourceDuration === undefined
      ? scene.durationMs
      : Math.min(scene.durationMs, sourceDuration)
    if (durationMs <= 0) {
      skipped.push({ sceneId: scene.id, title: scene.title, reason: 'No usable duration for this scene' })
      continue
    }

    // Every scene after the first one starts inside its predecessor and dissolves in,
    // so the two are on screen together for the overlap — a real cross-dissolve
    // rather than a fade through the black canvas.
    const follows = placed.length > 0 || hadClips
    const crossfadeMs = options.crossfade && follows ? Math.min(CROSSFADE_MS, durationMs) : 0
    const startMs = Math.max(0, cursorMs - crossfadeMs)
    // Stills alternate direction so a long run does not feel mechanical.
    const motion: AssembledScene['motion'] = options.motion && asset.kind === 'image'
      ? (placed.length % 2 === 0 ? 'zoom-in' : 'zoom-out')
      : undefined

    next = applyTimelineOperation(next, {
      type: 'add-clip',
      trackId,
      clip: {
        id: crypto.randomUUID(), assetId: asset.id, startMs, durationMs, sourceOffsetMs: 0, gain: 1, speed: 1,
        sceneId: scene.id,
        ...(motion ? { motion } : {}),
        ...(crossfadeMs ? { transitionIn: { type: 'dissolve' as const, durationMs: crossfadeMs } } : {})
      }
    })
    placed.push({
      sceneId: scene.id,
      title: scene.title,
      assetId: asset.id,
      startMs,
      durationMs,
      trimmedToSource: durationMs < scene.durationMs,
      ...(motion ? { motion } : {}),
      ...(crossfadeMs ? { crossfadeMs } : {})
    })
    placedScenes.add(scene.id)
    cursorMs = startMs + durationMs
  }

  return { project: next, placed, skipped }
}
