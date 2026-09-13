import { describe, expect, it } from 'vitest'
import { assetSchema, clipSchema, createProject, trackSchema } from '../src/core/project'
import { createRenderPlan, formatProfiles } from '../src/core/render'
import { createRangeRenderPlan } from '../src/core/renderRange'
import { planShortExportBatch, planShortExportRanges, projectShortExportMaximum, setProjectShortExportMaximum, shortExportMaximumError, shortExportVariant, shortPreviewOutputPath } from '../src/core/shortExportRanges'

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

  it('persists a validated project-specific candidate maximum without breaking older projects', () => {
    const input = project()
    expect(projectShortExportMaximum(input)).toBe(60_000)
    expect(projectShortExportMaximum({ ...input, metadata: { shortExportMaximumMs: 'invalid' } })).toBe(60_000)
    expect(projectShortExportMaximum({ ...input, metadata: { shortExportMaximumMs: '30000' } })).toBe(60_000)
    const updated = setProjectShortExportMaximum(input, 30_000, new Date('2026-09-12T10:00:00.000Z'))
    expect(projectShortExportMaximum(updated)).toBe(30_000)
    expect(updated.metadata.shortExportMaximumMs).toBe(30_000)
    expect(updated.updatedAt).toBe('2026-09-12T10:00:00.000Z')
    expect(setProjectShortExportMaximum(updated, 30_000)).toBe(updated)
    expect(() => setProjectShortExportMaximum(input, 600_001)).toThrow(/between 1 second/)
    expect(shortExportMaximumError(60_000)).toBeUndefined()
  })

  it('replans real scene groups when the project maximum changes', () => {
    const input = project()
    const maximum = projectShortExportMaximum(setProjectShortExportMaximum(input, 30_000))
    const result = planShortExportRanges(input, maximum)
    expect(result.candidates.map((candidate) => candidate.sceneIds)).toEqual([['s1'], ['s2'], ['s3']])
    expect(result.candidates.every((candidate) => candidate.durationMs <= maximum)).toBe(true)
  })

  it('creates a stable safe variant name from the reviewed scene range', () => {
    const candidate = planShortExportRanges(project()).candidates[0]
    expect(shortExportVariant(candidate)).toBe('short-hook-proof-0-49500')
    expect(shortExportVariant({ ...candidate, titles: ['🔥 / ??'] })).toBe('short-scenes-0-49500')
  })

  it('creates a unique managed preview plan for the exact reviewed range', () => {
    const input = { ...project(), id: 'Project / 1' }
    const candidate = planShortExportRanges(input).candidates[1]
    const path = shortPreviewOutputPath(input, candidate, 'vertical')
    expect(path).toBe('KINAOU/Cache/Previews/Project1_vertical_short-cta-70000-80000.mp4')
    const full = createRenderPlan(input, formatProfiles.vertical.preview, path)
    const preview = createRangeRenderPlan(full, { inMs: candidate.inMs, outMs: candidate.outMs }, path)
    expect(preview.purpose).toBe('preview')
    expect(preview.durationMs).toBe(10_000)
    expect(preview.clips.map((clip) => ({ id: clip.clipId, startMs: clip.startMs }))).toEqual([{ id: 'c3', startMs: 0 }])
    expect(() => shortPreviewOutputPath(input, candidate, 'portrait' as never)).toThrow(/Unknown/)
  })

  it('plans selected reviewed candidates as unique managed batch outputs in timeline order', () => {
    const input = project()
    const candidates = planShortExportRanges(input).candidates
    const items = planShortExportBatch(input, candidates, ['s3', 's1--s2'], ['vertical'], new Date('2026-09-12T08:00:00.000Z'))
    expect(items.map((item) => ({ id: item.id, inMs: item.inMs, outMs: item.outMs }))).toEqual([
      { id: 's1--s2:vertical', inMs: 0, outMs: 49_500 },
      { id: 's3:vertical', inMs: 70_000, outMs: 80_000 }
    ])
    expect(items.map((item) => ({ format: item.format, sceneIds: item.sceneIds }))).toEqual([
      { format: 'vertical', sceneIds: ['s1', 's2'] },
      { format: 'vertical', sceneIds: ['s3'] }
    ])
    expect(items.map((item) => item.outputPath)).toEqual([
      'KINAOU/Renders/shorts_verticalshorthookproof049500_2026-09-12_08-00-00-000.mp4',
      'KINAOU/Renders/shorts_verticalshortcta7000080000_2026-09-12_08-00-00-000.mp4'
    ])
    expect(new Set(items.map((item) => item.outputPath)).size).toBe(items.length)
    const plans = items.map((item) => createRangeRenderPlan(createRenderPlan(input, formatProfiles.vertical.export, item.outputPath), { inMs: item.inMs, outMs: item.outMs }, item.outputPath))
    expect(plans.map((plan) => plan.durationMs)).toEqual([49_500, 10_000])
    expect(plans[1].clips.map((clip) => ({ id: clip.clipId, startMs: clip.startMs }))).toEqual([{ id: 'c3', startMs: 0 }])
  })

  it('expands reviewed candidates into unique sequential format variants', () => {
    const input = project()
    const candidate = planShortExportRanges(input).candidates[1]
    const items = planShortExportBatch(input, [candidate], [candidate.id], ['vertical', 'square', 'vertical'], new Date('2026-09-12T09:00:00.000Z'))
    expect(items.map((item) => ({ id: item.id, format: item.format, sceneIds: item.sceneIds }))).toEqual([
      { id: 's3:vertical', format: 'vertical', sceneIds: ['s3'] },
      { id: 's3:square', format: 'square', sceneIds: ['s3'] }
    ])
    expect(items.map((item) => ({ width: formatProfiles[item.format].export.width, height: formatProfiles[item.format].export.height }))).toEqual([
      { width: 1080, height: 1920 },
      { width: 1080, height: 1080 }
    ])
    expect(items.map((item) => item.outputPath)).toEqual([
      'KINAOU/Renders/shorts_verticalshortcta7000080000_2026-09-12_09-00-00-000.mp4',
      'KINAOU/Renders/shorts_squareshortcta7000080000_2026-09-12_09-00-00-000.mp4'
    ])
  })

  it('refuses empty or stale batch selections', () => {
    const input = project()
    const candidates = planShortExportRanges(input).candidates
    expect(() => planShortExportBatch(input, candidates, [], ['vertical'])).toThrow(/Select at least one/)
    expect(() => planShortExportBatch(input, candidates, ['removed-scene'], ['vertical'])).toThrow(/no longer available/)
    expect(() => planShortExportBatch(input, candidates, [candidates[0].id], [])).toThrow(/output format/)
    expect(() => planShortExportBatch(input, candidates, [candidates[0].id], ['portrait' as never])).toThrow(/not supported/)
  })
})
