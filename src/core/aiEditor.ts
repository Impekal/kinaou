import { z } from 'zod'
import { updateCaptionText } from './captions'
import { parseProject, type KinaouProject } from './project'
import { applyTimelineOperation, type TimelineOperation } from './timeline'

const target = { trackId: z.string().min(1), clipId: z.string().min(1) }
const editSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('move-clip'), ...target, startMs: z.number().int().nonnegative() }),
  z.object({ type: z.literal('trim-clip'), ...target, startMs: z.number().int().nonnegative(), durationMs: z.number().int().positive(), sourceOffsetMs: z.number().int().nonnegative() }),
  z.object({ type: z.literal('set-clip-gain'), ...target, gain: z.number().min(0).max(4) }),
  z.object({ type: z.literal('set-clip-speed'), ...target, speed: z.number().min(.25).max(4) }),
  z.object({ type: z.literal('set-clip-fades'), ...target, inMs: z.number().int().min(0).max(5000), outMs: z.number().int().min(0).max(5000) }),
  z.object({ type: z.literal('update-caption-text'), ...target, text: z.string().trim().min(1).max(8000) })
])

export const aiEditorProposalSchema = z.object({
  schemaVersion: z.literal(1), title: z.string().trim().min(1).max(200), objective: z.string().trim().min(1).max(4000),
  operations: z.array(z.object({ id: z.string().min(1).max(120), reason: z.string().trim().min(1).max(1000), edit: editSchema })).min(1).max(500),
  provenance: z.object({ kind: z.enum(['manual', 'local-model']), adapterId: z.string().min(1).optional(), modelId: z.string().min(1).optional() })
}).superRefine((proposal, context) => {
  const ids = new Set<string>()
  proposal.operations.forEach((operation, index) => { if (ids.has(operation.id)) context.addIssue({ code: 'custom', path: ['operations', index, 'id'], message: 'Operation IDs must be unique.' }); ids.add(operation.id) })
  if (proposal.provenance.kind === 'local-model' && (!proposal.provenance.adapterId || !proposal.provenance.modelId)) context.addIssue({ code: 'custom', path: ['provenance'], message: 'Local model proposals require adapterId and modelId.' })
})

export type AiEditorProposal = z.infer<typeof aiEditorProposalSchema>
export function parseAiEditorProposal(value: unknown): AiEditorProposal { return aiEditorProposalSchema.parse(value) }

function findClip(project: KinaouProject, trackId: string, clipId: string) {
  const track = project.tracks.find((item) => item.id === trackId)
  const clip = track?.clips.find((item) => item.id === clipId)
  if (!track || !clip) throw new Error(`Proposal target not found: ${trackId}/${clipId}`)
  return { track, clip, asset: project.assets.find((asset) => asset.id === clip.assetId) }
}

export function describeAiEdit(project: KinaouProject, operation: AiEditorProposal['operations'][number]): { before: string; after: string } {
  const { clip, asset } = findClip(project, operation.edit.trackId, operation.edit.clipId)
  const edit = operation.edit
  if (edit.type === 'move-clip') return { before: `Start ${clip.startMs}ms`, after: `Start ${edit.startMs}ms` }
  if (edit.type === 'trim-clip') return { before: `${clip.startMs}ms / ${clip.durationMs}ms / offset ${clip.sourceOffsetMs}ms`, after: `${edit.startMs}ms / ${edit.durationMs}ms / offset ${edit.sourceOffsetMs}ms` }
  if (edit.type === 'set-clip-gain') return { before: `Gain ${clip.gain}`, after: `Gain ${edit.gain}` }
  if (edit.type === 'set-clip-speed') return { before: `Speed ${clip.speed}×`, after: `Speed ${edit.speed}×` }
  if (edit.type === 'set-clip-fades') return { before: `Fades ${clip.fades?.inMs ?? 0}/${clip.fades?.outMs ?? 0}ms`, after: `Fades ${edit.inMs}/${edit.outMs}ms` }
  if (asset?.kind !== 'caption') throw new Error('Caption text edit targets a non-caption asset')
  return { before: String(asset.metadata.text ?? ''), after: edit.text }
}

export function applyAiEditorProposal(project: KinaouProject, input: unknown, selectedIds: string[], now = new Date()): KinaouProject {
  const proposal = parseAiEditorProposal(input)
  const selected = new Set(selectedIds)
  if (!selected.size || [...selected].some((id) => !proposal.operations.some((operation) => operation.id === id))) throw new Error('Select valid AI edit operations')
  let next = project
  for (const operation of proposal.operations.filter((item) => selected.has(item.id))) {
    describeAiEdit(next, operation)
    const edit = operation.edit
    if (edit.type === 'update-caption-text') {
      next = updateCaptionText(next, findClip(next, edit.trackId, edit.clipId).clip.assetId, edit.text)
    } else {
      const timelineOperation: TimelineOperation = edit.type === 'set-clip-fades' ? { type: edit.type, trackId: edit.trackId, clipId: edit.clipId, fades: { inMs: edit.inMs, outMs: edit.outMs } } : edit
      next = applyTimelineOperation(next, timelineOperation)
    }
  }
  return parseProject({ ...next, updatedAt: now.toISOString(), metadata: { ...next.metadata, lastAiEditorApply: { proposal, selectedOperationIds: [...selected], appliedAt: now.toISOString() } } })
}
