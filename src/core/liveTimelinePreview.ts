import type { KinaouProject, TimelineClip } from './project'
import { interpolateTransformKeyframes } from './timeline'

const visualTrackTypes = new Set(['video', 'broll', 'image', 'avatar', 'overlay'])

export interface LiveVisualLayer {
  trackId: string
  trackIndex: number
  clipId: string
  assetId: string
  kind: 'video' | 'image'
  path?: string
  startMs: number
  durationMs: number
  localTimeMs: number
  sourceTimeMs: number
  x: number
  y: number
  scale: number
  opacity: number
}

function transformAt(clip: TimelineClip, localTimeMs: number): { x: number; y: number; scale: number } {
  const base = {
    x: clip.transform?.x ?? 0,
    y: clip.transform?.y ?? 0,
    scale: clip.transform?.scale ?? 1
  }

  if (!clip.transformKeyframes) return base

  return interpolateTransformKeyframes(
    clip.transformKeyframes,
    clip.durationMs > 0 ? localTimeMs / clip.durationMs : 0
  )
}

function motionScaleAt(clip: TimelineClip, localTimeMs: number): number {
  if (!clip.motion || clip.durationMs <= 0) return 1

  const progress = Math.max(0, Math.min(1, localTimeMs / clip.durationMs))
  const amount = 0.18

  return clip.motion === 'zoom-in'
    ? 1 + amount * progress
    : 1 + amount * (1 - progress)
}

function opacityAt(clip: TimelineClip, localTimeMs: number): number {
  const fadeInMs = clip.transitionIn?.durationMs ?? clip.fades?.inMs ?? 0
  const fadeOutMs = clip.fades?.outMs ?? 0

  let opacity = 1

  if (fadeInMs > 0 && localTimeMs < fadeInMs) {
    opacity = Math.min(opacity, localTimeMs / fadeInMs)
  }

  if (fadeOutMs > 0 && localTimeMs > clip.durationMs - fadeOutMs) {
    opacity = Math.min(opacity, (clip.durationMs - localTimeMs) / fadeOutMs)
  }

  return Math.max(0, Math.min(1, opacity))
}

export function liveVisualLayers(project: KinaouProject, playheadMs: number): LiveVisualLayer[] {
  const boundedPlayheadMs = Math.max(0, Math.round(playheadMs))

  return project.tracks.flatMap((track, trackIndex) => {
    if (track.muted || !visualTrackTypes.has(track.type)) return []

    return track.clips.flatMap((clip): LiveVisualLayer[] => {
      const clipEndMs = clip.startMs + clip.durationMs
      if (boundedPlayheadMs < clip.startMs || boundedPlayheadMs >= clipEndMs) return []

      const asset = project.assets.find((candidate) => candidate.id === clip.assetId)
      if (!asset || asset.offline || (asset.kind !== 'video' && asset.kind !== 'image')) return []

      const localTimeMs = boundedPlayheadMs - clip.startMs
      const transform = transformAt(clip, localTimeMs)
      const motionScale = asset.kind === 'image' ? motionScaleAt(clip, localTimeMs) : 1
      const path = asset.kind === 'video'
        ? (typeof asset.metadata.proxyPath === 'string' ? asset.metadata.proxyPath : undefined)
        : (typeof asset.metadata.thumbnailPath === 'string' ? asset.metadata.thumbnailPath : undefined)

      return [{
        trackId: track.id,
        trackIndex,
        clipId: clip.id,
        assetId: asset.id,
        kind: asset.kind,
        ...(path ? { path } : {}),
        startMs: clip.startMs,
        durationMs: clip.durationMs,
        localTimeMs,
        sourceTimeMs: asset.kind === 'video'
          ? clip.sourceOffsetMs + localTimeMs * clip.speed
          : localTimeMs,
        x: transform.x,
        y: transform.y,
        scale: transform.scale * motionScale,
        opacity: opacityAt(clip, localTimeMs)
      }]
    })
  }).sort((a, b) => a.trackIndex - b.trackIndex || a.clipId.localeCompare(b.clipId))
}

export function liveLayerCss(layer: Pick<LiveVisualLayer, 'x' | 'y' | 'scale' | 'opacity'>) {
  return {
    left: `${50 + layer.x / 9.6}%`,
    top: `${50 + layer.y / 5.4}%`,
    transform: `translate(-50%, -50%) scale(${layer.scale})`,
    opacity: layer.opacity
  }
}
