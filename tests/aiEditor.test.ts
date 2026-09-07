import { describe, expect, it } from 'vitest'
import { applyAiEditorProposal, buildAiEditorContext, describeAiEdit, parseAiEditorProposal } from '../src/core/aiEditor'
import { createProjectFromInput } from '../src/core/create'

function fixture() {
  const project = createProjectFromInput({ title: 'Edit', kind: 'idea', content: '' })
  project.assets.push({ id: 'audio', kind: 'audio', uri: 'KINAOU/Assets/a.wav', managed: true, offline: false, metadata: { durationMs: 5000 } })
  project.tracks.find((track) => track.type === 'voice')!.clips.push({ id: 'clip', assetId: 'audio', startMs: 0, durationMs: 4000, sourceOffsetMs: 0, gain: 1, speed: 1 })
  return project
}
const proposal = { schemaVersion: 1, title: 'Tighten voice', objective: 'Improve pacing', operations: [{ id: 'move', reason: 'Delay opening', edit: { type: 'move-clip', trackId: expect.anything(), clipId: 'clip', startMs: 500 } }, { id: 'gain', reason: 'Lower voice', edit: { type: 'set-clip-gain', trackId: expect.anything(), clipId: 'clip', gain: .8 } }], provenance: { kind: 'manual' } }

describe('AI Editor proposals', () => {
  it('previews and applies only explicitly selected operations', () => {
    const project = fixture(); const trackId = project.tracks.find((track) => track.type === 'voice')!.id
    const input = { ...proposal, operations: proposal.operations.map((operation) => ({ ...operation, edit: { ...operation.edit, trackId } })) }
    const parsed = parseAiEditorProposal(input)
    expect(describeAiEdit(project, parsed.operations[0])).toEqual({ before: 'Start 0ms', after: 'Start 500ms' })
    const next = applyAiEditorProposal(project, parsed, ['gain'], new Date('2026-01-01T00:00:00.000Z'))
    expect(next.tracks.find((track) => track.id === trackId)!.clips[0]).toMatchObject({ startMs: 0, gain: .8 })
    expect((next.metadata.lastAiEditorApply as { selectedOperationIds: string[] }).selectedOperationIds).toEqual(['gain'])
  })
  it('rejects unknown targets, duplicate ids and empty selections without mutation', () => {
    const project = fixture(); const trackId = project.tracks.find((track) => track.type === 'voice')!.id
    const valid = { ...proposal, operations: [{ ...proposal.operations[0], edit: { ...proposal.operations[0].edit, trackId } }] }
    expect(() => applyAiEditorProposal(project, valid, [])).toThrow(/select/i)
    expect(() => describeAiEdit(project, { ...valid.operations[0], edit: { ...valid.operations[0].edit, clipId: 'missing' } } as never)).toThrow(/target/i)
    expect(() => parseAiEditorProposal({ ...valid, operations: [valid.operations[0], valid.operations[0]] })).toThrow(/unique/i)
    expect(project.tracks.find((track) => track.id === trackId)!.clips[0].startMs).toBe(0)
  })
  it('builds a bounded context without asset URIs or unrelated metadata', () => {
    const context = buildAiEditorContext(fixture())
    expect(context.tracks.flatMap((track) => track.clips)[0].asset).toMatchObject({ id: 'audio', kind: 'audio' })
    expect(JSON.stringify(context)).not.toContain('KINAOU/Assets')
    expect(JSON.stringify(context)).not.toContain('durationMs":5000')
  })
})
