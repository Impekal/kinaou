import type { KinaouAsset } from './project'
import type { RenderPlan, RenderClipStep } from './render'
import { assertSafeManagedPath, normalizeRelativePath } from './storage'
import type { MediaProbeResult, WorkerHandshake } from './workerProtocol'
import type { AudioDuckingSettings } from './audioDucking'

export interface ManagedRootBinding {
  managedRoot: string
  absoluteRoot: string
}

export interface ProcessCommand {
  executable: string
  args: string[]
}

export function resolveManagedAbsolutePath(binding: ManagedRootBinding, managedPath: string): string {
  const safe = assertSafeManagedPath(managedPath)
  const normalizedRoot = normalizeAbsoluteRoot(binding.absoluteRoot)
  const normalizedManagedRoot = normalizeRelativePath(binding.managedRoot)
  if (!safe.startsWith(`${normalizedManagedRoot}/`) && safe !== normalizedManagedRoot) {
    throw new Error(`Path is outside authorized managed root: ${normalizedManagedRoot}`)
  }
  const relative = safe === normalizedManagedRoot ? '' : safe.slice(normalizedManagedRoot.length + 1)
  return relative ? `${normalizedRoot}/${relative}` : normalizedRoot
}

export function normalizeAbsoluteRoot(path: string): string {
  const normalized = path.replaceAll('\\', '/').replace(/\/{2,}/g, '/').replace(/\/$/, '')
  if (!normalized.startsWith('/')) throw new Error('Managed absolute root must be absolute')
  if (normalized.split('/').some((segment) => segment === '..')) throw new Error('Managed absolute root cannot contain traversal')
  return normalized
}

export function buildFfprobeCommand(absolutePath: string): ProcessCommand {
  if (!absolutePath.startsWith('/')) throw new Error('ffprobe input must be an absolute path')
  return {
    executable: 'ffprobe',
    args: ['-v', 'error', '-show_entries', 'format=duration,size:stream=index,codec_type,codec_name,width,height,r_frame_rate,sample_rate,channels', '-of', 'json', absolutePath]
  }
}

export function parseFfprobeJson(path: string, json: string): MediaProbeResult {
  const parsed = JSON.parse(json) as {
    format?: { duration?: string; size?: string }
    streams?: Array<{ codec_type?: string; codec_name?: string; width?: number; height?: number; r_frame_rate?: string; sample_rate?: string; channels?: number }>
  }
  const video = parsed.streams?.find((stream) => stream.codec_type === 'video')
  const audio = parsed.streams?.find((stream) => stream.codec_type === 'audio')
  return {
    path,
    ...(parsed.format?.duration ? { durationMs: Math.round(Number(parsed.format.duration) * 1000) } : {}),
    ...(parsed.format?.size ? { sizeBytes: Number(parsed.format.size) } : {}),
    ...(video?.width ? { width: video.width } : {}),
    ...(video?.height ? { height: video.height } : {}),
    ...(video?.codec_name ? { videoCodec: video.codec_name } : {}),
    ...(video?.r_frame_rate ? { fps: parseRate(video.r_frame_rate) } : {}),
    ...(audio?.codec_name ? { audioCodec: audio.codec_name } : {}),
    ...(audio?.sample_rate ? { sampleRate: Number(audio.sample_rate) } : {}),
    ...(audio?.channels ? { channels: audio.channels } : {})
  }
}

function parseRate(rate: string): number {
  const [numerator, denominator = '1'] = rate.split('/')
  const value = Number(numerator) / Number(denominator)
  return Number.isFinite(value) ? value : 0
}

const visualTrackTypes = new Set(['video', 'broll', 'image', 'avatar', 'overlay'])
const audioTrackTypes = new Set(['voice', 'dialog', 'music', 'sfx'])

