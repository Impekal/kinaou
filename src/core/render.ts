import type { KinaouAsset, KinaouProject } from './project'
import { assertSafeManagedPath } from './storage'
import type { WorkerCapability } from './workers'

export interface RenderPreset {
  name: string
  container: 'mp4'
  width: number
  height: number
  fps: number
  videoCodec: 'h264' | 'hevc'
  audioCodec: 'aac'
}

export interface RenderClipStep {
  trackId: string
  trackType: string
  trackIndex: number
  clipId: string
  asset: KinaouAsset
  startMs: number
  durationMs: number
  sourceOffsetMs: number
  gain: number
  speed: number
  transform: { x: number; y: number; scale: number; cropLeft: number; cropTop: number; cropRight: number; cropBottom: number }
  transitionIn?: { type: 'dissolve'; durationMs: number }
  fades: { inMs: number; outMs: number }
}

export interface RenderPlan {
  projectId: string
  outputRelativePath: string
  preset: RenderPreset
  durationMs: number
  requiredCapabilities: WorkerCapability[]
  clips: RenderClipStep[]
}

export const preview1080pPreset: RenderPreset = {
  name: '1080p H.264',
  container: 'mp4',
  width: 1920,
  height: 1080,
  fps: 30,
  videoCodec: 'h264',
  audioCodec: 'aac'
}

export function createRenderPlan(project: KinaouProject, preset: RenderPreset, outputRelativePath: string): RenderPlan {
  const safeOutput = assertSafeManagedPath(outputRelativePath)
  if (!safeOutput.startsWith('KINAOU/Renders/')) throw new Error('Render output must stay inside KINAOU/Renders')
  if (preset.width <= 0 || preset.height <= 0 || preset.fps <= 0) throw new Error('Invalid render preset')

  const assets = new Map(project.assets.map((asset) => [asset.id, asset]))
  const clips: RenderClipStep[] = []
  let durationMs = 0

  project.tracks.forEach((track, trackIndex) => {
    if (track.muted) return
    for (const clip of track.clips) {
      const asset = assets.get(clip.assetId)
      if (!asset) throw new Error(`Missing asset for clip ${clip.id}`)
      if (asset.offline) throw new Error(`Asset offline: ${asset.id}`)
      if (clip.speed < 0.25 || clip.speed > 4) throw new Error(`Unsupported speed for clip ${clip.id}`)
      if ((asset.kind === 'image' || asset.kind === 'caption') && clip.speed !== 1) throw new Error(`Speed retiming is only supported for video and audio clips: ${clip.id}`)
      const sourceDuration = clip.durationMs * clip.speed
      const assetDuration = typeof asset.metadata.durationMs === 'number' ? asset.metadata.durationMs : undefined
      if (asset.kind !== 'image' && asset.kind !== 'caption' && assetDuration !== undefined && clip.sourceOffsetMs + sourceDuration > assetDuration + 1) throw new Error(`Retimed source range exceeds asset duration for clip ${clip.id}`)
      clips.push({
        trackId: track.id,
        trackType: track.type,
        trackIndex,
        clipId: clip.id,
        asset,
        startMs: clip.startMs,
        durationMs: clip.durationMs,
        sourceOffsetMs: clip.sourceOffsetMs,
        gain: clip.gain,
        speed: clip.speed,
        transform: { x: 0, y: 0, scale: 1, cropLeft: 0, cropTop: 0, cropRight: 0, cropBottom: 0, ...clip.transform },
        ...(clip.transitionIn ? { transitionIn: clip.transitionIn } : {}),
        fades: { inMs: 0, outMs: 0, ...clip.fades }
      })
      durationMs = Math.max(durationMs, clip.startMs + clip.durationMs)
    }
  })

  clips.sort((a, b) => a.startMs - b.startMs || a.trackIndex - b.trackIndex || a.clipId.localeCompare(b.clipId))

  return {
    projectId: project.id,
    outputRelativePath: safeOutput,
    preset,
    durationMs,
    requiredCapabilities: ['filesystem', 'ffmpeg'],
    clips
  }
}
