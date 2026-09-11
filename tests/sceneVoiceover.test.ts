import { describe, expect, it } from 'vitest'
import { assetSchema, clipSchema, createProject, trackSchema, type KinaouProject } from '../src/core/project'
import { placeSceneNarration, planSceneVoiceovers, voiceoverTargetTracks } from '../src/core/sceneVoiceover'
import type { TtsJobRecord } from '../src/core/ttsJobs'

function baseProject(): KinaouProject {
  const visual = assetSchema.parse({ id: 'a1', kind: 'image', uri: 'KINAOU/Assets/a1.png', managed: true, offline: false, metadata: {} })
  const clip = clipSchema.parse({ id: 'c1', assetId: 'a1', startMs: 2000, durationMs: 4000 })
  return {
    ...createProject('Narration'),
    assets: [visual],
    tracks: [
      trackSchema.parse({ id: 'video-1', type: 'video', name: 'Main Video', clips: [clip] }),
      trackSchema.parse({ id: 'voice-1', type: 'voice', name: 'Voice', clips: [] })
    ],
    storyboard: [{ id: 's1', title: 'Opening scene', description: 'Open the browser and click the address bar.', durationMs: 8000, assetId: 'a1' }]
  }
}

function job(durationMs: number, id = 'job-1'): TtsJobRecord {
  return { id, state: 'succeeded', progress: 1, audioPath: `KINAOU/Assets/GeneratedVoice/${id}.wav`, durationMs, sizeBytes: 1024, voicePath: 'KINAOU/Models/voice.onnx' } as TtsJobRecord
}

describe('scene voice-over planning', () => {
  it('takes its timing from the clip on the timeline', () => {
    const { pending, skipped } = planSceneVoiceovers(baseProject(), 'video-1')
    expect(skipped).toEqual([])
    expect(pending).toEqual([{
      sceneId: 's1',
      title: 'Opening scene',
      text: 'Open the browser and click the address bar.',
      startMs: 2000,
      sceneDurationMs: 4000
    }])
  })

  it('reports every scene it cannot narrate', () => {
    const base = baseProject()
    const project: KinaouProject = {
      ...base,
      storyboard: [
        ...base.storyboard,
        { id: 'silent', title: 'Silent', description: '   ', durationMs: 3000, assetId: 'a1' },
        { id: 'unplaced', title: 'Unplaced', description: 'Says something', durationMs: 3000, assetId: 'ghost' },
        { id: 'novisual', title: 'No visual', description: 'Says something', durationMs: 3000 }
      ]
    }
    const { pending, skipped } = planSceneVoiceovers(project, 'video-1')
    expect(pending.map((entry) => entry.sceneId)).toEqual(['s1'])
    expect(Object.fromEntries(skipped.map((entry) => [entry.sceneId, entry.reason]))).toEqual({
      silent: 'Scene has no description to read out',
      unplaced: 'Its visual is not on "Main Video" — assemble the timeline first',
      novisual: 'Scene has no visual on the timeline yet'
    })
  })

  it('refuses without a storyboard or a known track', () => {
    expect(() => planSceneVoiceovers({ ...baseProject(), storyboard: [] }, 'video-1')).toThrow(/no storyboard scenes/)
    expect(() => planSceneVoiceovers(baseProject(), 'nope')).toThrow(/not found/)
  })

  it('finds voice and dialog tracks as narration targets', () => {
    expect(voiceoverTargetTracks(baseProject()).map((track) => track.id)).toEqual(['voice-1'])
  })
})

describe('placing scene narration', () => {
  it('places the voice under its scene and keeps its natural length', () => {
    const project = baseProject()
    const [scene] = planSceneVoiceovers(project, 'video-1').pending
    const { project: next, narrated } = placeSceneNarration(project, scene, job(3200), 'voice-1')

    const voiceClips = next.tracks.find((track) => track.id === 'voice-1')!.clips
    expect(voiceClips).toHaveLength(1)
    expect(voiceClips[0].startMs).toBe(2000)
    expect(voiceClips[0].durationMs).toBe(3200)
    expect(narrated.overrunMs).toBe(0)

    const asset = next.assets.find((entry) => entry.id === narrated.assetId)!
    expect(asset.metadata).toMatchObject({ sceneId: 's1', adapterId: 'piper', source: 'storyboard-description' })
    expect(asset.metadata.sourceText).toBe(scene.text)
  })

  it('reports narration that outruns its scene instead of trimming it', () => {
    const project = baseProject()
    const [scene] = planSceneVoiceovers(project, 'video-1').pending
    const { project: next, narrated } = placeSceneNarration(project, scene, job(6500), 'voice-1')
    expect(narrated.overrunMs).toBe(2500)
    expect(next.tracks.find((track) => track.id === 'voice-1')!.clips[0].durationMs).toBe(6500)
  })

  it('makes a narrated scene skip on the next run', () => {
    const project = baseProject()
    const [scene] = planSceneVoiceovers(project, 'video-1').pending
    const { project: next } = placeSceneNarration(project, scene, job(3000), 'voice-1')
    const second = planSceneVoiceovers(next, 'video-1')
    expect(second.pending).toEqual([])
    expect(second.skipped[0].reason).toMatch(/already has narration/)
  })

  it('refuses a locked or non-voice track and an empty narration', () => {
    const project = baseProject()
    const [scene] = planSceneVoiceovers(project, 'video-1').pending
    expect(() => placeSceneNarration(project, scene, job(3000), 'video-1')).toThrow(/voice track/)
    expect(() => placeSceneNarration(project, scene, job(0), 'voice-1')).toThrow()

    const locked = { ...project, tracks: project.tracks.map((track) => track.id === 'voice-1' ? { ...track, locked: true } : track) }
    expect(() => placeSceneNarration(locked, scene, job(3000), 'voice-1')).toThrow(/locked/)
  })
})

describe('narration for a picture that appears in two scenes', () => {
  it('takes each scene timing from its own clip', () => {
    const asset = assetSchema.parse({ id: 'a1', kind: 'image', uri: 'KINAOU/Assets/a1.png', managed: true, offline: false, metadata: {} })
    const project: KinaouProject = {
      ...createProject('Recurring'),
      assets: [asset],
      tracks: [
        trackSchema.parse({
          id: 'video-1',
          type: 'video',
          name: 'Main Video',
          clips: [
            clipSchema.parse({ id: 'c1', assetId: 'a1', startMs: 0, durationMs: 4000, sceneId: 's1' }),
            clipSchema.parse({ id: 'c2', assetId: 'a1', startMs: 4000, durationMs: 4000, sceneId: 's2' })
          ]
        }),
        trackSchema.parse({ id: 'voice-1', type: 'voice', name: 'Voice', clips: [] })
      ],
      storyboard: [
        { id: 's1', title: 'First look', description: 'Here it is.', durationMs: 4000, assetId: 'a1' },
        { id: 's2', title: 'Second look', description: 'And here it is again.', durationMs: 4000, assetId: 'a1' }
      ]
    }
    expect(planSceneVoiceovers(project, 'video-1').pending.map((entry) => [entry.sceneId, entry.startMs])).toEqual([['s1', 0], ['s2', 4000]])
  })
})
