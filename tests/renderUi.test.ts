import { describe, expect, it } from 'vitest'
import { createProject, assetSchema, clipSchema, trackSchema } from '../src/core/project'
import { renderOutputPath, renderReadiness } from '../src/core/renderUi'

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

    const planning = { ...asset, managed: false, uri: 'kinaou://planning/a1' }
    expect(renderReadiness({ ...base, assets: [planning], tracks: [track] }).reason).toMatch(/managed/)
  })
})
