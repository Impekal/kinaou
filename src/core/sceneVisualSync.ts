import type { KinaouAsset, KinaouProject, TimelineClip, TimelineTrack } from './project'
import { applyTimelineOperation } from './timeline'

/** A scene whose clip on the timeline still shows the visual it was given before. */
export interface OutdatedSceneVisual {
  sceneId: string
  title: string
  clipId: string
  startMs: number
  /** What the clip shows now. */
  currentAssetId: string
  /** What the storyboard says the scene is fulfilled with. */
  sceneAssetId: string
  /** The length the swapped clip will have. */
  durationMs: number
  /** True when the replacement is shorter than the clip it fills. */
  trimmedToSource: boolean
}

export interface SkippedSceneVisual {
  sceneId: string
  title: string
  reason: string
}

export interface SceneVisualSyncResult {
  project: KinaouProject
  updated: OutdatedSceneVisual[]
  skipped: SkippedSceneVisual[]
}

function usableVisual(asset: KinaouAsset | undefined): string | undefined {
  if (!asset) return 'The assigned visual is missing from this project'
  if (asset.offline) return 'Its visual is offline — reconnect the media first'
  if (!asset.managed || !asset.uri.startsWith('KINAOU/Assets/')) return 'Only managed KINAOU media can be placed on the timeline'
  if (asset.kind !== 'image' && asset.kind !== 'video') return `A ${asset.kind} asset cannot fill a visual scene`
  return undefined
}

/**
 * A video can only fill as much of the clip as it actually has footage for; a still
 * fills whatever length the clip already has, which may be longer than the storyboard
 * asked for because the scene was fitted to its narration.
 */
function fittedDuration(asset: KinaouAsset, clip: TimelineClip): number {
  const sourceMs = typeof asset.metadata.durationMs === 'number' && asset.metadata.durationMs > 0 ? Math.round(asset.metadata.durationMs) : undefined
  if (asset.kind === 'image' || sourceMs === undefined) return clip.durationMs
  // A retimed clip eats its source faster, so the cap is measured in timeline time.
  return Math.min(clip.durationMs, Math.floor(sourceMs / (clip.speed || 1)))
}

function requireTrack(project: KinaouProject, trackId: string): TimelineTrack {
  const track = project.tracks.find((entry) => entry.id === trackId)
  if (!track) throw new Error(`Timeline track not found: ${trackId}`)
  return track
}

/**
 * Finds the scenes whose visual was replaced after they were assembled. Their clip is
 * still on the timeline showing the old media — without this, assembling again would
 * append the new visual at the end instead of putting it where the scene is.
 */
export function planSceneVisualSync(project: KinaouProject, trackId: string): { outdated: OutdatedSceneVisual[]; skipped: SkippedSceneVisual[] } {
  const track = requireTrack(project, trackId)
  const outdated: OutdatedSceneVisual[] = []
  const skipped: SkippedSceneVisual[] = []

  for (const scene of project.storyboard) {
    const clip = track.clips.find((entry) => entry.sceneId === scene.id)
    if (!clip) continue
    if (!scene.assetId) {
      skipped.push({ sceneId: scene.id, title: scene.title, reason: 'The scene was cleared — remove its clip yourself if you no longer want it' })
      continue
    }
    if (clip.assetId === scene.assetId) continue
    const asset = project.assets.find((entry) => entry.id === scene.assetId)
    const reason = usableVisual(asset)
    if (reason || !asset) {
      skipped.push({ sceneId: scene.id, title: scene.title, reason: reason ?? 'The assigned visual is missing from this project' })
      continue
    }
    const durationMs = fittedDuration(asset, clip)
    if (durationMs <= 0) {
      skipped.push({ sceneId: scene.id, title: scene.title, reason: 'No usable duration for this scene' })
      continue
    }
    outdated.push({
      sceneId: scene.id,
      title: scene.title,
      clipId: clip.id,
      startMs: clip.startMs,
      currentAssetId: clip.assetId,
      sceneAssetId: asset.id,
      durationMs,
      trimmedToSource: durationMs < clip.durationMs
    })
  }

  return { outdated, skipped }
}

/**
 * Swaps each outdated clip's media in place. The scene keeps where it sits and how long
 * it runs, so narration, captions and cross-dissolves around it stay valid; only what is
 * on screen changes. Settings the new media cannot carry are dropped rather than left to
 * fail at render time: motion belongs to stills, retiming does not.
 */
export function syncSceneVisuals(project: KinaouProject, trackId: string): SceneVisualSyncResult {
  const track = requireTrack(project, trackId)
  const { outdated, skipped } = planSceneVisualSync(project, trackId)
  if (!outdated.length) return { project, updated: [], skipped }
  if (track.locked) throw new Error(`"${track.name}" is locked. Unlock it before updating its scenes.`)

  let next = project
  for (const entry of outdated) {
    const asset = project.assets.find((item) => item.id === entry.sceneAssetId)!
    const clip = track.clips.find((item) => item.id === entry.clipId)!
    next = applyTimelineOperation(next, { type: 'set-clip-asset', trackId, clipId: entry.clipId, assetId: asset.id })
    if (entry.durationMs !== clip.durationMs) {
      next = applyTimelineOperation(next, { type: 'trim-clip', trackId, clipId: entry.clipId, startMs: clip.startMs, durationMs: entry.durationMs, sourceOffsetMs: 0 })
    }
    if (asset.kind !== 'image' && clip.motion) {
      next = applyTimelineOperation(next, { type: 'set-clip-motion', trackId, clipId: entry.clipId })
    }
    if (asset.kind === 'image' && clip.speed !== 1) {
      next = applyTimelineOperation(next, { type: 'set-clip-speed', trackId, clipId: entry.clipId, speed: 1 })
    }
    if (clip.transitionIn && clip.transitionIn.durationMs > entry.durationMs) {
      // A dissolve cannot be longer than the clip it opens, and below 100ms there is
      // nothing left to dissolve, so the shorter scene simply cuts in.
      next = applyTimelineOperation(next, entry.durationMs >= 100
        ? { type: 'set-clip-transition', trackId, clipId: entry.clipId, transitionIn: { type: 'dissolve', durationMs: entry.durationMs } }
        : { type: 'set-clip-transition', trackId, clipId: entry.clipId })
    }
    if (clip.fades && clip.fades.inMs + clip.fades.outMs > entry.durationMs) {
      next = applyTimelineOperation(next, { type: 'set-clip-fades', trackId, clipId: entry.clipId, fades: { inMs: 0, outMs: 0 } })
    }
  }

  return { project: next, updated: outdated, skipped }
}
