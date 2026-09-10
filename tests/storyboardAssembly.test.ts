import { describe, expect, it } from 'vitest'
import { assetSchema, createProject, trackSchema, type KinaouProject } from '../src/core/project'
import { assembleTimelineFromStoryboard, assemblyTargetTracks, fulfilledSceneCount } from '../src/core/storyboardAssembly'

function image(id: string) {
  return assetSchema.parse({ id, kind: 'image', uri: `KINAOU/Assets/WebCaptures/${id}.png`, managed: true, offline: false, metadata: { name: id } })
}

function video(id: string, durationMs?: number) {
  return assetSchema.parse({ id, kind: 'video', uri: `KINAOU/Assets/${id}.mp4`, managed: true, offline: false, metadata: { name: id, ...(durationMs ? { durationMs } : {}) } })
}

function scene(id: string, durationMs: number, assetId?: string) {
  return { id, title: `Scene ${id}`, description: '', durationMs, ...(assetId ? { assetId } : {}) }
}

function baseProject(overrides: Partial<KinaouProject> = {}): KinaouProject {
  return {
    ...createProject('Assembly'),
    tracks: [trackSchema.parse({ id: 'video-1', type: 'video', name: 'Main Video', clips: [] })],
    ...overrides
  }
}

describe('storyboard assembly', () => {
  it('places fulfilled scenes back to back in storyboard order', () => {
    const project = baseProject({
      assets: [image('a1'), video('a2', 10_000)],
      storyboard: [scene('s1', 4000, 'a1'), scene('s2', 6000, 'a2')]
    })
    expect(fulfilledSceneCount(project)).toBe(2)

    const result = assembleTimelineFromStoryboard(project, 'video-1')
    expect(result.skipped).toEqual([])
    expect(result.placed.map((entry) => [entry.sceneId, entry.startMs, entry.durationMs])).toEqual([
      ['s1', 0, 4000],
      ['s2', 4000, 6000]
    ])
    const clips = result.project.tracks[0].clips
    expect(clips.map((clip) => clip.assetId)).toEqual(['a1', 'a2'])
    expect(clips.every((clip) => clip.speed === 1 && clip.sourceOffsetMs === 0)).toBe(true)
  })

  it('never stretches a video beyond its real footage but holds a still for the full scene', () => {
    const project = baseProject({
      assets: [video('short', 2000), image('still')],
      storyboard: [scene('s1', 8000, 'short'), scene('s2', 9000, 'still')]
    })
    const result = assembleTimelineFromStoryboard(project, 'video-1')
    expect(result.placed[0]).toMatchObject({ durationMs: 2000, trimmedToSource: true })
    expect(result.placed[1]).toMatchObject({ startMs: 2000, durationMs: 9000, trimmedToSource: false })
  })

  it('appends after existing clips and skips visuals already on the track', () => {
    const project = baseProject({
      assets: [image('a1'), image('a2')],
      storyboard: [scene('s1', 3000, 'a1'), scene('s2', 3000, 'a2')]
    })
    const first = assembleTimelineFromStoryboard(project, 'video-1').project
    const withNewScene = { ...first, storyboard: [...first.storyboard, scene('s3', 5000, 'a1')] }

    const second = assembleTimelineFromStoryboard(withNewScene, 'video-1')
    expect(second.placed).toEqual([])
    expect(second.skipped.map((entry) => entry.sceneId)).toEqual(['s1', 's2', 's3'])
    expect(second.skipped[2].reason).toMatch(/already on "Main Video"/)
    expect(second.project.tracks[0].clips).toHaveLength(2)
  })

  it('reports per-scene reasons instead of failing the whole run', () => {
    const project = baseProject({
      assets: [
        image('ok'),
        { ...image('gone'), offline: true },
        { ...image('external'), managed: false, uri: 'kinaou://planning/external' },
        assetSchema.parse({ id: 'sound', kind: 'audio', uri: 'KINAOU/Assets/sound.wav', managed: true, offline: false, metadata: {} })
      ],
      storyboard: [
        scene('empty', 3000),
        scene('good', 3000, 'ok'),
        scene('offline', 3000, 'gone'),
        scene('unmanaged', 3000, 'external'),
        scene('audio', 3000, 'sound'),
        scene('missing', 3000, 'not-in-project')
      ]
    })
    const result = assembleTimelineFromStoryboard(project, 'video-1')
    expect(result.placed.map((entry) => entry.sceneId)).toEqual(['good'])
    expect(Object.fromEntries(result.skipped.map((entry) => [entry.sceneId, entry.reason]))).toEqual({
      empty: 'Scene has no visual yet',
      offline: 'Its visual is offline — reconnect the media first',
      unmanaged: 'Only managed KINAOU media can be placed on the timeline',
      audio: 'A audio asset cannot fill a visual scene',
      missing: 'The assigned visual is missing from this project'
    })
    expect(result.project.tracks[0].clips).toHaveLength(1)
  })

  it('refuses locked tracks, non-visual tracks and empty storyboards', () => {
    const assets = [image('a1')]
    const storyboard = [scene('s1', 3000, 'a1')]
    const locked = baseProject({ assets, storyboard, tracks: [trackSchema.parse({ id: 'video-1', type: 'video', name: 'Main Video', locked: true, clips: [] })] })
    expect(() => assembleTimelineFromStoryboard(locked, 'video-1')).toThrow(/locked/)

    const audioTrack = baseProject({ assets, storyboard, tracks: [trackSchema.parse({ id: 'voice-1', type: 'voice', name: 'Voice', clips: [] })] })
    expect(() => assembleTimelineFromStoryboard(audioTrack, 'voice-1')).toThrow(/visual track/)
    expect(assemblyTargetTracks(audioTrack)).toEqual([])

    expect(() => assembleTimelineFromStoryboard(baseProject({ assets }), 'video-1')).toThrow(/no storyboard scenes/)
    expect(() => assembleTimelineFromStoryboard(baseProject({ assets, storyboard }), 'nope')).toThrow(/not found/)
  })

  it('leaves the project untouched when nothing can be placed', () => {
    const project = baseProject({ storyboard: [scene('s1', 3000)] })
    const result = assembleTimelineFromStoryboard(project, 'video-1')
    expect(result.placed).toEqual([])
    expect(result.project).toBe(project)
  })
})
