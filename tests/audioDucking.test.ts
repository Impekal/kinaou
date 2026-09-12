import { describe, expect, it } from 'vitest'
import { defaultAudioDucking, speechIntervals, validateAudioDucking } from '../src/core/audioDucking'
import { createRenderPlan } from '../src/core/render'
import { buildCompositeFilter } from '../src/core/localWorker'
import { assetSchema, clipSchema, createProject, trackSchema } from '../src/core/project'

function project() {
  const music = assetSchema.parse({ id: 'music', kind: 'audio', uri: 'KINAOU/Assets/music.wav', managed: true, metadata: { durationMs: 10_000 } })
  const voice = assetSchema.parse({ id: 'voice', kind: 'audio', uri: 'KINAOU/Assets/voice.wav', managed: true, metadata: { durationMs: 10_000 } })
  return { ...createProject('Ducking'), assets: [music, voice], tracks: [
    trackSchema.parse({ id: 'music-track', type: 'music', name: 'Music', clips: [clipSchema.parse({ id: 'music-clip', assetId: 'music', startMs: 0, durationMs: 10_000 })] }),
    trackSchema.parse({ id: 'voice-track', type: 'voice', name: 'Voice', clips: [clipSchema.parse({ id: 'voice-1', assetId: 'voice', startMs: 2000, durationMs: 1000 }), clipSchema.parse({ id: 'voice-2', assetId: 'voice', startMs: 3200, durationMs: 1000 })] })
  ] }
}

describe('music ducking', () => {
  it('validates editor-controlled limits', () => {
    expect(validateAudioDucking(defaultAudioDucking)).toEqual(defaultAudioDucking)
    expect(() => validateAudioDucking({ ...defaultAudioDucking, reductionDb: 41 })).toThrow(/0 and 40/)
    expect(() => validateAudioDucking({ ...defaultAudioDucking, attackMs: 1.5 })).toThrow(/attack/)
  })

  it('merges speech intervals after attack and release expansion', () => {
    const plan = createRenderPlan(project(), { name: 'x', container: 'mp4', width: 640, height: 360, fps: 30, videoCodec: 'h264', audioCodec: 'aac' }, 'KINAOU/Renders/x.mp4')
    expect(speechIntervals(plan.clips, defaultAudioDucking)).toEqual([{ startMs: 1850, endMs: 4600 }])
  })

  it('adds deterministic automation to music only and can be disabled', () => {
    const preset = { name: 'x', container: 'mp4' as const, width: 640, height: 360, fps: 30, videoCodec: 'h264' as const, audioCodec: 'aac' as const }
    const enabled = buildCompositeFilter(createRenderPlan(project(), preset, 'KINAOU/Renders/on.mp4')).graph
    const disabled = buildCompositeFilter(createRenderPlan(project(), preset, 'KINAOU/Renders/off.mp4', { audioDucking: { ...defaultAudioDucking, enabled: false } })).graph
    expect(enabled).toContain("volume='if(lt(t,")
    expect(enabled).toContain(':eval=frame:enable=')
    expect(disabled).not.toContain(':eval=frame:enable=')
  })
})
