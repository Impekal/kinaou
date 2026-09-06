import { useEffect, useState } from 'react'
import type { KinaouProject } from '../core/project'
import { PersistentVersionHistory, type ProjectVersion } from '../core/versioning'

export function VersionHistoryPanel({ project, history, onProjectChange }: { project: KinaouProject; history: PersistentVersionHistory; onProjectChange: (project: KinaouProject) => void }) {
  const [versions, setVersions] = useState<ProjectVersion[]>([])
  const [label, setLabel] = useState('')
  const [message, setMessage] = useState('')
  const refresh = () => setVersions(history.list(project.id).reverse())
  useEffect(refresh, [history, project.id])

  function createSnapshot() {
    history.snapshot(project, label || `Manual snapshot ${new Date().toLocaleString()}`, 'user')
    setLabel(''); setMessage('Snapshot saved.'); refresh()
  }

  function restore(version: ProjectVersion) {
    const result = history.restoreReversibly(project, version.id)
    refresh()
    setMessage(`Restored “${version.label}”. A safety snapshot of the previous state was created.`)
    onProjectChange(result.project)
  }

  function remove(version: ProjectVersion) {
    if (!window.confirm(`Delete snapshot “${version.label}”?`)) return
    history.delete(project.id, version.id); setMessage('Snapshot deleted.'); refresh()
  }

  return <section className="card versionPanel">
    <div className="sectionLead"><div><div className="eyebrow">VERSION HISTORY</div><h3>Persistent project snapshots</h3><p>Create named checkpoints and restore them safely. Every restore first captures the state it replaces.</p></div><span className="badge">{versions.length} SNAPSHOTS</span></div>
    <div className="versionCreate"><input aria-label="Snapshot label" value={label} maxLength={120} onChange={(event) => setLabel(event.target.value)} placeholder="e.g. Before caption rewrite" /><button className="primary" onClick={createSnapshot}>Create snapshot</button></div>
    {message && <div className="note">{message}</div>}
    {versions.length === 0 ? <p>No snapshots yet.</p> : <div className="versionList">{versions.map((version) => {
      const clipCount = version.project.tracks.reduce((sum, track) => sum + track.clips.length, 0)
      return <div className="versionRow" key={version.id}><div><strong>{version.label}</strong><small>{new Date(version.createdAt).toLocaleString()} · {version.source} · {version.project.assets.length} assets · {clipCount} clips</small></div><div className="renderActions"><button className="secondaryButton" onClick={() => restore(version)}>Restore</button><button className="dangerButton" onClick={() => remove(version)}>Delete</button></div></div>
    })}</div>}
  </section>
}
