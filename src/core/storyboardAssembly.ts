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
}

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
export function assembleTimelineFromStoryboard(project: KinaouProject, trackId: string): AssemblyResult {
  const track = project.tracks.find((entry) => entry.id === trackId)
  if (!track) throw new Error(`Timeline track not found: ${trackId}`)
  if (!visualTrackTypes.has(track.type)) throw new Error(`Scenes can only be assembled on a visual track, not on ${track.type}`)
  if (track.locked) throw new Error(`"${track.name}" is locked. Unlock it before assembling scenes.`)
  if (!project.storyboard.length) throw new Error('This project has no storyboard scenes yet')

  const placed: AssembledScene[] = []
  const skipped: SkippedScene[] = []
  const alreadyPlaced = new Set(track.clips.map((clip) => clip.assetId))
  let cursorMs = track.clips.reduce((max, clip) => Math.max(max, clip.startMs + clip.durationMs), 0)
  let next = project

  for (const scene of project.storyboard) {
    if (!scene.assetId) {
      skipped.push({ sceneId: scene.id, title: scene.title, reason: 'Scene has no visual yet' })
      continue
    }
    if (alreadyPlaced.has(scene.assetId)) {
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

    next = applyTimelineOperation(next, {
      type: 'add-clip',
      trackId,
      clip: { id: crypto.randomUUID(), assetId: asset.id, startMs: cursorMs, durationMs, sourceOffsetMs: 0, gain: 1, speed: 1 }
    })
    placed.push({
      sceneId: scene.id,
      title: scene.title,
      assetId: asset.id,
      startMs: cursorMs,
      durationMs,
      trimmedToSource: durationMs < scene.durationMs
    })
    alreadyPlaced.add(asset.id)
    cursorMs += durationMs
  }

  return { project: next, placed, skipped }
}