export function buildRenderCommand(plan: RenderPlan, resolveAssetPath: (uri: string) => string, outputAbsolutePath: string, subtitleAbsolutePath?: string): ProcessCommand {
  if (!outputAbsolutePath.startsWith('/')) throw new Error('Render output must be absolute')
  if (plan.clips.length === 0) throw new Error('Render plan contains no clips')
  if (plan.durationMs <= 0) throw new Error('Render duration must be positive')
  if (plan.clips.some((clip) => clip.speed < 0.25 || clip.speed > 4)) throw new Error('Clip speed must be between 0.25 and 4')

  const args: string[] = ['-y']
  const mediaClips = plan.clips.filter((clip) => clip.asset.kind !== 'caption')
  const hasCaptions = mediaClips.length !== plan.clips.length
  if (hasCaptions && !subtitleAbsolutePath) throw new Error('Caption render requires a generated subtitle file')
  for (const clip of mediaClips) {
    if (clip.asset.kind === 'image') args.push('-loop', '1')
    args.push('-ss', seconds(clip.sourceOffsetMs), '-t', seconds(clip.durationMs * (clip.asset.kind === 'image' ? 1 : clip.speed)), '-i', resolveAssetPath(clip.asset.uri))
  }

  const filter = buildCompositeFilter({ ...plan, clips: mediaClips }, subtitleAbsolutePath)
  args.push('-filter_complex', filter.graph)
  args.push('-map', filter.videoOutput)
  if (filter.audioOutput) args.push('-map', filter.audioOutput)
  else args.push('-an')
  args.push('-t', seconds(plan.durationMs))
  args.push('-c:v', plan.preset.videoCodec === 'hevc' ? 'libx265' : 'libx264')
  if (filter.audioOutput) args.push('-c:a', 'aac')
  args.push('-r', String(plan.preset.fps), '-pix_fmt', 'yuv420p', outputAbsolutePath)
  return { executable: 'ffmpeg', args }
}

export interface CompositeFilter {
  graph: string
  videoOutput: string
  audioOutput?: string
}


const MOTION_ZOOM = 0.18

const musicDuckingFilters: (clip: RenderClipStep, clips: RenderClipStep[], settings: AudioDuckingSettings) => string = function musicDuckingFilters(clip, clips, settings) {
  if (clip.trackType !== 'music' || !settings.enabled || settings.reductionDb === 0) return ''
  const expanded = clips.filter((item) => item.trackType === 'voice' || item.trackType === 'dialog').map((item) => ({ startMs: Math.max(0, item.startMs - settings.attackMs), endMs: item.startMs + item.durationMs + settings.releaseMs })).sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs)
  const merged = expanded.slice(0, 0)
  for (const interval of expanded) {
    const previous = merged.at(-1)
    if (previous && interval.startMs <= previous.endMs) previous.endMs = Math.max(previous.endMs, interval.endMs)
    else merged.push({ ...interval })
  }
  const gain = Number(Math.pow(10, -settings.reductionDb / 20).toFixed(6))
  const clipEndMs = clip.startMs + clip.durationMs
  return merged.map((interval) => {
    const intersectionStart = Math.max(interval.startMs, clip.startMs)
    const intersectionEnd = Math.min(interval.endMs, clipEndMs)
    if (intersectionEnd <= intersectionStart) return ''
    const start = (interval.startMs - clip.startMs) / 1000
    const end = (interval.endMs - clip.startMs) / 1000
    const attackEnd = Math.min(interval.startMs + settings.attackMs, interval.endMs) / 1000 - clip.startMs / 1000
    const releaseStart = Math.max(interval.startMs + settings.attackMs, interval.endMs - settings.releaseMs) / 1000 - clip.startMs / 1000
    let expression = String(gain)
    if (end > releaseStart) expression = `if(gte(t,${releaseStart}),${gain}+(1-${gain})*(t-${releaseStart})/${end - releaseStart},${expression})`
    if (attackEnd > start) expression = `if(lt(t,${attackEnd}),1-(1-${gain})*(t-${start})/${attackEnd - start},${expression})`
    return `,volume='${expression}':eval=frame:enable='between(t,${(intersectionStart - clip.startMs) / 1000},${(intersectionEnd - clip.startMs) / 1000})'`
  }).join('')
}

