import type { RenderPlan } from './render'
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

export function buildRenderCommand(plan: RenderPlan, resolveAssetPath: (uri: string) => string, outputAbsolutePath: string): ProcessCommand {
  if (!outputAbsolutePath.startsWith('/')) throw new Error('Render output must be absolute')
  if (plan.clips.length === 0) throw new Error('Render plan contains no clips')

  const args: string[] = ['-y']
  for (const clip of plan.clips) {
    args.push('-ss', seconds(clip.sourceOffsetMs), '-t', seconds(clip.durationMs), '-i', resolveAssetPath(clip.asset.uri))
  }

  // This first executable rendering slice supports one linear visual/audio source.
  // Multi-track compositing remains represented by RenderPlan and will be compiled incrementally.
  if (plan.clips.length !== 1 || plan.clips[0].startMs !== 0) {
    throw new Error('Current local render command supports exactly one clip starting at 0; complex plans require compositor support')
  }

  const clip = plan.clips[0]
  if (clip.speed !== 1) args.push('-filter:v', `setpts=PTS/${clip.speed}`)
  args.push('-c:v', plan.preset.videoCodec === 'hevc' ? 'libx265' : 'libx264')
  args.push('-c:a', 'aac', '-r', String(plan.preset.fps), '-s', `${plan.preset.width}x${plan.preset.height}`, outputAbsolutePath)
  return { executable: 'ffmpeg', args }
}

function seconds(ms: number): string {
  return (ms / 1000).toFixed(3)
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
    capabilities: ['filesystem', 'ffmpeg', 'media-probe'],
    managedRoots: [normalizeAbsoluteRoot(input.managedRoot)],
    ...(input.ffmpegVersion ? { ffmpegVersion: input.ffmpegVersion } : {}),
    ...(input.ffprobeVersion ? { ffprobeVersion: input.ffprobeVersion } : {})
  }
}
