import { useState } from 'react'
import type { KinaouProject } from '../core/project'
import { WorkerClient } from '../core/workerClient'

interface BackupEntry { id: string; path: string; sizeBytes: number; modifiedAt: string; title: string | null; updatedAt: string | null }

interface Props {
  project: KinaouProject | null
  workerUrl: string
  workerToken: string
  workerConnected: boolean
  onRestore: (payload: unknown) => void
}

export function ProjectBackupPanel({ project, workerUrl, workerToken, workerConnected, onRestore }: Props) {
  const [busy, setBusy] = useState(false)
  const [backups, setBackups] = useState<BackupEntry[] | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const client = () => new WorkerClient({ baseUrl: workerUrl, token: workerToken })

  async function refresh() {
    setBackups(await client().listProjectBackups())
  }

  async function backUpCurrent() {
    if (!project || !workerConnected || busy) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const result = await client().saveProjectBackup(project)
      setMessage(`Saved "${project.title}" to ${result.path} (${(result.sizeBytes / 1024).toFixed(1)} KB)`)
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Project backup failed')
    } finally {
      setBusy(false)
    }
  }

  async function list() {
    if (!workerConnected || busy) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Listing backups failed')
    } finally {
      setBusy(false)
    }
  }

  async function restore(entry: BackupEntry) {
    if (!workerConnected || busy) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const payload = await client().loadProjectBackup(entry.id)
      onRestore(payload)
      setMessage(`Restored "${entry.title ?? entry.id}" from the drive into the app.`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Restore failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card availabilityPanel">
      <div>
        <div className="eyebrow">DRIVE BACKUPS</div>
        <h3>Projects survive the browser</h3>
        <p>Projects live in this browser's storage; clearing site data would lose them. Back them up as plain JSON under <code>KINAOU/Projects</code> on the drive, and restore them into any browser. Restoring replaces the browser copy of the same project — a safety version of the current state is created first.</p>
      </div>
      <div className="directorActions">
        <button className="primary" disabled={!workerConnected || !project || busy} onClick={backUpCurrent}>Back up current project to drive</button>
        <button className="secondaryButton" disabled={!workerConnected || busy} onClick={list}>List drive backups</button>
        {!workerConnected && <small>Connect the local worker in Settings first.</small>}
      </div>
      {message && <div className="successBox">{message}</div>}
      {error && <div className="errorBox">{error}</div>}
      {backups !== null && (backups.length === 0
        ? <p className="cardBody">No project backups on the drive yet.</p>
        : <div className="assetList">{backups.map((entry) => (
            <div className="assetRow" key={entry.id}>
              <div><strong>{entry.title ?? entry.id}</strong><small>{entry.updatedAt ? `project updated ${new Date(entry.updatedAt).toLocaleString()}` : 'unknown project timestamp'} · file {new Date(entry.modifiedAt).toLocaleString()} · {(entry.sizeBytes / 1024).toFixed(1)} KB</small></div>
              <code>{entry.path}</code>
              <button className="secondaryButton" disabled={busy} onClick={() => restore(entry)}>Restore into app</button>
            </div>
          ))}</div>)}
    </div>
  )
}
