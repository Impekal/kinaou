import { z } from 'zod'
import { editorialContextSchema, editorialProposalSchema, validateEditorialProposal, type EditorialContext, type EditorialProposal } from '../../worker/publication-editorial.mjs'
import { projectPublicationPlan, publicationPlanMissingReceipts } from './publicationPlan'
import { projectContentProfile } from './contentProfile'
import { parseProject, type KinaouProject } from './project'
export type { EditorialContext, EditorialProposal, EditorialItem } from '../../worker/publication-editorial.mjs'

export function publicationEditorialContext(project: KinaouProject): EditorialContext {
  const plan = projectPublicationPlan(project), profile = projectContentProfile(project)
  if (!plan || publicationPlanMissingReceipts(project, plan)) throw Error('Save a main/Short plan with unchanged retained exports first')
  const sourceText = [project.script, ...project.storyboard.map(scene => [scene.title, scene.description, scene.narration ?? ''].join('\n'))].filter(text => text.trim()).join('\n\n')
  return editorialContextSchema.parse({ schemaVersion: 1, projectId: project.id, planId: plan.id, planRevision: plan.revision,
    outputLanguage: profile.outputLanguage, targetMarket: plan.targetMarket, audience: profile.audience, objective: profile.objective, tone: profile.tone, sourceText,
    exports: plan.events.map(event => ({ jobId: event.receipt.jobId, kind: event.kind, label: event.receipt.label, receipt: JSON.stringify(event.receipt) })) })
}
const provenance = z.object({ kind: z.enum(['authored', 'local-model']), modelId: z.string().min(1).max(200).optional(), adapterId: z.literal('ollama').optional(), edited: z.boolean(),
  languagePass: z.object({ modelId: z.string().min(1).max(200), adapterId: z.literal('ollama'), outputLanguage: z.enum(['de', 'en', 'fr']) }).strict().optional()
}).strict().superRefine((value, ctx) => {
  if (value.kind === 'local-model' ? !value.modelId || !value.adapterId : value.modelId !== undefined || value.adapterId !== undefined) ctx.addIssue({ code: 'custom', message: 'Invalid editorial provenance' })
})
export type EditorialProvenance = z.infer<typeof provenance>
const recordSchema = z.object({ schemaVersion: z.literal(1), revision: z.number().int().min(1).max(10000), savedAt: z.string().datetime(), context: editorialContextSchema, proposal: editorialProposalSchema, provenance }).strict()
export type PublicationEditorial = z.infer<typeof recordSchema>
function validateRecord(value: unknown, projectId: string): PublicationEditorial {
  const record = recordSchema.parse(value)
  if (record.context.projectId !== projectId) throw Error('Editorial project mismatch')
  validateEditorialProposal(record.context, record.proposal)
  if (record.provenance.languagePass && record.provenance.languagePass.outputLanguage !== record.context.outputLanguage) throw Error('Language-pass provenance does not match editorial output language')
  if (new TextEncoder().encode(JSON.stringify(record)).length > 140000) throw Error('Editorial record exceeds 140,000 bytes')
  return record
}
export function projectPublicationEditorial(project: KinaouProject): PublicationEditorial | null {
  return project.metadata.publicationEditorial === undefined ? null : validateRecord(project.metadata.publicationEditorial, project.id)
}
export function publicationEditorialCurrent(project: KinaouProject, record: PublicationEditorial) {
  try { return JSON.stringify(validateRecord(record, project.id).context) === JSON.stringify(publicationEditorialContext(project)) } catch { return false }
}
export interface PublicationEditorialReview { record: PublicationEditorial }
const bindings = new WeakMap<PublicationEditorialReview, { project: string; record: string; next?: string; snapshotDone?: boolean; saving?: boolean; done?: boolean }>()
export function reviewPublicationEditorial(project: KinaouProject, context: EditorialContext, input: unknown, origin: EditorialProvenance): PublicationEditorialReview {
  if (JSON.stringify(context) !== JSON.stringify(publicationEditorialContext(project))) throw Error('Editorial sources changed; prepare a fresh draft')
  const previous = projectPublicationEditorial(project)
  const record = validateRecord({ schemaVersion: 1, revision: (previous?.revision ?? 0) + 1, savedAt: new Date().toISOString(), context,
    proposal: validateEditorialProposal(context, input), provenance: origin }, project.id)
  const review = Object.freeze({ record }); bindings.set(review, { project: JSON.stringify(project), record: JSON.stringify(record) }); return review
}
export function applyPublicationEditorial(project: KinaouProject, review: PublicationEditorialReview, acknowledged: boolean): KinaouProject {
  if (!acknowledged || !publicationEditorialReviewIsCurrent(project, review)) throw Error('A current unchanged editorial review and acknowledgement are required')
  const record = validateRecord(review.record, project.id)
  return parseProject({ ...project, updatedAt: record.savedAt, metadata: { ...project.metadata, publicationEditorial: record } })
}

/** Observed changes permanently retire a review, including an A → B → A return. */
export function publicationEditorialReviewIsCurrent(project: KinaouProject, review: PublicationEditorialReview): boolean {
  const binding = bindings.get(review)
  if (!binding || binding.done) return false
  if (binding.project !== JSON.stringify(project) || binding.record !== JSON.stringify(review.record)) { bindings.delete(review); return false }
  return true
}
export function invalidatePublicationEditorialReview(review: PublicationEditorialReview) { bindings.delete(review) }

/** Synchronous project persistence: one prepared revision and one successful safety snapshot per review. */
export function commitPublicationEditorial(project: KinaouProject, review: PublicationEditorialReview, acknowledged: boolean,
  deps: { snapshot: (project: KinaouProject) => void; persist: (project: KinaouProject) => void }): KinaouProject {
  if (!acknowledged || !publicationEditorialReviewIsCurrent(project, review)) throw Error('A current unchanged editorial review and acknowledgement are required')
  const binding = bindings.get(review)!
  if (binding.saving) throw Error('Editorial save is already in progress')
  binding.saving = true
  try {
    // Keep serialized preparation private so a failed callback cannot mutate the retry payload.
    binding.next ??= JSON.stringify(applyPublicationEditorial(project, review, true))
    if (!binding.snapshotDone) { deps.snapshot(parseProject(JSON.parse(binding.project))); binding.snapshotDone = true }
    if (!publicationEditorialReviewIsCurrent(project, review)) throw Error('Editorial review changed during save')
    const next = parseProject(JSON.parse(binding.next))
    deps.persist(next)
    binding.done = true
    return parseProject(JSON.parse(binding.next))
  } finally { binding.saving = false }
}
export function publicationEditorialDraft(project: KinaouProject): EditorialProposal {
  const context = publicationEditorialContext(project)
  return { schemaVersion: 1, items: context.exports.map(entry => ({ jobId: entry.jobId, title: entry.label, description: '', tags: [], rationale: '', sourceQuote: '' })) }
}
