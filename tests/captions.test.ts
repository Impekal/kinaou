import { describe, expect, it } from 'vitest'
import { addCaption, addTranscriptCaptions, updateCaptionText } from '../src/core/captions'
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

describe('transcript captions', () => {
  it('adds only explicitly selected timed segments with attribution', () => {
    const project = createProjectFromInput({ title: 'Interview', kind: 'audio', content: '' })
    project.assets.push({ id: 'transcript', kind: 'document', uri: 'KINAOU/Projects/Transcripts/j.json', managed: true, offline: false, metadata: { transcript: { schemaVersion: 1, adapterId: 'whisper.cpp', language: 'de', text: 'Eins Zwei', segments: [{ startMs: 0, endMs: 900, text: 'Eins' }, { startMs: 1000, endMs: 2200, text: 'Zwei' }] } } })
    const next = addTranscriptCaptions(project, 'transcript', [1])
    const caption = next.assets.at(-1)!
    expect(next.tracks.find((track) => track.type === 'caption')!.clips[0]).toMatchObject({ startMs: 1000, durationMs: 1200 })
    expect(caption.metadata).toMatchObject({ text: 'Zwei', transcriptAssetId: 'transcript', transcriptSegmentIndex: 1, adapterId: 'whisper.cpp' })
  })

  it('rejects empty selections and locked caption tracks', () => {
    const project = createProjectFromInput({ title: 'Interview', kind: 'audio', content: '' })
    project.assets.push({ id: 'transcript', kind: 'document', uri: 'KINAOU/Projects/Transcripts/j.json', managed: true, offline: false, metadata: { transcript: { schemaVersion: 1, adapterId: 'whisper.cpp', language: 'de', text: 'Eins', segments: [{ startMs: 0, endMs: 900, text: 'Eins' }] } } })
    expect(() => addTranscriptCaptions(project, 'transcript', [])).toThrow(/select/i)
    const locked = { ...project, tracks: project.tracks.map((track) => track.type === 'caption' ? { ...track, locked: true } : track) }
    expect(() => addTranscriptCaptions(locked, 'transcript', [0])).toThrow(/locked/i)
  })
})
