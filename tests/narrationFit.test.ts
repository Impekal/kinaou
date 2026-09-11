import { describe, expect, it } from 'vitest'
import { assetSchema, clipSchema, createProject, trackSchema, type KinaouProject } from '../src/core/project'
import { fitScenesToNarration, planNarrationFit } from '../src/core/narrationFit'
import { createTimelinePreviewPlan } from '../src/core/render'

const CROSSFADE_MS = 500

/**
 * Two assembled scenes with a 500ms cross-dissolve overlap, each with its own
 * narration underneath — scene one's voice runs 1.2s past its picture.
 */
function narratedProject(): KinaouProject {
  return {
    ...createProject('Fit'),
    assets: [
      assetSchema.parse({ id: 'v1', kind: 'image', uri: 'KINAOU/Assets/v1.png', managed: true, metadata: {} }),
      assetSchema.parse({ id: 'v2', kind: 'image', uri: 'KINAOU/Assets/v2.png', managed: true, metadata: {} }),
      assetSchema.parse({ id: 'n1', kind: 'audio', uri: 'KINAOU/Assets/GeneratedVoice/n1.wav', managed: true, metadata: { sceneId: 's1' } }),
      assetSchema.parse({ id: 'n2', kind: 'audio', uri: 'KINAOU/Assets/GeneratedVoice/n2.wav', managed: true, metadata: { sceneId: 's2' } })
    ],
    tracks: [
      trackSchema.parse({
        id: 'video-1',
        type: 'video',
        name: 'Main Video',
        clips: [
          clipSchema.parse({ id: 'c1', assetId: 'v1', startMs: 0, durationMs: 4000 }),
          clipSchema.parse({ id: 'c2', assetId: 'v2', startMs: 4000 - CROSSFADE_MS, durationMs: 4000, transitionIn: { type: 'dissolve', durationMs: CROSSFADE_MS } })
        ]
      }),
      trackSchema.parse({
        id: 'voice-1',
        type: 'voice',
        name: 'Voice',
        clips: [
          clipSchema.parse({ id: 'a1', assetId: 'n1', startMs: 0, durationMs: 5200 }),
          clipSchema.parse({ id: 'a2', assetId: 'n2', startMs: 3500, durationMs: 3000 })
        ]
      }),
      trackSchema.parse({ id: 'caption-1', type: 'caption', name: 'Captions', clips: [] })
    ],
    storyboard: [
      { id: 's1', title: 'Opening', description: 'One.', durationMs: 4000, assetId: 'v1' },
      { id: 's2', title: 'Closing', description: 'Two.', durationMs: 4000, assetId: 'v2' }
    ]
  }
}

describe('planning the narration fit', () => {
  it('reports only the scene whose voice outruns its picture', () => {
    const overruns = planNarrationFit(narratedProject(), 'video-1', 'voice-1')
    expect(overruns).toEqual([{
      sceneId: 's1',
      title: 'Opening',
      clipId: 'c1',
      startMs: 0,
      clipDurationMs: 4000,
      narrationEndMs: 5200,
      overrunMs: 1200,
      extendableMs: 1200
    }])
  })

  it('caps the extension at what the footage actually has left', () => {
    const base = narratedProject()
    const project: KinaouProject = {
      ...base,
      assets: base.assets.map((asset) => asset.id === 'v1'
        ? assetSchema.parse({ id: 'v1', kind: 'video', uri: 'KINAOU/Assets/v1.mp4', managed: true, metadata: { durationMs: 4400 } })
        : asset)
    }
    expect(planNarrationFit(project, 'video-1', 'voice-1')[0]).toMatchObject({
      overrunMs: 1200,
      extendableMs: 400,
      limit: 'The footage runs out before the narration does'
    })
  })

  it('refuses to stretch footage whose source length is unknown', () => {
    const base = narratedProject()
    const project: KinaouProject = {
      ...base,
      assets: base.assets.map((asset) => asset.id === 'v1'
        ? assetSchema.parse({ id: 'v1', kind: 'video', uri: 'KINAOU/Assets/v1.mp4', managed: true, metadata: {} })
        : asset)
    }
    expect(planNarrationFit(project, 'video-1', 'voice-1')[0]).toMatchObject({
      extendableMs: 0,
      limit: 'The source length of this footage is unknown, so it cannot be extended safely'
    })
  })

  it('measures a retimed clip in timeline milliseconds, not source milliseconds', () => {
    const base = narratedProject()
    const project: KinaouProject = {
      ...base,
      assets: base.assets.map((asset) => asset.id === 'v1'
        ? assetSchema.parse({ id: 'v1', kind: 'video', uri: 'KINAOU/Assets/v1.mp4', managed: true, metadata: { durationMs: 3000 } })
        : asset),
      tracks: base.tracks.map((track) => track.id !== 'video-1' ? track : {
        ...track,
        clips: track.clips.map((clip) => clip.id === 'c1' ? { ...clip, speed: 0.5 } : clip)
      })
    }
    // 4000ms of timeline at half speed consumes 2000ms of a 3000ms source, so the
    // remaining 1000ms of footage buys 2000ms of timeline — more than the overrun.
    expect(planNarrationFit(project, 'video-1', 'voice-1')[0]).toMatchObject({ overrunMs: 1200, extendableMs: 1200 })
  })

  it('says nothing about scenes without narration or without a placed visual', () => {
    const base = narratedProject()
    const project: KinaouProject = {
      ...base,
      storyboard: [...base.storyboard, { id: 's3', title: 'Ghost', description: 'Three.', durationMs: 1000, assetId: 'missing' }],
      tracks: base.tracks.map((track) => track.id !== 'voice-1' ? track : { ...track, clips: [] })
    }
    expect(planNarrationFit(project, 'video-1', 'voice-1')).toEqual([])
  })
})

