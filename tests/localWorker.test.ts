import { describe, expect, it } from 'vitest'
import { createProject, assetSchema, clipSchema, trackSchema } from '../src/core/project'
import { createRenderPlan, preview1080pPreset } from '../src/core/render'
import { buildCompositeFilter, buildFfprobeCommand, buildRenderCommand, createMacWorkerHandshake, parseFfprobeJson, resolveManagedAbsolutePath } from '../src/core/localWorker'

describe('local Mac worker contract', () => {
  it('resolves only explicitly managed KINAOU paths', () => {
    const binding = { managedRoot: 'KINAOU', absoluteRoot: '/Volumes/Media/KINAOU' }
    expect(resolveManagedAbsolutePath(binding, 'KINAOU/Assets/video.mp4')).toBe('/Volumes/Media/KINAOU/Assets/video.mp4')
    expect(() => resolveManagedAbsolutePath(binding, 'Documents/private.txt')).toThrow()
    expect(() => resolveManagedAbsolutePath(binding, 'KINAOU/../Documents/private.txt')).toThrow()
  })

  it('builds a deterministic ffprobe command and parses metadata', () => {
    const command = buildFfprobeCommand('/Volumes/Media/KINAOU/Assets/demo.mp4')
    expect(command.executable).toBe('ffprobe')
    expect(command.args.at(-1)).toBe('/Volumes/Media/KINAOU/Assets/demo.mp4')

    const result = parseFfprobeJson('/Volumes/Media/KINAOU/Assets/demo.mp4', JSON.stringify({
      format: { duration: '12.5', size: '12345' },
      streams: [
        { codec_type: 'video', codec_name: 'h264', width: 1920, height: 1080, r_frame_rate: '30000/1001' },
        { codec_type: 'audio', codec_name: 'aac', sample_rate: '48000', channels: 2 }
      ]
    }))

    expect(result.durationMs).toBe(12500)
    expect(result.sizeBytes).toBe(12345)
    expect(result.width).toBe(1920)
    expect(result.audioCodec).toBe('aac')
    expect(result.fps).toBeGreaterThan(29)
  })

  it('creates an executable render command from a safe plan', () => {
    const base = createProject('Render')
    const asset = assetSchema.parse({ id: 'asset-1', kind: 'video', uri: 'KINAOU/Assets/demo.mp4', managed: true, offline: false, metadata: {} })
    const clip = clipSchema.parse({ id: 'clip-1', assetId: asset.id, startMs: 0, durationMs: 5000 })
    const track = trackSchema.parse({ id: 'track-1', type: 'video', name: 'Main video', clips: [clip] })
    const project = { ...base, assets: [asset], tracks: [track] }
    const plan = createRenderPlan(project, preview1080pPreset, 'KINAOU/Renders/demo.mp4')
    const command = buildRenderCommand(plan, (uri) => `/Volumes/Media/${uri}`, '/Volumes/Media/KINAOU/Renders/demo.mp4')

    expect(command.executable).toBe('ffmpeg')
    expect(command.args).toContain('-filter_complex')
    expect(command.args).toContain('libx264')
    expect(command.args.at(-1)).toBe('/Volumes/Media/KINAOU/Renders/demo.mp4')
  })

  it('compiles visual layering and delayed audio mixing for multiple tracks', () => {
    const base = createProject('Composite')
    const video = assetSchema.parse({ id: 'video', kind: 'video', uri: 'KINAOU/Assets/video.mp4', managed: true, offline: false, metadata: {} })
    const voice = assetSchema.parse({ id: 'voice', kind: 'audio', uri: 'KINAOU/Assets/voice.wav', managed: true, offline: false, metadata: {} })
    const videoTrack = trackSchema.parse({ id: 'v', type: 'video', name: 'Video', clips: [clipSchema.parse({ id: 'vc', assetId: video.id, startMs: 1000, durationMs: 5000 })] })
    const voiceTrack = trackSchema.parse({ id: 'a', type: 'voice', name: 'Voice', clips: [clipSchema.parse({ id: 'ac', assetId: voice.id, startMs: 2000, durationMs: 3000, gain: 0.8 })] })
    const plan = createRenderPlan({ ...base, assets: [video, voice], tracks: [videoTrack, voiceTrack] }, preview1080pPreset, 'KINAOU/Renders/composite.mp4')
    const filter = buildCompositeFilter(plan)
    const command = buildRenderCommand(plan, (uri) => `/Volumes/Media/${uri}`, '/Volumes/Media/KINAOU/Renders/composite.mp4')

    expect(filter.graph).toContain("overlay=0:0:enable='between(t,1.000,6.000)'")
    expect(filter.graph).toContain('adelay=2000|2000')
    expect(filter.graph).toContain('volume=0.8')
    expect(filter.graph).toContain('amix=inputs=1')
    expect(command.args).toContain('[aout]')
  })

  it('rejects speed changes until compositor timing supports them exactly', () => {
    const base = createProject('Speed')
    const asset = assetSchema.parse({ id: 'asset-1', kind: 'video', uri: 'KINAOU/Assets/demo.mp4', managed: true, offline: false, metadata: {} })
    const clip = clipSchema.parse({ id: 'clip-1', assetId: asset.id, startMs: 0, durationMs: 5000, speed: 1.5 })
    const track = trackSchema.parse({ id: 'track-1', type: 'video', name: 'Main video', clips: [clip] })
    const plan = createRenderPlan({ ...base, assets: [asset], tracks: [track] }, preview1080pPreset, 'KINAOU/Renders/demo.mp4')
    expect(() => buildRenderCommand(plan, (uri) => `/Volumes/Media/${uri}`, '/Volumes/Media/KINAOU/Renders/demo.mp4')).toThrow(/speed 1/)
  })

  it('advertises the real local capabilities intended for the Mac worker', () => {
    const handshake = createMacWorkerHandshake({ workerId: 'mac-1', version: '0.3.0', managedRoot: '/Volumes/Media/KINAOU', ffmpegVersion: '7.1' })
    expect(handshake.platform).toBe('darwin')
    expect(handshake.capabilities).toEqual(expect.arrayContaining(['filesystem', 'ffmpeg', 'media-probe']))
    expect(handshake.managedRoots).toEqual(['/Volumes/Media/KINAOU'])
  })
})
