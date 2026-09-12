import { describe, expect, it } from 'vitest'
import { defaultLoudnessNormalization, validateLoudnessNormalization } from '../src/core/audioLoudness'
import { assetSchema, clipSchema, createProject, trackSchema } from '../src/core/project'
import { createRenderPlan } from '../src/core/render'
import { buildCompositeFilter } from '../src/core/localWorker'

function project() {
  const asset = assetSchema.parse({ id: 'a', kind: 'audio', uri: 'KINAOU/Assets/quiet.wav', managed: true, metadata: { durationMs: 3000 } })
  const clip = clipSchema.parse({ id: 'c', assetId: 'a', startMs: 0, durationMs: 3000 })
  return { ...createProject('Loudness'), assets: [asset], tracks: [trackSchema.parse({ id: 't', type: 'voice', name: 'Voice', clips: [clip] })] }
}

describe('export loudness normalization', () => {
  const preset = { name: 'x', container: 'mp4' as const, width: 320, height: 180, fps: 30, videoCodec: 'h264' as const, audioCodec: 'aac' as const }

  it('is safe and off by default', () => {
    expect(validateLoudnessNormalization(defaultLoudnessNormalization)).toEqual({ enabled: false, targetLufs: -14, truePeakDb: -1.5, loudnessRange: 11 })
    expect(buildCompositeFilter(createRenderPlan(project(), preset, 'KINAOU/Renders/off.mp4')).graph).not.toContain('loudnorm=')
  })

  it('adds the declared master target only when selected', () => {
    const settings = { ...defaultLoudnessNormalization, enabled: true }
    const graph = buildCompositeFilter(createRenderPlan(project(), preset, 'KINAOU/Renders/on.mp4', { loudnessNormalization: settings })).graph
    expect(graph).toContain('loudnorm=I=-14:TP=-1.5:LRA=11[master]')
  })

  it('rejects unsafe or impossible targets before rendering', () => {
    expect(() => validateLoudnessNormalization({ ...defaultLoudnessNormalization, targetLufs: -4 })).toThrow(/Loudness target/)
    expect(() => validateLoudnessNormalization({ ...defaultLoudnessNormalization, truePeakDb: 1 })).toThrow(/True-peak/)
  })
})