describe('fitting the scenes to the narration', () => {
  it('extends the overrunning scene and moves everything after it by the same amount', () => {
    const result = fitScenesToNarration(narratedProject(), 'video-1', 'voice-1')
    const video = result.project.tracks.find((track) => track.id === 'video-1')!
    const voice = result.project.tracks.find((track) => track.id === 'voice-1')!

    expect(result.addedMs).toBe(1200)
    expect(result.remaining).toEqual([])
    expect(video.clips.find((clip) => clip.id === 'c1')).toMatchObject({ startMs: 0, durationMs: 5200 })
    expect(video.clips.find((clip) => clip.id === 'c2')).toMatchObject({ startMs: 4700, durationMs: 4000 })
    // The second scene's own narration travels with it, keeping its offset inside the scene.
    expect(voice.clips.find((clip) => clip.id === 'a2')).toMatchObject({ startMs: 4700, durationMs: 3000 })
    // The first scene's narration stays where it is — it is what the picture had to cover.
    expect(voice.clips.find((clip) => clip.id === 'a1')).toMatchObject({ startMs: 0, durationMs: 5200 })
  })

  it('keeps the cross-dissolve overlap exactly as wide as it was', () => {
    const before = narratedProject()
    const beforeVideo = before.tracks.find((track) => track.id === 'video-1')!
    const overlapBefore = beforeVideo.clips[0].startMs + beforeVideo.clips[0].durationMs - beforeVideo.clips[1].startMs

    const after = fitScenesToNarration(before, 'video-1', 'voice-1').project.tracks.find((track) => track.id === 'video-1')!
    const overlapAfter = after.clips[0].startMs + after.clips[0].durationMs - after.clips[1].startMs

    expect(overlapBefore).toBe(CROSSFADE_MS)
    expect(overlapAfter).toBe(CROSSFADE_MS)
    expect(after.clips[1].transitionIn).toEqual({ type: 'dissolve', durationMs: CROSSFADE_MS })
  })

  it('carries captions along with the scene they sit in', () => {
    const base = narratedProject()
    const project: KinaouProject = {
      ...base,
      assets: [...base.assets, assetSchema.parse({ id: 'cap', kind: 'caption', uri: 'caption:1', metadata: {} })],
      tracks: base.tracks.map((track) => track.id !== 'caption-1' ? track : {
        ...track,
        clips: [
          clipSchema.parse({ id: 'cc1', assetId: 'cap', startMs: 1000, durationMs: 2000 }),
          clipSchema.parse({ id: 'cc2', assetId: 'cap', startMs: 4000, durationMs: 2000 })
        ]
      })
    }
    const captions = fitScenesToNarration(project, 'video-1', 'voice-1').project.tracks.find((track) => track.id === 'caption-1')!
    // Inside scene one: it keeps its place, because the extra time is added behind it.
    expect(captions.clips.find((clip) => clip.id === 'cc1')).toMatchObject({ startMs: 1000 })
    // Inside scene two: it travels with the scene.
    expect(captions.clips.find((clip) => clip.id === 'cc2')).toMatchObject({ startMs: 5200 })
  })

  it('grants what it can and reports the rest instead of cutting the voice', () => {
    const base = narratedProject()
    const project: KinaouProject = {
      ...base,
      assets: base.assets.map((asset) => asset.id === 'v1'
        ? assetSchema.parse({ id: 'v1', kind: 'video', uri: 'KINAOU/Assets/v1.mp4', managed: true, metadata: { durationMs: 4400 } })
        : asset)
    }
    const result = fitScenesToNarration(project, 'video-1', 'voice-1')
    expect(result.addedMs).toBe(400)
    expect(result.fitted.map((entry) => entry.sceneId)).toEqual(['s1'])
    expect(result.remaining).toHaveLength(1)
    expect(result.remaining[0]).toMatchObject({ overrunMs: 800, extendableMs: 0 })
    const voice = result.project.tracks.find((track) => track.id === 'voice-1')!
    expect(voice.clips.find((clip) => clip.id === 'a1')!.durationMs).toBe(5200)
  })

  it('changes nothing when every scene already covers its narration', () => {
    const base = narratedProject()
    const project: KinaouProject = {
      ...base,
      tracks: base.tracks.map((track) => track.id !== 'voice-1' ? track : {
        ...track,
        clips: track.clips.map((clip) => clip.id === 'a1' ? { ...clip, durationMs: 3000 } : clip)
      })
    }
    const result = fitScenesToNarration(project, 'video-1', 'voice-1')
    expect(result).toMatchObject({ fitted: [], remaining: [], addedMs: 0 })
    expect(result.project).toBe(project)
  })

  it('refuses rather than half-applying when a track it would move is locked', () => {
    const base = narratedProject()
    const project: KinaouProject = {
      ...base,
      tracks: base.tracks.map((track) => track.id === 'caption-1'
        ? { ...track, locked: true, clips: [clipSchema.parse({ id: 'cc2', assetId: 'v2', startMs: 4000, durationMs: 2000 })] }
        : track)
    }
    expect(() => fitScenesToNarration(project, 'video-1', 'voice-1')).toThrow(/locked track: Captions/)
    const locked = { ...project, tracks: project.tracks.map((track) => track.id === 'video-1' ? { ...track, locked: true } : track) }
    expect(() => fitScenesToNarration(locked, 'video-1', 'voice-1')).toThrow(/"Main Video" is locked/)
  })

  it('refuses an unknown track', () => {
    expect(() => planNarrationFit(narratedProject(), 'nope', 'voice-1')).toThrow(/not found: nope/)
    expect(() => fitScenesToNarration(narratedProject(), 'video-1', 'nope')).toThrow(/not found: nope/)
  })
})

describe('what the fit does to the rendered video', () => {
  it('lengthens the composed video so the whole narration lands inside it', () => {
    const before = narratedProject()
    const after = fitScenesToNarration(before, 'video-1', 'voice-1').project
    const plan = (project: KinaouProject) => createTimelinePreviewPlan(project)

    expect(plan(after).durationMs - plan(before).durationMs).toBe(1200)

    const narration = plan(after).clips.find((clip) => clip.asset.uri.endsWith('n1.wav'))!
    const picture = plan(after).clips.find((clip) => clip.asset.uri.endsWith('v1.png'))!
    expect(narration.startMs + narration.durationMs).toBeLessThanOrEqual(picture.startMs + picture.durationMs)
  })

  it('leaves the narration hanging past the picture when nothing is fitted', () => {
    const plan = createTimelinePreviewPlan(narratedProject())
    const narration = plan.clips.find((clip) => clip.asset.uri.endsWith('n1.wav'))!
    const picture = plan.clips.find((clip) => clip.asset.uri.endsWith('v1.png'))!
    expect(narration.startMs + narration.durationMs).toBeGreaterThan(picture.startMs + picture.durationMs)
  })
})
