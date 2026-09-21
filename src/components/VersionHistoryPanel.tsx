import { useEffect, useState } from 'react'
import type { KinaouProject } from '../core/project'
import { PersistentVersionHistory, type ProjectVersion } from '../core/versioning'
import { useUiLanguage } from './UiLanguageProvider'
import { displaySystemHistoryLabel } from '../core/uiSystemLabels'

function readVersions(history: PersistentVersionHistory, projectId: string): { versions: ProjectVersion[]; error: string } {
  try { return { versions: history.list(projectId).reverse(), error: '' } }
  catch (cause) { return { versions: [], error: cause instanceof Error ? cause.message : String(cause) } }
}

export function VersionHistoryPanel({ project, history, onProjectChange }: { project: KinaouProject; history: PersistentVersionHistory; onProjectChange: (project: KinaouProject) => void }) {
  const { t, language } = useUiLanguage()
  const [listing, setListing] = useState(() => readVersions(history, project.id))
  const [label, setLabel] = useState('')
  const [message, setMessage] = useState<{ key: 'history.saved' | 'history.restored' | 'history.deleted'; label?: string; source?: ProjectVersion['source'] } | null>(null)
  const [error, setError] = useState('')
  const refresh = () => setListing(readVersions(history, project.id))
  useEffect(refresh, [history, project.id, project.updatedAt])
  function fail(cause: unknown) { setMessage(null); setError(cause instanceof Error ? cause.message : String(cause)); refresh() }

  function createSnapshot() {
    setError(''); setMessage(null)
    try {
      history.snapshot(project, label.trim() || t('history.defaultName', { date: new Date().toLocaleString(language) }), 'user')
      setLabel(''); setMessage({ key: 'history.saved' }); refresh()
    } catch (cause) { fail(cause) }
  }

  function restore(version: ProjectVersion) {
    setError(''); setMessage(null)
    try {
      const result = history.restoreReversibly(project, version.id)
      onProjectChange(result.project)
      setMessage({ key: 'history.restored', label: version.label, source: version.source }); refresh()
    } catch (cause) { fail(cause) }
  }

  function remove(version: ProjectVersion) {
    if (!window.confirm(t('history.confirmDelete', { label: displaySystemHistoryLabel(version, t) }))) return
    setError(''); setMessage(null)
    try { history.delete(project.id, version.id); setMessage({ key: 'history.deleted' }); refresh() }
    catch (cause) { fail(cause) }
  }

  return <section className="card versionPanel">
    <div className="sectionLead"><div><div className="eyebrow">{t('history.eyebrow')}</div><h3>{t('history.heading')}</h3><p>{t('history.help')}</p></div>{!listing.error && <span className="badge">{t(listing.versions.length === 1 ? 'history.countOne' : 'history.count', { count: listing.versions.length })}</span>}</div>
    <div className="versionCreate"><input aria-label={t('history.label')} value={label} maxLength={120} onChange={(event) => setLabel(event.target.value)} placeholder={t('history.hint')} /><div className="renderActions"><button className="primary" disabled={Boolean(listing.error)} onClick={createSnapshot}>{t('history.create')}</button><button onClick={refresh}>{t('history.refresh')}</button></div></div>
    {message && <div className="note" role="status">{t(message.key, { label: message.label ? displaySystemHistoryLabel({ label: message.label, source: message.source ?? 'user' }, t) : '' })}</div>}
    {(error || listing.error) && <div className="errorBox" role="alert">{t(listing.error ? 'history.loadFailed' : 'history.actionFailed')}<details><summary>{t('common.details')}</summary>{listing.error || error}</details></div>}
    {!listing.error && (listing.versions.length === 0 ? <p>{t('history.empty')}</p> : <div className="versionList">{listing.versions.map((version) => {
      const clipCount = version.project.tracks.reduce((sum, track) => sum + track.clips.length, 0)
      return <div className="versionRow" key={version.id}><div><strong>{displaySystemHistoryLabel(version, t)}</strong><small>{t('history.summary', { date: new Date(version.createdAt).toLocaleString(language), source: t(`history.source.${version.source}`), assets: version.project.assets.length, clips: clipCount })}</small></div><div className="renderActions"><button className="secondaryButton" onClick={() => restore(version)}>{t('history.restore')}</button><button className="dangerButton" onClick={() => remove(version)}>{t('history.delete')}</button></div></div>
    })}</div>)}
  </section>
}
