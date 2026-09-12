import { describe, expect, it } from 'vitest'
import { assetSchema, clipSchema, createProject, trackSchema } from '../src/core/project'
import { planShortExportRanges, shortExportVariant } from '../src/core/shortExportRanges'

function project() {
  const base = createProject('Shorts')
  const asset = assetSchema.parse({ id: 'a', kind: 'image', uri: 'KINAOU/Assets/a.png', managed: true })
  const clips = [
    clipSchema.parse({ id: 'c1', assetId: 'a', sceneId: 's1', startMs: 0, durationMs: 20_000 }),
    clipSchema.parse({ id: 'c2', assetId: 'a', sceneId: 's2', startMs: 19_500, durationMs: 30_000 }),
    clipSchema.parse({ id: 'c3', assetId: 'a', sceneId: 's3', startMs: 70_000, durationMs: 10_000 })
  ]
  return { ...base, storyboard: [
    { id: 's1', title: 'Hook', description: '', durationMs: 20_000 },
    { id: 's2', title: 'Proof', description: '', durationMs: 30_000 },
    { id: 's3', title: 'CTA', description: '', durationMs: 10_000 },
    { id: 'missing', title: 'Missing', description: '', durationMs: 5000 }
  ], assets: [asset], tracks: [trackSchema.parse({ id: 'v', type: 'video', name: 'Video', clips })] }
}

describe('short export range planning', () => {
  it('groups contiguous scene clips without exceeding the limit', () => {
    const result = planShortExportRanges(project())
    expect(result.candidates).toEqual([
      { id: 's1--s2', sceneIds: ['s1', 's2'], titles: ['Hook', 'Proof'], inMs: 0, outMs: 49_500, durationMs: 49_500 },
      { id: 's3', sceneIds: ['s3'], titles: ['CTA'], inMs: 70_000, outMs: 80_000, durationMs: 10_000 }
    ])
    expect(result.skipped).toEqual([{ sceneId: 'missing', title: 'Missing', reason: 'Scene is not anchored to an active visual timeline clip.' }])
  })

  it('reports a scene that exceeds the chosen duration instead of silently truncating it', () => {
    const result = planShortExportRanges(project(), 15_000)
    expect(result.skipped.filter((item) => item.reason.includes('candidate limit')).map((item) => item.sceneId)).toEqual(['s1', 's2'])
    expect(result.candidates.map((item) => item.sceneIds)).toEqual([['s3']])
  })

  it('ignores muted visual tracks and validates the duration bound', () => {
    const input = project()
    expect(planShortExportRanges({ ...input, tracks: input.tracks.map((track) => ({ ...track, muted: true })) }).candidates).toEqual([])
    expect(() => planShortExportRanges(input, 999)).toThrow(/between 1 second/)
  })

  it('creates a stable safe variant name from the reviewed scene range', () => {
    const candidate = planShortExportRanges(project()).candidates[0]
    expect(shortExportVariant(candidate)).toBe('short-hook-proof-0-49500')
    expect(shortExportVariant({ ...candidate, titles: ['🔥 / ??'] })).toBe('short-scenes-0-49500')
  })
})