/** The size a still occupies inside the canvas once letterboxed, or null if unknown. */
function letterboxedSize(asset: KinaouAsset, width: number, height: number): { w: number; h: number } | null {
  const sourceWidth = Number(asset.metadata.width)
  const sourceHeight = Number(asset.metadata.height)
  if (!Number.isFinite(sourceWidth) || !Number.isFinite(sourceHeight) || sourceWidth <= 0 || sourceHeight <= 0) return null
  const factor = Math.min(width / sourceWidth, height / sourceHeight)
  return { w: Math.max(2, Math.round(sourceWidth * factor)), h: Math.max(2, Math.round(sourceHeight * factor)) }
}

export function buildCompositeFilter(plan: RenderPlan, subtitleAbsolutePath?: string): CompositeFilter {
  const width = plan.preset.width
  const height = plan.preset.height
  // contain letterboxes the whole frame; cover fills the canvas and centre-crops
  // the overflow, which is what vertical/square platform formats expect.
  const fitFilter = plan.preset.fit === 'cover'
    ? `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`
    : `scale=${width}:${height}:force_original_aspect_ratio=decrease`
  // A still scene can drift slowly instead of sitting perfectly still. zoompan needs a
  // fixed output size: cover already fills the canvas, while contain must render into
  // the letterboxed size computed from the source pixels — stretching it would distort.
  const framePrefix = (clip: RenderClipStep) => {
    const target = clip.motion && clip.asset.kind === 'image'
      ? (plan.preset.fit === 'cover' ? { w: width, h: height } : letterboxedSize(clip.asset, width, height))
      : null
    if (!target) return fitFilter
    const frames = Math.max(2, Math.round((clip.durationMs / 1000) * fps))
    const zoom = clip.motion === 'zoom-in'
      ? `min(1+${MOTION_ZOOM}*on/${frames},${1 + MOTION_ZOOM})`
      : `max(${1 + MOTION_ZOOM}-${MOTION_ZOOM}*on/${frames},1)`
    const fitted = plan.preset.fit === 'cover' ? fitFilter : `scale=${target.w}:${target.h}`
    return `${fitted},zoompan=z='${zoom}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${target.w}x${target.h}:fps=${fps}`
  }
  const fps = plan.preset.fps
  const duration = seconds(plan.durationMs)
  const parts: string[] = [`color=c=black:s=${width}x${height}:r=${fps}:d=${duration}[base]`]
  const visuals: Array<{ index: number; clip: RenderClipStep }> = []
  const audios: Array<{ index: number; clip: RenderClipStep }> = []

  plan.clips.forEach((clip, index) => {
    if (visualTrackTypes.has(clip.trackType)) visuals.push({ index, clip })
    if (audioTrackTypes.has(clip.trackType)) audios.push({ index, clip })
  })

  // Higher track indexes are composited later, therefore appear above lower tracks.
  visuals.sort((a, b) => a.clip.trackIndex - b.clip.trackIndex || a.clip.startMs - b.clip.startMs || a.clip.clipId.localeCompare(b.clip.clipId))

  let currentVideo = 'base'
  visuals.forEach(({ index, clip }, visualIndex) => {
    const prepared = `v${visualIndex}`
    const output = `vo${visualIndex}`
    const start = seconds(clip.startMs)
    const end = seconds(clip.startMs + clip.durationMs)
    const transform = clip.transform
    const visualFadeIn = clip.transitionIn?.durationMs ?? clip.fades.inMs
    const fadeFilters = visualFadeIn || clip.fades.outMs ? [',format=rgba', ...(visualFadeIn ? [`,fade=t=in:st=0:d=${seconds(visualFadeIn)}:alpha=1`] : []), ...(clip.fades.outMs ? [`,fade=t=out:st=${seconds(clip.durationMs - clip.fades.outMs)}:d=${seconds(clip.fades.outMs)}:alpha=1`] : [])].join('') : ''
    const timing = clip.asset.kind === 'image' || clip.speed === 1 ? 'PTS-STARTPTS' : `(PTS-STARTPTS)/${clip.speed}`
    parts.push(`[${index}:v]${framePrefix(clip)},crop=iw-${transform.cropLeft}-${transform.cropRight}:ih-${transform.cropTop}-${transform.cropBottom}:${transform.cropLeft}:${transform.cropTop},scale=iw*${transform.scale}:ih*${transform.scale}${fadeFilters},setpts=${timing}+${start}/TB[${prepared}]`)
    parts.push(`[${currentVideo}][${prepared}]overlay=(W-w)/2${signedOffset(transform.x)}:(H-h)/2${signedOffset(transform.y)}:enable='between(t,${start},${end})'[${output}]`)
    currentVideo = output
  })

  if (subtitleAbsolutePath) {
    const escaped = subtitleAbsolutePath.replaceAll('\\', '\\\\').replaceAll(':', '\\:').replaceAll("'", "'\\''").replaceAll(',', '\\,').replaceAll('[', '\\[').replaceAll(']', '\\]')
    parts.push(`[${currentVideo}]subtitles=filename='${escaped}'[captioned]`)
    currentVideo = 'captioned'
  }

  let audioOutput: string | undefined
  if (audios.length) {
    const ducking = plan.audioDucking ?? { enabled: true, reductionDb: 12, attackMs: 150, releaseMs: 400 }
    const labels: string[] = []
    audios.forEach(({ index, clip }, audioIndex) => {
      const label = `a${audioIndex}`
      const delay = Math.round(clip.startMs)
      const fades = `${clip.fades.inMs ? `,afade=t=in:st=0:d=${seconds(clip.fades.inMs)}` : ''}${clip.fades.outMs ? `,afade=t=out:st=${seconds(clip.durationMs - clip.fades.outMs)}:d=${seconds(clip.fades.outMs)}` : ''}`
      const tempo = buildAtempoFilters(clip.speed)
      parts.push(`[${index}:a]atrim=0:${seconds(clip.durationMs * clip.speed)},asetpts=PTS-STARTPTS${tempo},atrim=0:${seconds(clip.durationMs)},volume=${clip.gain}${fades}${musicDuckingFilters(clip, plan.clips, ducking)},adelay=${delay}|${delay}[${label}]`)
      labels.push(`[${label}]`)
    })
    audioOutput = 'aout'
    parts.push(`${labels.join('')}amix=inputs=${labels.length}:duration=longest:normalize=0[${audioOutput}]`)
  }

  return { graph: parts.join(';'), videoOutput: `[${currentVideo}]`, ...(audioOutput ? { audioOutput: `[${audioOutput}]` } : {}) }
}

