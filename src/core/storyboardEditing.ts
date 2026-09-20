import { parseProject, type KinaouProject } from './project'
import type { PersistentVersionHistory } from './versioning'

export interface SceneVisualReason {
  reason: string
  code: 'empty' | 'already' | 'missing' | 'offline' | 'unmanaged' | 'kind' | 'duration' | 'cleared'
  values?: { track: string }
}

/** Calculate and validate before snapshot/persist; even legacy scene adoption is reversible. */
export function commitStoryboardChange<T extends { project: KinaouProject }>(project: KinaouProject, calculate: () => T, history: Pick<PersistentVersionHistory, 'snapshot'>, persist: (project: KinaouProject) => void, label: string): T {
  const result = calculate()
  if (result.project === project) return result
  const next = parseProject(result.project)
  history.snapshot(project, label, 'system')
  persist(next)
  return { ...result, project: next }
}
