import type { KinaouAsset, TimelineClip, TimelineTrack } from './project'
import { clipSpeedFitsSource } from './timeline'

export const TIMELINE_MS_PER_PIXEL = 25
export const TIMELINE_GRID_MS = 100
export const TIMELINE_EDGE_SNAP_TOLERANCE_MS = 150
export const TIMELINE_MIN_CLIP_MS = 250

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

function snapTargets(
  tracks: Pick<TimelineTrack, 'id' | 'clips'>[],
  trackId: string,
  clipId: string
): number[] {
  const values = new Set<number>([0])

  for (const track of tracks) {
    for (const clip of track.clips) {
      if (track.id === trackId && clip.id === clipId) continue
      values.add(clip.startMs)
      values.add(clip.startMs + clip.durationMs)
    }
  }

  return [...values]
}

export function snapTimelinePoint(
  tracks: Pick<TimelineTrack, 'id' | 'clips'>[],
  trackId: string,
  clipId: string,
  rawTimeMs: number,
  snapping = true
): number {
  if (!Number.isFinite(rawTimeMs)) throw new Error('Timeline time must be finite')

  const unclamped = Math.max(0, Math.round(rawTimeMs))
  if (!snapping) return unclamped

  let nearest = 0
  let distance = Number.POSITIVE_INFINITY

  for (const target of snapTargets(tracks, trackId, clipId)) {
    const current = Math.abs(target - unclamped)
    if (current < distance) {
      distance = current
      nearest = target
    }
  }

  if (distance <= TIMELINE_EDGE_SNAP_TOLERANCE_MS) return nearest
  return Math.max(0, Math.round(unclamped / TIMELINE_GRID_MS) * TIMELINE_GRID_MS)
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

  let nearestStart: number | null = null
  let nearestDistance = Number.POSITIVE_INFINITY

  for (const target of snapTargets(tracks, trackId, clip.id)) {
    for (const movingEdgeOffset of [0, clip.durationMs]) {
      const candidateStart = target - movingEdgeOffset
      if (candidateStart < 0) continue

      const distance = Math.abs(candidateStart - unclamped)
      if (distance < nearestDistance) {
        nearestDistance = distance
        nearestStart = candidateStart
      }
    }
  }

  if (nearestStart !== null && nearestDistance <= TIMELINE_EDGE_SNAP_TOLERANCE_MS) {
    return nearestStart
  }

  return Math.max(0, Math.round(unclamped / TIMELINE_GRID_MS) * TIMELINE_GRID_MS)
}

export type TimelineTrimEdge = 'start' | 'end'

export interface TimelineTrimGeometry {
  startMs: number
  durationMs: number
  sourceOffsetMs: number
}

function minimumClipDuration(clip: Pick<TimelineClip, 'fades' | 'transitionIn'>): number {
  return Math.max(
    TIMELINE_MIN_CLIP_MS,
    (clip.fades?.inMs ?? 0) + (clip.fades?.outMs ?? 0),
    clip.transitionIn?.durationMs ?? 0
  )
}

function hasTimedSource(asset: KinaouAsset | undefined): boolean {
  return Boolean(asset && asset.kind !== 'image' && asset.kind !== 'caption')
}

export function trimClipEdge(
  tracks: Pick<TimelineTrack, 'id' | 'clips'>[],
  trackId: string,
  clip: TimelineClip,
  asset: KinaouAsset | undefined,
  edge: TimelineTrimEdge,
  rawEdgeMs: number,
  snapping = true
): TimelineTrimGeometry {
  const minimumDurationMs = minimumClipDuration(clip)
  const snappedEdgeMs = snapTimelinePoint(tracks, trackId, clip.id, rawEdgeMs, snapping)
  const originalEndMs = clip.startMs + clip.durationMs
  const timedSource = hasTimedSource(asset)

  if (edge === 'start') {
    const maximumStartMs = originalEndMs - minimumDurationMs

    let minimumStartMs = 0
    if (timedSource) {
      minimumStartMs = Math.max(
        0,
        Math.ceil(clip.startMs - clip.sourceOffsetMs / clip.speed)
      )
    }

    if (minimumStartMs > maximumStartMs) {
      return {
        startMs: clip.startMs,
        durationMs: clip.durationMs,
        sourceOffsetMs: clip.sourceOffsetMs
      }
    }

    const startMs = Math.min(
      maximumStartMs,
      Math.max(minimumStartMs, snappedEdgeMs)
    )

    const durationMs = originalEndMs - startMs
    const sourceOffsetMs = timedSource
      ? Math.max(0, Math.round(clip.sourceOffsetMs + (startMs - clip.startMs) * clip.speed))
      : clip.sourceOffsetMs

    const proposed = { ...clip, startMs, durationMs, sourceOffsetMs }

    if (!clipSpeedFitsSource(asset, proposed, clip.speed)) {
      return {
        startMs: clip.startMs,
        durationMs: clip.durationMs,
        sourceOffsetMs: clip.sourceOffsetMs
      }
    }

    return { startMs, durationMs, sourceOffsetMs }
  }

  const minimumEndMs = clip.startMs + minimumDurationMs
  let maximumEndMs = Number.POSITIVE_INFINITY

  const sourceDurationMs = typeof asset?.metadata.durationMs === 'number'
    ? asset.metadata.durationMs
    : undefined

  if (timedSource && sourceDurationMs !== undefined) {
    const remainingSourceMs = Math.max(0, sourceDurationMs - clip.sourceOffsetMs)
    maximumEndMs = clip.startMs + Math.floor(remainingSourceMs / clip.speed)
  }

  if (maximumEndMs < minimumEndMs) {
    return {
      startMs: clip.startMs,
      durationMs: clip.durationMs,
      sourceOffsetMs: clip.sourceOffsetMs
    }
  }

  const endMs = Math.max(minimumEndMs, Math.min(maximumEndMs, snappedEdgeMs))
  const durationMs = endMs - clip.startMs
  const proposed = { ...clip, durationMs }

  if (!clipSpeedFitsSource(asset, proposed, clip.speed)) {
    return {
      startMs: clip.startMs,
      durationMs: clip.durationMs,
      sourceOffsetMs: clip.sourceOffsetMs
    }
  }

  return {
    startMs: clip.startMs,
    durationMs,
    sourceOffsetMs: clip.sourceOffsetMs
  }
}
