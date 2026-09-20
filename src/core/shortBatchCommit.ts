import type { KinaouProject } from './project'

export type ShortBatchNotice = { kind: 'restored'; date: string } | { kind: 'retrySaved'; count: number } | { kind: 'saved' | 'existingKept' | 'requeued' }

/** Never expose queued jobs or discard recovery state before persistence succeeds. */
export function commitShortBatchChange(project: KinaouProject, persist: (project: KinaouProject) => void, activate: () => void): void {
  persist(project)
  activate()
}
