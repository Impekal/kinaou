import { describe, expect, it } from 'vitest'
import { createProject, assetSchema, clipSchema, trackSchema } from '../src/core/project'
import { renderOutputPath, renderReadiness } from '../src/core/renderUi'
import { clipSpeedFitsSource } from '../src/core/timeline'

describe('render UI helpers', () => {
  it('creates deterministic safe output paths inside KINAOU/Renders', () => {
    const project = createProject('São Tomé — Film!')
    expect(renderOutputPath(project, new Date('2026-09-06T00:30:00.000Z'))).toBe('KINAOU/Renders/sao-tome-film_2026-09-06_00-30-00-000.mp4')
  })

  it('requires real managed online assets for every timeline clip', () => {
    const base = createProject('Render')
    expect(renderReadiness(base).ready).toBe(false)

    const asset = assetSchema.parse({ id: 'a1', kind: 'video', uri: 'KINAOU/Assets/demo.mp4', managed: true, offline: false, metadata: {} })
    const clip = clipSchema.parse({ id: 'c1', assetId: asset.id, startMs: 0, durationMs: 1000 })
    const track = trackSchema.parse({ id: 't1', type: 'video', name: 'Video', clips: [clip] })
    expect(renderReadiness({ ...base, assets: [asset], tracks: [track] })).toEqual({ ready: true })

    const retimedTrack = { ...track, clips: [{ ...clip, speed: 2 }] }
    expect(renderReadiness({ ...base, assets: [asset], tracks: [retimedTrack] })).toEqual({ ready: true })

    const planning = { ...asset, managed: false, uri: 'kinaou://planning/a1' }
    expect(renderReadiness({ ...base, assets: [planning], tracks: [track] }).reason).toMatch(/managed/)
  })

  it('reports a clear reason instead of throwing when retiming exceeds the source duration', () => {
    const base = createProject('Render')
    const asset = assetSchema.parse({ id: 'a1', kind: 'video', uri: 'KINAOU/Assets/demo.mp4', managed: true, offline: false, metadata: { durationMs: 1000 } })
    const clip = clipSchema.parse({ id: 'c1', assetId: asset.id, startMs: 0, durationMs: 1000 })
    const track = trackSchema.parse({ id: 't1', type: 'video', name: 'Main Video', clips: [clip] })

    expect(renderReadiness({ ...base, assets: [asset], tracks: [track] })).toEqual({ ready: true })

    const overRetimed = { ...track, clips: [{ ...clip, speed: 2 }] }
    const readiness = renderReadiness({ ...base, assets: [asset], tracks: [overRetimed] })
    expect(readiness.ready).toBe(false)
    expect(readiness.reason).toMatch(/source media/)
    expect(readiness.reason).toMatch(/Main Video/)

    const shortened = { ...track, clips: [{ ...clip, speed: 2, durationMs: 500 }] }
    expect(renderReadiness({ ...base, assets: [asset], tracks: [shortened] })).toEqual({ ready: true })
  })
})

describe('clipSpeedFitsSource', () => {
  const clip = clipSchema.parse({ id: 'c1', assetId: 'a1', startMs: 0, durationMs: 1000 })

  it('rejects speeds that need more source media than the asset has', () => {
    const asset = assetSchema.parse({ id: 'a1', kind: 'video', uri: 'KINAOU/Assets/demo.mp4', managed: true, offline: false, metadata: { durationMs: 1000 } })
    expect(clipSpeedFitsSource(asset, clip, 1)).toBe(true)
    expect(clipSpeedFitsSource(asset, clip, 2)).toBe(false)
    expect(clipSpeedFitsSource(asset, { ...clip, sourceOffsetMs: 500 }, 1)).toBe(false)
  })

  it('always fits when the source duration is unknown or the asset is not retimed media', () => {
    const unknownDuration = assetSchema.parse({ id: 'a1', kind: 'video', uri: 'KINAOU/Assets/demo.mp4', managed: true, offline: false, metadata: {} })
    expect(clipSpeedFitsSource(unknownDuration, clip, 4)).toBe(true)
    const image = assetSchema.parse({ id: 'a2', kind: 'image', uri: 'KINAOU/Assets/still.png', managed: true, offline: false, metadata: { durationMs: 1 } })
    expect(clipSpeedFitsSource(image, clip, 4)).toBe(true)
    expect(clipSpeedFitsSource(undefined, clip, 4)).toBe(true)
  })
})