function seconds(ms: number): string {
  return (ms / 1000).toFixed(3)
}

function signedOffset(value: number): string { return value < 0 ? String(value) : `+${value}` }

export function buildAtempoFilters(speed: number): string {
  if (!Number.isFinite(speed) || speed < 0.25 || speed > 4) throw new Error('Audio speed must be between 0.25 and 4')
  const factors: number[] = []
  let remaining = speed
  while (remaining < 0.5) { factors.push(0.5); remaining /= 0.5 }
  while (remaining > 2) { factors.push(2); remaining /= 2 }
  if (Math.abs(remaining - 1) > 1e-9 || factors.length === 0) factors.push(remaining)
  return factors.filter((factor) => Math.abs(factor - 1) > 1e-9).map((factor) => `,atempo=${Number(factor.toFixed(6))}`).join('')
}

export function createMacWorkerHandshake(input: {
  workerId: string
  name?: string
  version: string
  managedRoot: string
  ffmpegVersion?: string
  ffprobeVersion?: string
}): WorkerHandshake {
  return {
    workerId: input.workerId,
    name: input.name ?? 'KINAOU Mac Worker',
    platform: 'darwin',
    version: input.version,
    capabilities: ['filesystem', 'ffmpeg', 'media-probe', 'asset-upload', 'media-proxy', 'media-thumbnail', 'media-waveform'],
    managedRoots: [normalizeAbsoluteRoot(input.managedRoot)],
    ...(input.ffmpegVersion ? { ffmpegVersion: input.ffmpegVersion } : {}),
    ...(input.ffprobeVersion ? { ffprobeVersion: input.ffprobeVersion } : {})
  }
}
