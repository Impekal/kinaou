import { describe, expect, it } from 'vitest'
import { assetSchema, clipSchema, createProject, trackSchema, type KinaouProject } from '../src/core/project'
import { alignCaptionsToScenes, planCaptionAlignment } from '../src/core/captionAlignment'

function caption(id: string, sceneId: string, text: string) {
  return assetSchema.parse({ id, kind: 'caption', uri: `kinaou://caption/${id}`, managed: true, metadata: { text, sceneId, source: 'storyboard-description' } })
}

/**
 * One scene of 4s with three captions written across it, plus a second scene that
 * starts right after — the neighbour a drifting caption would spill over.
 */
function captionedProject(): KinaouProject {
  return {
    ...createProject('Align'),
    assets: [
      assetSchema.parse({ id: 'v1', kind: 'image', uri: 'KINAOU/Assets/v1.png', managed: true, metadata: {} }),
      assetSchema.parse({ id: 'v2', kind: 'image', uri: 'KINAOU/Assets/v2.png', managed: true, metadata: {} }),
      caption('t1', 's1', 'First line.'),
      caption('t2', 's1', 'Second line.'),
      caption('t3', 's1', 'Third line.')
    ],
    tracks: [
      trackSchema.parse({
        id: 'video-1',
        type: 'video',
        name: 'Main Video',
        clips: [
          clipSchema.parse({ id: 'c1', assetId: 'v1', startMs: 0, durationMs: 4000, sceneId: 's1' }),
          clipSchema.parse({ id: 'c2', assetId: 'v2', startMs: 4000, durationMs: 4000, sceneId: 's2' })
        ]
      }),
      trackSchema.parse({
        id: 'caption-1',
        type: 'caption',
        name: 'Captions',
        clips: [
          clipSchema.parse({ id: 'cc1', assetId: 't1', startMs: 0, durationMs: 1000 }),
          clipSchema.parse({ id: 'cc2', assetId: 't2', startMs: 1000, durationMs: 1000 }),
          clipSchema.parse({ id: 'cc3', assetId: 't3', startMs: 2000, durationMs: 2000 })
        ]
      })
    ],
    storyboard: [
      { id: 's1', title: 'Opening', description: 'First line. Second line. Third line.', durationMs: 4000, assetId: 'v1' },
      { id: 's2', title: 'Closing', description: 'Later.', durationMs: 4000, assetId: 'v2' }
    ]
  }
}

/** The same project after its first scene was stretched to cover a longer narration. */
function stretched(project = captionedProject(), toMs = 8000): KinaouProject {
  return {
    ...project,
    tracks: project.tracks.map((track) => track.id !== 'video-1' ? track : {
      ...track,
      clips: track.clips.map((clip) => clip.sceneId === 's1' ? { ...clip, durationMs: toMs } : { ...clip, startMs: toMs })
    })
  }
}

const captionClips = (project: KinaouProject) => project.tracks.find((track) => track.id === 'caption-1')!.clips

describe('planning the caption alignment', () => {
  it('says nothing while the captions still sit over their scene', () => {
    expect(planCaptionAlignment(captionedProject(), 'video-1')).toEqual({ drifted: [], skipped: [] })
  })

  it('reports the scene whose captions no longer span it', () => {
    expect(planCaptionAlignment(stretched(), 'video-1').drifted).toEqual([{
      sceneId: 's1',
      title: 'Opening',
      captions: 3,
      fromStartMs: 0,
      fromDurationMs: 4000,
      toStartMs: 0,
      toDurationMs: 8000
    }])
  })

  it('refuses to squeeze more captions into a scene than can be read', () => {
    const { drifted, skipped } = planCaptionAlignment(stretched(captionedProject(), 600), 'video-1')
    expect(drifted).toEqual([])
    expect(skipped[0].reason).toMatch(/3 captions cannot be read in 0.6s/)
  })

  it('reports captions whose scene is not on the track', () => {
    const base = captionedProject()
    const orphaned: KinaouProject = {
      ...base,
      tracks: base.tracks.map((track) => track.id !== 'video-1' ? track : { ...track, clips: track.clips.filter((clip) => clip.sceneId !== 's1') })
    }
    expect(planCaptionAlignment(orphaned, 'video-1').skipped[0].reason).toMatch(/not on "Main Video"/)
  })

  it('refuses an unknown track and a project without captions', () => {
    expect(() => planCaptionAlignment(captionedProject(), 'nope')).toThrow(/not found: nope/)
    const base = captionedProject()
    const trackless = { ...base, tracks: base.tracks.filter((track) => track.type !== 'caption') }
    expect(() => planCaptionAlignment(trackless, 'video-1')).toThrow(/no caption track/)
  })
})

describe('aligning the captions', () => {
  it('stretches them over the scene without changing a word', () => {
    const before = captionedProject()
    const result = alignCaptionsToScenes(stretched(before), 'video-1')
    const clips = captionClips(result.project)

    expect(clips.map((clip) => [clip.startMs, clip.durationMs])).toEqual([[0, 2000], [2000, 2000], [4000, 4000]])
    // The last caption ends exactly where the scene does.
    expect(clips[2].startMs + clips[2].durationMs).toBe(8000)
    expect(result.project.assets.filter((asset) => asset.kind === 'caption').map((asset) => asset.metadata.text))
      .toEqual(['First line.', 'Second line.', 'Third line.'])
  })

  it('pulls them back in when the scene got shorter, so none spills over the next one', () => {
    const shortened: KinaouProject = {
      ...captionedProject(),
      tracks: captionedProject().tracks.map((track) => track.id !== 'video-1' ? track : {
        ...track,
        clips: track.clips.map((clip) => clip.sceneId === 's1' ? { ...clip, durationMs: 2000 } : clip)
      })
    }
    const clips = captionClips(alignCaptionsToScenes(shortened, 'video-1').project)
    expect(clips.map((clip) => [clip.startMs, clip.durationMs])).toEqual([[0, 500], [500, 500], [1000, 1000]])
    expect(Math.max(...clips.map((clip) => clip.startMs + clip.durationMs))).toBe(2000)
  })

  it('follows a scene that moved as well as one that resized', () => {
    const moved: KinaouProject = {
      ...captionedProject(),
      tracks: captionedProject().tracks.map((track) => track.id !== 'video-1' ? track : {
        ...track,
        clips: track.clips.map((clip) => clip.sceneId === 's1' ? { ...clip, startMs: 5000 } : { ...clip, startMs: 9000 })
      })
    }
    const clips = captionClips(alignCaptionsToScenes(moved, 'video-1').project)
    expect(clips.map((clip) => [clip.startMs, clip.durationMs])).toEqual([[5000, 1000], [6000, 1000], [7000, 2000]])
  })

  it('refuses a locked caption track rather than half-applying', () => {
    const base = stretched()
    const locked = { ...base, tracks: base.tracks.map((track) => track.type === 'caption' ? { ...track, locked: true } : track) }
    expect(() => alignCaptionsToScenes(locked, 'video-1')).toThrow(/"Captions" is locked/)
  })

  it('changes nothing when nothing drifted', () => {
    const project = captionedProject()
    expect(alignCaptionsToScenes(project, 'video-1').project).toBe(project)
  })
})
