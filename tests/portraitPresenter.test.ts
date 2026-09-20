import { describe, expect, it } from 'vitest'
import { assetSchema, clipSchema, createProject, parseProject, trackSchema } from '../src/core/project'
import { appendPortraitPresenter, planPortraitPresenter } from '../src/core/portraitPresenter'
import { createRenderPlan, createTimelinePreviewPlan, preview1080pPreset } from '../src/core/render'
import { buildCompositeFilter } from '../src/core/localWorker'

function fixture() {
  return { ...createProject('Portrait'), assets: [
    assetSchema.parse({ id: 'portrait', kind: 'image', uri: 'KINAOU/Assets/portrait.png', managed: true, metadata: { generated: true, adapterId: 'comfyui', seed: 42 } }),
    assetSchema.parse({ id: 'voice', kind: 'audio', uri: 'KINAOU/Assets/voice.wav', managed: true, metadata: { durationMs: 2345, adapterId: 'piper', voicePath: 'KINAOU/Models/voice.onnx', sourceText: 'Bonjour' } })
  ] }
}
const input = { name: ' Camille ', portraitAssetId: 'portrait', narrationAssetId: 'voice' }

describe('voiced still portrait composition', () => {
  it('pairs full-length narration with a still, preserving original provenance and project persistence', () => {
    const project = fixture()
    const original = structuredClone(project)
    const next = appendPortraitPresenter(project, input)
    expect(project).toEqual(original)
    expect(next.assets).toEqual(project.assets)
    expect(next.tracks.map((track) => track.type)).toEqual(['avatar', 'voice'])
    expect(next.tracks[0].name).toBe('Camille · still portrait')
    expect(next.tracks.map((track) => track.clips[0])).toEqual([
      expect.objectContaining({ assetId: 'portrait', startMs: 0, durationMs: 2345, sourceOffsetMs: 0, speed: 1 }),
      expect.objectContaining({ assetId: 'voice', startMs: 0, durationMs: 2345, sourceOffsetMs: 0, speed: 1 })
    ])
    expect(parseProject(JSON.parse(JSON.stringify(next)))).toEqual(next)
  })

  it('appends after every existing clip, including locked and muted tracks, without changing them', () => {
    const old = trackSchema.parse({ id: 'old', name: 'Locked', type: 'video', locked: true, muted: true, clips: [clipSchema.parse({ id: 'old-clip', assetId: 'portrait', startMs: 10000, durationMs: 3000 })] })
    const project = { ...fixture(), tracks: [old] }
    expect(planPortraitPresenter(project, input).startMs).toBe(13000)
    const next = appendPortraitPresenter(project, input)
    expect(next.tracks[0]).toEqual(old)
    expect(next.tracks[1].clips[0].startMs).toBe(13000)
    const second = appendPortraitPresenter(next, input)
    expect(second.tracks[3].clips[0].startMs).toBe(15345)
    expect(new Set(second.tracks.map((track) => track.id)).size).toBe(5)
  })

  it('rejects offline, wrong-kind, missing and unmanaged sources and unknown or excessive durations', () => {
    for (const change of [{ offline: true }, { managed: false }, { kind: 'video' as const }, { uri: 'KINAOU/Assets/../Models/portrait.png' }]) {
      const project = fixture(); Object.assign(project.assets[0], change)
      expect(() => appendPortraitPresenter(project, input)).toThrow(/portrait/)
    }
    for (const durationMs of [undefined, NaN, Infinity, '2345', 0, -1, 3600001]) {
      const project = fixture(); project.assets[1].metadata.durationMs = durationMs
      expect(() => appendPortraitPresenter(project, input)).toThrow(/measured duration/)
    }
    expect(() => appendPortraitPresenter(fixture(), { ...input, narrationAssetId: 'missing' })).toThrow(/narration/)
    expect(() => appendPortraitPresenter(fixture(), { ...input, name: ' ' })).toThrow(/presenter name/)
  })

  it('sends the paired sources into the real preview/export compositor without an avatar-model claim', () => {
    const project = appendPortraitPresenter(fixture(), input)
    for (const plan of [createTimelinePreviewPlan(project), createRenderPlan(project, preview1080pPreset, 'KINAOU/Renders/presenter.mp4')]) {
      expect(plan.durationMs).toBe(2345)
      expect(plan.clips.map((clip) => clip.trackType)).toEqual(['avatar', 'voice'])
      expect(plan.requiredCapabilities).not.toContain('avatar')
      const filter = buildCompositeFilter(plan)
      expect(JSON.stringify(filter)).toContain('overlay=')
      expect(JSON.stringify(filter)).toContain('amix=')
    }
  })
})
