import { applyAiEditorProposal, describeAiEdit, parseAiEditorProposal, type AiEditorProposal } from './aiEditor'
import type { KinaouProject } from './project'
import type { PersistentVersionHistory } from './versioning'

export interface AiEditorReview { proposal: AiEditorProposal; projectKey: string }
export const aiEditorProjectKey = (project: KinaouProject) => JSON.stringify(project)
export function reviewAiEditorProposal(project: KinaouProject, input: unknown): AiEditorReview {
  const proposal = parseAiEditorProposal(input)
  proposal.operations.forEach(operation => describeAiEdit(project, operation))
  return { proposal, projectKey: aiEditorProjectKey(project) }
}
export function commitAiEditorReview(project: KinaouProject, review: AiEditorReview, selected: string[], history: Pick<PersistentVersionHistory, 'snapshot'>, persist: (project: KinaouProject) => void) {
  if (review.projectKey !== aiEditorProjectKey(project)) throw new Error('The project changed after review. Validate the proposal again before applying it.')
  const next = applyAiEditorProposal(project, review.proposal, selected)
  history.snapshot(project, `Before AI Editor: ${review.proposal.title}`, 'system')
  persist(next)
  return new Set(selected).size
}

/** A scope lifetime distinguishes A → B → A and never affects a local model itself. */
export class AiEditorRequestScope {
  private key = ''
  private epoch = 0
  private active = true
  update(key: string) { if (key !== this.key) { this.key = key; this.epoch++ } }
  begin() {
    const epoch = ++this.epoch
    return () => this.active && epoch === this.epoch
  }
  invalidate() { this.epoch++ }
  attach() { this.active = true; this.epoch++ }
  detach() { this.active = false; this.epoch++ }
}
