import { applyDirectorPlan, parseDirectorPlan, type DirectorPlan } from './director'
import type { KinaouProject } from './project'
import type { PersistentVersionHistory } from './versioning'

export interface DirectorReview { plan: DirectorPlan; projectKey: string }
export function reviewDirectorPlan(project: KinaouProject, input: unknown): DirectorReview {
  return { plan: parseDirectorPlan(input), projectKey: JSON.stringify(project) }
}
export function commitDirectorReview(project: KinaouProject, review: DirectorReview, history: Pick<PersistentVersionHistory, 'snapshot'>, persist: (project: KinaouProject) => void) {
  if (JSON.stringify(project) !== review.projectKey) throw new Error('Project changed after review. Validate the plan again.')
  const next = applyDirectorPlan(project, review.plan)
  history.snapshot(project, `Before Director plan: ${review.plan.title}`, 'system')
  persist(next)
}
