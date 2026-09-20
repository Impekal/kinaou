import { useEffect, useRef, useState } from 'react'
import type { KinaouProject } from '../core/project'
import { forgetProjectShortBatchArchiveEntry, projectShortBatchArchive, shortBatchArchiveLimit } from '../core/shortExportBatch'
import { ExportCheckScope, ExportFileCheckSession, type ExportCheckFeedback } from '../core/exportFileCheck'
import { WorkerClient } from '../core/workerClient'
import { useUiLanguage } from './UiLanguageProvider'

export function ShortBatchArchivePanel({ project, workerUrl, workerToken, workerConnected, busy, onProjectChange, onReview }: {
  project: KinaouProject; workerUrl: string; workerToken: string; workerConnected: boolean
  busy: boolean; onProjectChange: (project: KinaouProject) => void; onReview: (batchId: string) => void
}) {
  const { language, t } = useUiLanguage()
  const archive = projectShortBatchArchive(project)
  const scope = JSON.stringify([project.id, workerUrl, workerToken, workerConnected, archive.map(entry => [entry.batchId, entry.items.map(item => item.outputPath)])])
  const lifetime = useRef(new ExportCheckScope())
  const session = useRef<ExportFileCheckSession | null>(null)
  const currentIdentity = lifetime.current.update(scope)
  const [feedback, setFeedback] = useState<{ identity: typeof currentIdentity; batchId: string; value: ExportCheckFeedback } | null>(null)
  const [error, setError] = useState<{ project: KinaouProject; detail: string } | null>(null)
  useEffect(() => () => session.current?.detach(), [])
  const value = feedback?.identity === currentIdentity ? feedback : null
  const checking = value?.value.phase === 'checking'
  function checkFiles(batchId: string) {
    const entry = archive.find(item => item.batchId === batchId)
    if (!entry || checking || !workerConnected || !workerToken.trim()) return
    session.current?.detach()
    const client = new WorkerClient({ baseUrl: workerUrl, token: workerToken })
    const next = new ExportFileCheckSession(entry.items.map(item => item.outputPath), {
      client: { exportAvailability: paths => client.exportAvailabilityBatched(paths) },
      current: () => lifetime.current.isCurrent(currentIdentity) && session.current === next,
      publish: result => setFeedback({ identity: currentIdentity, batchId, value: result })
    })
    session.current = next
    void next.run()
  }
  function forget(batchId: string) {
    if (busy || checking) return
    setError(null)
    try { onProjectChange(forgetProjectShortBatchArchiveEntry(project, batchId)) }
    catch (cause) { setError({ project, detail: String(cause) }) }
  }
  if (!archive.length) return null
  return <section className="renderJob" aria-label={t('shortArchive.heading')}>
    <div className="renderJobHead"><strong>{t('shortArchive.heading')}</strong><span>{t('shortArchive.count', { count: archive.length, limit: shortBatchArchiveLimit })}</span></div>
    <p className="cardBody">{t('shortArchive.help')}</p>
    <p className="cardBody">{t('exports.presenceHelp')}</p>
    {error?.project === project && <div className="errorBox" role="alert">{t('shortArchive.forgetFailed')}<details><summary>{t('common.details')}</summary>{error.detail}</details></div>}
    {archive.map(entry => {
      const ownFeedback = value?.batchId === entry.batchId ? value.value : null
      const check = ownFeedback?.phase === 'checked' ? ownFeedback.result : null
      return <details className="renderJob" key={entry.batchId}>
        <summary className="renderJobHead"><strong>{new Date(entry.completedAt).toLocaleString(language)}</strong><span>{t('shortArchive.summary', { count: entry.items.length, succeeded: entry.items.filter(item => item.state === 'succeeded').length, failed: entry.items.filter(item => item.state === 'failed').length, cancelled: entry.items.filter(item => item.state === 'cancelled').length })}</span></summary>
        <p className="cardBody">{t('shortArchive.dates', { created: new Date(entry.createdAt).toLocaleString(language), archived: new Date(entry.archivedAt).toLocaleString(language) })}</p>
        {check && <p className="cardBody" role="status">{t('exports.checked', { available: check.available, missing: check.missing, time: new Date(check.checkedAt).toLocaleString(language) })}</p>}
        {ownFeedback?.phase === 'failed' && <div className="errorBox" role="alert">{t('exports.checkFailed')}<details><summary>{t('common.details')}</summary>{ownFeedback.detail}</details></div>}
        {entry.items.map(item => {
          const available = check?.byPath[item.outputPath]
          return <div className="renderMeta" key={item.id}>
            <span><strong>{item.title}</strong> · {t(`export.${item.format}`)} · {t('shortArchive.attempt', { count: item.attempt })} · {t(`shortArchive.${item.state}`)}</span>
            <code>{item.outputPath}</code>
            {item.sizeBytes !== undefined && <span>{(item.sizeBytes / 1024 / 1024).toLocaleString(language, { maximumFractionDigits: 1 })} MB</span>}
            <span className={available === undefined ? 'status' : available ? 'status online' : 'status missing'}>{t(available === undefined ? 'exports.unchecked' : available ? 'exports.present' : 'exports.missing')}</span>
          </div>
        })}
        <div className="renderActions">
          <button className="secondaryButton" disabled={busy || checking} onClick={() => onReview(entry.batchId)}>{t('shortArchive.review')}</button>
          <button className="secondaryButton" disabled={!workerConnected || !workerToken.trim() || checking} onClick={() => checkFiles(entry.batchId)}>{t(ownFeedback?.phase === 'checking' ? 'shortArchive.checking' : 'shortArchive.check')}</button>
          <button disabled={busy || checking} onClick={() => forget(entry.batchId)}>{t('shortArchive.forget')}</button>
        </div>
      </details>
    })}
  </section>
}
