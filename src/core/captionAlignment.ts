import type { KinaouProject, TimelineClip, TimelineTrack } from './project'
import { applyTimelineOperation } from './timeline'

/** Captions of one scene that no longer sit over the scene they belong to. */
export interface DriftedCaptions {
  sceneId: string
  title: string
  captions: number
  /** Where the captions currently run. */
  fromStartMs: number
  fromDurationMs: number
  /** Where the scene they belong to now runs. */
  toStartMs: number
  toDurationMs: number
}

export interface SkippedCaptionAlignment {
  sceneId: string
  title: string
  reason: string
}

export interface CaptionAlignmentResult {
  project: KinaouProject
  realigned: DriftedCaptions[]
  skipped: SkippedCaptionAlignment[]
}

/** Below this a caption is on screen too briefly to be read at all. */
const MIN_CAPTION_MS = 300

function sceneClip(track: TimelineTrack, sceneId: string, assetId: string | undefined): TimelineClip | undefined {
  return track.clips.find((clip) => clip.sceneId === sceneId)
    ?? (assetId ? track.clips.find((clip) => !clip.sceneId && clip.assetId === assetId) : undefined)
}

function captionClipsOfScene(project: KinaouProject, captionTrack: TimelineTrack, sceneId: string): TimelineClip[] {
  const assetIds = new Set(project.assets
    .filter((asset) => asset.kind === 'caption' && String(asset.metadata.sceneId ?? '') === sceneId)
    .map((asset) => asset.id))
  return captionTrack.clips.filter((clip) => assetIds.has(clip.assetId)).sort((left, right) => left.startMs - right.startMs)
}

/**
 * Stretches one scene's captions from the span they were written for into the span the
 * scene occupies now, keeping their order and their relative widths. The text is never
 * touched: re-timing is a timing change, not a rewrite.
 */
function restretch(clips: TimelineClip[], fromStartMs: number, fromDurationMs: number, toStartMs: number, toDurationMs: number): Array<{ clip: TimelineClip; startMs: number; durationMs: number }> {
  const scale = toDurationMs / fromDurationMs
  const moved = clips.map((clip) => {
    const startMs = Math.max(0, Math.round(toStartMs + (clip.startMs - fromStartMs) * scale))
    return { clip, startMs, durationMs: Math.max(1, Math.round(clip.durationMs * scale)) }
  })
  // The last caption ends exactly where the scene does, so rounding cannot leave a gap
  // or let a caption hang over the scene that follows.
  const last = moved[moved.length - 1]
  last.durationMs = Math.max(1, toStartMs + toDurationMs - last.startMs)
  return moved
}

/**
 * Finds the scenes whose captions no longer line up with their visual — because the
 * scene was stretched to cover its narration, or its footage turned out shorter than
 * the clip it replaced. Changes nothing.
 */
export function planCaptionAlignment(project: KinaouProject, visualTrackId: string): { drifted: DriftedCaptions[]; skipped: SkippedCaptionAlignment[] } {
  const visualTrack = project.tracks.find((track) => track.id === visualTrackId)
  if (!visualTrack) throw new Error(`Timeline track not found: ${visualTrackId}`)
  const captionTrack = project.tracks.find((track) => track.type === 'caption')
  if (!captionTrack) throw new Error('Project has no caption track')

  const drifted: DriftedCaptions[] = []
  const skipped: SkippedCaptionAlignment[] = []

  for (const scene of project.storyboard) {
    const captions = captionClipsOfScene(project, captionTrack, scene.id)
    if (!captions.length) continue
    const clip = sceneClip(visualTrack, scene.id, scene.assetId)
    if (!clip) {
      skipped.push({ sceneId: scene.id, title: scene.title, reason: `Its visual is not on "${visualTrack.name}", so there is nothing to align to` })
      continue
    }
    const fromStartMs = captions[0].startMs
    const fromDurationMs = Math.max(...captions.map((entry) => entry.startMs + entry.durationMs)) - fromStartMs
    if (fromDurationMs <= 0) {
      skipped.push({ sceneId: scene.id, title: scene.title, reason: 'Its captions have no span to stretch from' })
      continue
    }
    if (fromStartMs === clip.startMs && fromDurationMs === clip.durationMs) continue
    if (clip.durationMs < captions.length * MIN_CAPTION_MS) {
      skipped.push({ sceneId: scene.id, title: scene.title, reason: `${captions.length} captions cannot be read in ${(clip.durationMs / 1000).toFixed(1)}s — shorten the text or lengthen the scene` })
      continue
    }
    drifted.push({
      sceneId: scene.id,
      title: scene.title,
      captions: captions.length,
      fromStartMs,
      fromDurationMs,
      toStartMs: clip.startMs,
      toDurationMs: clip.durationMs
    })
  }

  return { drifted, skipped }
}

/**
 * Moves each scene's captions back over the scene they belong to. Only their timing
 * changes, so an edited caption keeps the words the editor gave it.
 */
export function alignCaptionsToScenes(project: KinaouProject, visualTrackId: string): CaptionAlignmentResult {
  const { drifted, skipped } = planCaptionAlignment(project, visualTrackId)
  if (!drifted.length) return { project, realigned: [], skipped }
  const captionTrack = project.tracks.find((track) => track.type === 'caption')!
  if (captionTrack.locked) throw new Error(`"${captionTrack.name}" is locked. Unlock it before realigning captions.`)

  let next = project
  for (const entry of drifted) {
    const captions = captionClipsOfScene(project, captionTrack, entry.sceneId)
    for (const moved of restretch(captions, entry.fromStartMs, entry.fromDurationMs, entry.toStartMs, entry.toDurationMs)) {
      next = applyTimelineOperation(next, {
        type: 'trim-clip',
        trackId: captionTrack.id,
        clipId: moved.clip.id,
        startMs: moved.startMs,
        durationMs: moved.durationMs,
        sourceOffsetMs: 0
      })
    }
  }

  return { project: next, realigned: drifted, skipped }
}
