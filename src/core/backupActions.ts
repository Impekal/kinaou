import type { KinaouProject } from './project'
import type { WorkerClient } from './workerClient'

export type BackupEntry = Awaited<ReturnType<WorkerClient['listProjectBackups']>>[number]
type Client = Pick<WorkerClient, 'saveProjectBackup' | 'listProjectBackups' | 'loadProjectBackup'>
export type BackupRequest = { kind: 'save'; project: KinaouProject } | { kind: 'list' } | { kind: 'restore'; entry: BackupEntry }
export interface BackupFeedback {
  message?: { key: 'backup.saved' | 'backup.restored'; title: string; path?: string; sizeBytes?: number }
  error?: { key: 'backup.saveFailed' | 'backup.listFailed' | 'backup.refreshFailed' | 'backup.restoreFailed'; detail: string }
  backups?: BackupEntry[] | null
}

/** Invalidates responses after unmount/connection changes, including StrictMode remounts. */
export class BackupScope {
  private generation = 0
  invalidate() { this.generation++ }
  capture() { const generation = this.generation; return () => generation === this.generation }
}

export async function runBackupAction(request: BackupRequest, client: () => Client, current: () => boolean, publish: (feedback: BackupFeedback) => void, restore: (payload: unknown) => void): Promise<void> {
  let saved = false
  try {
    const worker = client()
    if (request.kind === 'restore') {
      const payload = await worker.loadProjectBackup(request.entry.id)
      if (!current()) return
      restore(payload)
      if (current()) publish({ message: { key: 'backup.restored', title: request.entry.title ?? request.entry.id } })
      return
    }
    if (request.kind === 'save') {
      const result = await worker.saveProjectBackup(request.project)
      if (!current()) return
      saved = true
      publish({ message: { key: 'backup.saved', title: request.project.title, ...result } })
    }
    const backups = await worker.listProjectBackups()
    if (current()) publish({ backups })
  } catch (cause) {
    if (current()) publish({ backups: null, error: {
      key: saved ? 'backup.refreshFailed' : request.kind === 'save' ? 'backup.saveFailed' : request.kind === 'list' ? 'backup.listFailed' : 'backup.restoreFailed',
      detail: cause instanceof Error ? cause.message : String(cause)
    } })
  }
}
