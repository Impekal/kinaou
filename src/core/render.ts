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
  clipId: string
  asset: KinaouAsset
  startMs: number
  durationMs: number
  sourceOffsetMs: number
  gain: number
  speed: number
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

  for (const track of project.tracks) {
    if (track.muted) continue
    for (const clip of track.clips) {
      const asset = assets.get(clip.assetId)
      if (!asset) throw new Error(`Missing asset for clip ${clip.id}`)
      if (asset.offline) throw new Error(`Asset offline: ${asset.id}`)
      clips.push({
        trackId: track.id,
        trackType: track.type,
        clipId: clip.id,
        asset,
        startMs: clip.startMs,
        durationMs: clip.durationMs,
        sourceOffsetMs: clip.sourceOffsetMs,
        gain: clip.gain,
        speed: clip.speed
      })
      durationMs = Math.max(durationMs, clip.startMs + clip.durationMs)
    }
  }

  clips.sort((a, b) => a.startMs - b.startMs)

  return {
    projectId: project.id,
    outputRelativePath: safeOutput,
    preset,
    durationMs,
    requiredCapabilities: ['filesystem', 'ffmpeg'],
    clips
  }
}
