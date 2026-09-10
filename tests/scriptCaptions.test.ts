import { describe, expect, it } from 'vitest'
import { assetSchema, clipSchema, createProject, trackSchema, type KinaouProject } from '../src/core/project'
import { captionsFromStoryboard, distributeCaptionTimings, splitCaptionText } from '../src/core/scriptCaptions'

function projectWithAssembledScene(description: string, durationMs = 8000): KinaouProject {
  const asset = assetSchema.parse({ id: 'a1', kind: 'image', uri: 'KINAOU/Assets/WebCaptures/a1.png', managed: true, offline: false, metadata: {} })
  const clip = clipSchema.parse({ id: 'c1', assetId: 'a1', startMs: 2000, durationMs })
  return {
    ...createProject('Captions'),
    assets: [asset],
    tracks: [
      trackSchema.parse({ id: 'video-1', type: 'video', name: 'Main Video', clips: [clip] }),
      trackSchema.parse({ id: 'caption-1', type: 'caption', name: 'Captions', clips: [] })
    ],
    storyboard: [{ id: 's1', title: 'Opening scene', description, durationMs: 8000, assetId: 'a1' }]
  }
}

describe('caption text splitting', () => {
  it('splits on sentence boundaries and packs short sentences together', () => {
    const prose = 'Open the browser. Click the address bar. Type the URL and press enter.'
    expect(splitCaptionText(prose, 45)).toEqual([
      'Open the browser. Click the address bar.',
      'Type the URL and press enter.'
    ])
    // Within one caption's worth of characters the sentences stay together.
    expect(splitCaptionText(prose)).toEqual([prose])
  })

  it('falls back to word boundaries for one over-long sentence', () => {
    const chunks = splitCaptionText(`${'word '.repeat(40)}end.`, 40)
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.every((chunk) => chunk.length <= 40)).toBe(true)
    expect(chunks.join(' ').replace(/\s+/g, ' ')).toBe(`${'word '.repeat(40)}end.`.replace(/\s+/g, ' ').trim())
  })

  it('normalises whitespace and returns nothing for empty prose', () => {
    expect(splitCaptionText('  Two   spaces\n\nhere.  ')).toEqual(['Two spaces here.'])
    expect(splitCaptionText('   ')).toEqual([])
  })
})

describe('caption timing distribution', () => {
  it('fills the clip exactly, weighted by text length', () => {
    const timings = distributeCaptionTimings(['short', 'a much longer caption line'], 1000, 6000)
    expect(timings[0].startMs).toBe(1000)
    expect(timings.at(-1)!.startMs + timings.at(-1)!.durationMs).toBe(7000)
    expect(timings[1].durationMs).toBeGreaterThan(timings[0].durationMs)
  })

  it('merges overflow into the last caption on a brief clip instead of dropping text', () => {
    const timings = distributeCaptionTimings(['one', 'two', 'three', 'four'], 0, 1500)
    expect(timings).toHaveLength(2)
    expect(timings.map((entry) => entry.text)).toEqual(['one', 'two three four'])
    expect(timings.at(-1)!.startMs + timings.at(-1)!.durationMs).toBe(1500)
  })

  it('keeps every word even when only one caption fits', () => {
    const timings = distributeCaptionTimings(['alpha', 'beta', 'gamma'], 0, 500)
    expect(timings).toEqual([{ text: 'alpha beta gamma', startMs: 0, durationMs: 500 }])
  })

  it('returns nothing without chunks', () => {
    expect(distributeCaptionTimings([], 0, 5000)).toEqual([])
  })
})

describe('captions from the storyboard', () => {
  it('aligns captions to the clip on the timeline, not to the planned scene duration', () => {
    const project = projectWithAssembledScene('First sentence here. Second sentence follows.', 4000)
    const result = captionsFromStoryboard(project, 'video-1')

    expect(result.skipped).toEqual([])
    expect(result.captioned).toEqual([{ sceneId: 's1', title: 'Opening scene', captions: 1, startMs: 2000, durationMs: 4000 }])

    const captionClips = result.project.tracks.find((track) => track.type === 'caption')!.clips
    expect(captionClips).toHaveLength(1)
    expect(captionClips[0].startMs).toBe(2000)
    expect(captionClips[0].durationMs).toBe(4000)

    const captionAssets = result.project.assets.filter((asset) => asset.kind === 'caption')
    expect(captionAssets[0].metadata).toMatchObject({ sceneId: 's1', source: 'storyboard-description' })
    expect(captionAssets[0].metadata.text).toBe('First sentence here. Second sentence follows.')
  })

  it('is re-runnable: a scene that already has captions is skipped', () => {
    const project = projectWithAssembledScene('Something to say.')
    const first = captionsFromStoryboard(project, 'video-1')
    const second = captionsFromStoryboard(first.project, 'video-1')

    expect(second.captioned).toEqual([])
    expect(second.skipped[0].reason).toMatch(/already has captions/)
    expect(second.project.tracks.find((track) => track.type === 'caption')!.clips).toHaveLength(1)
  })

  it('reports per-scene reasons for scenes it cannot caption', () => {
    const base = projectWithAssembledScene('Fine scene text.')
    const project: KinaouProject = {
      ...base,
      storyboard: [
        ...base.storyboard,
        { id: 'no-visual', title: 'No visual', description: 'Has text but no asset', durationMs: 3000 },
        { id: 'not-placed', title: 'Not placed', description: 'Assigned but not assembled', durationMs: 3000, assetId: 'ghost' },
        { id: 'no-text', title: 'No text', description: '   ', durationMs: 3000, assetId: 'a1' }
      ]
    }
    const result = captionsFromStoryboard(project, 'video-1')
    expect(result.captioned.map((entry) => entry.sceneId)).toEqual(['s1'])
    expect(Object.fromEntries(result.skipped.map((entry) => [entry.sceneId, entry.reason]))).toEqual({
      'no-visual': 'Scene has no visual on the timeline yet',
      'not-placed': 'Its visual is not on "Main Video" — assemble the timeline first',
      'no-text': 'Scene has no description to read out'
    })
  })

  it('refuses to run without a usable caption track or storyboard', () => {
    const project = projectWithAssembledScene('Text.')
    const locked = { ...project, tracks: project.tracks.map((track) => track.type === 'caption' ? { ...track, locked: true } : track) }
    expect(() => captionsFromStoryboard(locked, 'video-1')).toThrow(/locked/)

    const noCaptionTrack = { ...project, tracks: project.tracks.filter((track) => track.type !== 'caption') }
    expect(() => captionsFromStoryboard(noCaptionTrack, 'video-1')).toThrow(/no caption track/)

    expect(() => captionsFromStoryboard({ ...project, storyboard: [] }, 'video-1')).toThrow(/no storyboard scenes/)
    expect(() => captionsFromStoryboard(project, 'missing')).toThrow(/not found/)
  })
})
