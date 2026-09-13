import { touchProject, type KinaouAsset, type KinaouProject } from './project'
import { assertSafeManagedPath } from './storage'
import type { WorkerCapability } from './workers'
import { defaultAudioDucking, validateAudioDucking, type AudioDuckingSettings } from './audioDucking'
import { defaultLoudnessNormalization, validateLoudnessNormalization, type LoudnessNormalizationSettings } from './audioLoudness'

export interface RenderPreset {
  name: string
  container: 'mp4'
  width: number
  height: number
  fps: number
  videoCodec: 'h264' | 'hevc'
  audioCodec: 'aac'
  /**
   * How source material meets a canvas of a different aspect ratio.
   * `contain` (default) keeps every pixel and letterboxes; `cover` fills the
   * frame and centre-crops what does not fit — what vertical platforms expect.
   */
  fit?: 'contain' | 'cover'
  /** Normalized crop alignment used only by `cover`: 0 = left/top, 1 = right/bottom. */
  focusX?: number
  focusY?: number
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
  motion?: 'zoom-in' | 'zoom-out'
}

export interface RenderPlan {
  purpose: 'export' | 'preview'
  projectId: string
  outputRelativePath: string
  preset: RenderPreset
  durationMs: number
  requiredCapabilities: WorkerCapability[]
  clips: RenderClipStep[]
  audioDucking?: AudioDuckingSettings
  loudnessNormalization?: LoudnessNormalizationSettings
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

export const timelinePreviewPreset: RenderPreset = { ...preview1080pPreset, name: 'Timeline Preview 540p', width: 960, height: 540 }

export type TargetFormat = 'landscape' | 'vertical' | 'square'
export type FormatFit = 'contain' | 'cover'

export interface FormatReframing {
  fit: FormatFit
  focusX: number
  focusY: number
}

export interface FormatProfile {
  id: TargetFormat
  label: string
  aspect: string
  note: string
  export: RenderPreset
  preview: RenderPreset
}

export const formatProfiles: Record<TargetFormat, FormatProfile> = {
  landscape: {
    id: 'landscape',
    label: 'Landscape',
    aspect: '16:9',
    note: 'YouTube, presentations, desktop screen recordings.',
    export: preview1080pPreset,
    preview: timelinePreviewPreset
  },
  vertical: {
    id: 'vertical',
    label: 'Vertical',
    aspect: '9:16',
    note: 'Shorts, Reels, TikTok. Wide material fills the frame; adjust the crop position for this format below.',
    export: { ...preview1080pPreset, name: 'Vertical 1080×1920', width: 1080, height: 1920, fit: 'cover' },
    preview: { ...preview1080pPreset, name: 'Vertical Preview 540×960', width: 540, height: 960, fit: 'cover' }
  },
  square: {
    id: 'square',
    label: 'Square',
    aspect: '1:1',
    note: 'Feed posts. Wide material fills the frame; adjust the crop position for this format below.',
    export: { ...preview1080pPreset, name: 'Square 1080×1080', width: 1080, height: 1080, fit: 'cover' },
    preview: { ...preview1080pPreset, name: 'Square Preview 720×720', width: 720, height: 720, fit: 'cover' }
  }
}

export function projectTargetFormat(project: KinaouProject): TargetFormat {
  const stored = project.metadata.targetFormat
  return stored === 'vertical' || stored === 'square' ? stored : 'landscape'
}

export function setProjectTargetFormat(project: KinaouProject, format: TargetFormat): KinaouProject {
  if (!formatProfiles[format]) throw new Error(`Unknown target format: ${format}`)
  if (projectTargetFormat(project) === format) return project
  return touchProject({ ...project, metadata: { ...project.metadata, targetFormat: format } })
}

const targetFormats = Object.keys(formatProfiles) as TargetFormat[]

function requireTargetFormat(format: TargetFormat): TargetFormat {
  if (!formatProfiles[format]) throw new Error(`Unknown target format: ${format}`)
  return format
}

export function defaultFormatReframing(format: TargetFormat): FormatReframing {
  const profile = formatProfiles[requireTargetFormat(format)]
  return { fit: profile.export.fit ?? 'contain', focusX: 0.5, focusY: 0.5 }
}

function validateFormatReframing(input: FormatReframing): FormatReframing {
  if (input.fit !== 'contain' && input.fit !== 'cover') throw new Error('Format fit must be contain or cover')
  if (![input.focusX, input.focusY].every((value) => Number.isFinite(value) && value >= 0 && value <= 1)) throw new Error('Format focus must be between 0 and 1')
  return { fit: input.fit, focusX: Number(input.focusX.toFixed(3)), focusY: Number(input.focusY.toFixed(3)) }
}

function sameReframing(left: FormatReframing, right: FormatReframing): boolean {
  return left.fit === right.fit && left.focusX === right.focusX && left.focusY === right.focusY
}

export function projectFormatReframing(project: KinaouProject, format: TargetFormat): FormatReframing {
  requireTargetFormat(format)
  const stored = project.metadata.formatReframing
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return defaultFormatReframing(format)
  const candidate = (stored as Record<string, unknown>)[format]
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return defaultFormatReframing(format)
  try {
    const value = candidate as Partial<FormatReframing>
    if (typeof value.focusX !== 'number' || typeof value.focusY !== 'number') return defaultFormatReframing(format)
    return validateFormatReframing({ fit: value.fit as FormatFit, focusX: value.focusX, focusY: value.focusY })
  } catch {
    return defaultFormatReframing(format)
  }
}

export function setProjectFormatReframing(project: KinaouProject, format: TargetFormat, input: FormatReframing, now = new Date()): KinaouProject {
  requireTargetFormat(format)
  const normalized = validateFormatReframing(input)
  if (sameReframing(projectFormatReframing(project, format), normalized)) return project
  const formatReframing: Partial<Record<TargetFormat, FormatReframing>> = {}
  for (const id of targetFormats) {
    const value = id === format ? normalized : projectFormatReframing(project, id)
    if (!sameReframing(value, defaultFormatReframing(id))) formatReframing[id] = value
  }
  const metadata = { ...project.metadata }
  if (Object.keys(formatReframing).length) metadata.formatReframing = formatReframing
  else delete metadata.formatReframing
  return touchProject({ ...project, metadata }, now)
}

export function projectFormatPreset(project: KinaouProject, format: TargetFormat, purpose: 'export' | 'preview'): RenderPreset {
  const preset = formatProfiles[requireTargetFormat(format)][purpose]
  const reframing = projectFormatReframing(project, format)
  return {
    ...preset,
    fit: reframing.fit,
    ...(reframing.fit === 'cover' ? { focusX: reframing.focusX, focusY: reframing.focusY } : {})
  }
}

export function formatReframingRequiresWorker(project: KinaouProject, format: TargetFormat): boolean {
  const reframing = projectFormatReframing(project, format)
  return reframing.fit === 'cover' && (reframing.focusX !== 0.5 || reframing.focusY !== 0.5)
}

export function createRenderPlan(project: KinaouProject, preset: RenderPreset, outputRelativePath: string, options: { audioDucking?: AudioDuckingSettings; loudnessNormalization?: LoudnessNormalizationSettings } = {}): RenderPlan {
  const safeOutput = assertSafeManagedPath(outputRelativePath)
  const preview = safeOutput.startsWith('KINAOU/Cache/Previews/')
  if (!preview && !safeOutput.startsWith('KINAOU/Renders/')) throw new Error('Render output must stay inside KINAOU/Renders or KINAOU/Cache/Previews')
  if (preset.width <= 0 || preset.height <= 0 || preset.fps <= 0) throw new Error('Invalid render preset')
  if (preset.fit !== undefined && preset.fit !== 'contain' && preset.fit !== 'cover') throw new Error('Invalid render preset fit mode')
  if ([preset.focusX, preset.focusY].some((value) => value !== undefined && (!Number.isFinite(value) || value < 0 || value > 1))) throw new Error('Render preset focus must be between 0 and 1')
  if ((preset.focusX !== undefined || preset.focusY !== undefined) && preset.fit !== 'cover') throw new Error('Render preset focus requires cover fit')

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
      if (clip.motion && asset.kind !== 'image') throw new Error(`Scene motion is only supported for still images: ${clip.id}`)
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
        ...(clip.motion ? { motion: clip.motion } : {}),
        fades: { inMs: 0, outMs: 0, ...clip.fades }
      })
      durationMs = Math.max(durationMs, clip.startMs + clip.durationMs)
    }
  })

  clips.sort((a, b) => a.startMs - b.startMs || a.trackIndex - b.trackIndex || a.clipId.localeCompare(b.clipId))

  return {
    purpose: preview ? 'preview' : 'export',
    projectId: project.id,
    outputRelativePath: safeOutput,
    preset,
    durationMs,
    requiredCapabilities: ['filesystem', 'ffmpeg', ...((preset.focusX ?? 0.5) !== 0.5 || (preset.focusY ?? 0.5) !== 0.5 ? ['format-reframing' as const] : [])],
    clips,
    audioDucking: validateAudioDucking(options.audioDucking ?? defaultAudioDucking),
    loudnessNormalization: validateLoudnessNormalization(options.loudnessNormalization ?? defaultLoudnessNormalization)
  }
}

export function createTimelinePreviewPlan(project: KinaouProject): RenderPlan {
  const id = project.id.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 80)
  if (!id) throw new Error('Project id cannot form a preview path')
  const format = projectTargetFormat(project)
  return createRenderPlan(project, projectFormatPreset(project, format, 'preview'), `KINAOU/Cache/Previews/${id}.mp4`)
}
