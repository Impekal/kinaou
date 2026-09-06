import type { RenderPlan, RenderClipStep } from './render'
import { assertSafeManagedPath, normalizeRelativePath } from './storage'
import type { MediaProbeResult, WorkerHandshake } from './workerProtocol'

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
  if (plan.clips.some((clip) => clip.speed !== 1)) throw new Error('Multi-track compositor currently requires clip speed 1')

  const args: string[] = ['-y']
  const mediaClips = plan.clips.filter((clip) => clip.asset.kind !== 'caption')
  const hasCaptions = mediaClips.length !== plan.clips.length
  if (hasCaptions && !subtitleAbsolutePath) throw new Error('Caption render requires a generated subtitle file')
  for (const clip of mediaClips) {
    if (clip.asset.kind === 'image') args.push('-loop', '1')
    args.push('-ss', seconds(clip.sourceOffsetMs), '-t', seconds(clip.durationMs), '-i', resolveAssetPath(clip.asset.uri))
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

export function buildCompositeFilter(plan: RenderPlan, subtitleAbsolutePath?: string): CompositeFilter {
  const width = plan.preset.width
  const height = plan.preset.height
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
    parts.push(`[${index}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,crop=iw-${transform.cropLeft}-${transform.cropRight}:ih-${transform.cropTop}-${transform.cropBottom}:${transform.cropLeft}:${transform.cropTop},scale=iw*${transform.scale}:ih*${transform.scale}${fadeFilters},setpts=PTS-STARTPTS+${start}/TB[${prepared}]`)
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
    const labels: string[] = []
    audios.forEach(({ index, clip }, audioIndex) => {
      const label = `a${audioIndex}`
      const delay = Math.round(clip.startMs)
      const fades = `${clip.fades.inMs ? `,afade=t=in:st=0:d=${seconds(clip.fades.inMs)}` : ''}${clip.fades.outMs ? `,afade=t=out:st=${seconds(clip.durationMs - clip.fades.outMs)}:d=${seconds(clip.fades.outMs)}` : ''}`
      parts.push(`[${index}:a]atrim=0:${seconds(clip.durationMs)},asetpts=PTS-STARTPTS,volume=${clip.gain}${fades},adelay=${delay}|${delay}[${label}]`)
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
    capabilities: ['filesystem', 'ffmpeg', 'media-probe', 'asset-upload'],
    managedRoots: [normalizeAbsoluteRoot(input.managedRoot)],
    ...(input.ffmpegVersion ? { ffmpegVersion: input.ffmpegVersion } : {}),
    ...(input.ffprobeVersion ? { ffprobeVersion: input.ffprobeVersion } : {})
  }
}
