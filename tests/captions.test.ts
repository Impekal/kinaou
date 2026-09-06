import { describe, expect, it } from 'vitest'
import { addCaption, updateCaptionText } from '../src/core/captions'
import { createProjectFromInput } from '../src/core/create'
import { createRenderPlan, preview1080pPreset } from '../src/core/render'
import { renderReadiness } from '../src/core/renderUi'

describe('structured captions', () => {
  it('creates and edits timed caption assets without filesystem paths', () => {
    const project = createProjectFromInput({ title: 'Captions', kind: 'idea', content: 'Demo' })
    const withCaption = addCaption(project, { text: 'Grüße, 世界\nSecond line', startMs: 1250, durationMs: 2750 })
    const track = withCaption.tracks.find((item) => item.type === 'caption')!
    const asset = withCaption.assets.find((item) => item.kind === 'caption')!
    expect(asset.uri).toMatch(/^kinaou:\/\/caption\//)
    expect(asset.metadata.text).toBe('Grüße, 世界\nSecond line')
    expect(track.clips[0]).toMatchObject({ startMs: 1250, durationMs: 2750, assetId: asset.id })
    expect(updateCaptionText(withCaption, asset.id, 'Edited').assets.find((item) => item.id === asset.id)?.metadata.text).toBe('Edited')
  })

  it('allows captions through readiness and the deterministic render plan', () => {
    let project = createProjectFromInput({ title: 'Caption render', kind: 'idea', content: 'Demo' })
    project = addCaption(project, { text: 'Ready', startMs: 0, durationMs: 2000 })
    expect(renderReadiness(project)).toEqual({ ready: true })
    const plan = createRenderPlan(project, preview1080pPreset, 'KINAOU/Renders/captions.mp4')
    expect(plan.clips[0].asset.kind).toBe('caption')
    expect(plan.durationMs).toBe(2000)
  })
})
