import type { TimelineClip, TimelineTrack } from './project'

export const TIMELINE_MS_PER_PIXEL = 25
export const TIMELINE_GRID_MS = 100
export const TIMELINE_EDGE_SNAP_TOLERANCE_MS = 150

export function timelineMsToPx(milliseconds: number): number {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) throw new Error('Timeline time must be a non-negative finite number')
  return milliseconds / TIMELINE_MS_PER_PIXEL
}

export function timelinePxToMs(pixels: number): number {
  if (!Number.isFinite(pixels)) throw new Error('Timeline distance must be finite')
  return Math.round(pixels * TIMELINE_MS_PER_PIXEL)
}

export function timelineExtentMs(tracks: Pick<TimelineTrack, 'clips'>[]): number {
  return tracks.reduce(
    (maximum, track) => track.clips.reduce(
      (trackMaximum, clip) => Math.max(trackMaximum, clip.startMs + clip.durationMs),
      maximum
    ),
    0
  )
}

export function snapClipStart(
  tracks: Pick<TimelineTrack, 'id' | 'clips'>[],
  trackId: string,
  clip: Pick<TimelineClip, 'id' | 'durationMs'>,
  rawStartMs: number,
  snapping = true
): number {
  if (!Number.isFinite(rawStartMs)) throw new Error('Clip start must be finite')

  const unclamped = Math.max(0, Math.round(rawStartMs))
  if (!snapping) return unclamped

  const edgeCandidates = [0]

  for (const track of tracks) {
    for (const other of track.clips) {
      if (track.id === trackId && other.id === clip.id) continue
      edgeCandidates.push(other.startMs, other.startMs + other.durationMs)
    }
  }

  let nearestEdgeStart: number | null = null
  let nearestEdgeDistance = Number.POSITIVE_INFINITY

  for (const target of edgeCandidates) {
    for (const movingEdgeOffset of [0, clip.durationMs]) {
      const candidateStart = target - movingEdgeOffset
      if (candidateStart < 0) continue

      const distance = Math.abs(candidateStart - unclamped)
      if (distance < nearestEdgeDistance) {
        nearestEdgeDistance = distance
        nearestEdgeStart = candidateStart
      }
    }
  }

  if (nearestEdgeStart !== null && nearestEdgeDistance <= TIMELINE_EDGE_SNAP_TOLERANCE_MS) {
    return nearestEdgeStart
  }

  return Math.max(0, Math.round(unclamped / TIMELINE_GRID_MS) * TIMELINE_GRID_MS)
}
