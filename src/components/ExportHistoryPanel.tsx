import { useEffect, useRef, useState } from 'react'
import type { KinaouProject } from '../core/project'
import { forgetExportReceipt, projectExportHistory } from '../core/exportHistory'
import { ExportFileCheckSession, type ExportCheckFeedback } from '../core/exportFileCheck'
import { WorkerClient } from '../core/workerClient'
import { useUiLanguage } from './UiLanguageProvider'

export function ExportHistoryPanel({ project, workerUrl, workerToken, workerConnected, busy, onProjectChange }: {
  project: KinaouProject; workerUrl: string; workerToken: string; workerConnected: boolean; busy: boolean; onProjectChange: (project: KinaouProject) => void
}) {
  const { language, t } = useUiLanguage()
  const receipts = projectExportHistory(project)
  const paths = receipts.map(receipt => receipt.outputRelativePath)
  const scope = JSON.stringify([project.id, workerUrl, workerToken, workerConnected, paths])
  const currentScope = useRef({ key: scope })
  if (currentScope.current.key !== scope) currentScope.current = { key: scope }
  const identity = currentScope.current
  const session = useRef<ExportFileCheckSession | null>(null)
  const [feedback, setFeedback] = useState<{ scope: typeof identity; value: ExportCheckFeedback } | null>(null)
  const [error, setError] = useState<{ project: KinaouProject; detail: string } | null>(null)
  useEffect(() => () => session.current?.detach(), [])
  // Detach synchronously when scope changes, including A → B → A while a request is pending.
  const previousScope = useRef(scope)
  if (previousScope.current !== scope) { session.current?.detach(); previousScope.current = scope }
  const value = feedback?.scope === identity ? feedback.value : null
  const checking = value?.phase === 'checking'
  const check = value?.phase === 'checked' ? value.result : null
  function checkFiles() {
    if (!workerConnected || !workerToken.trim() || !paths.length || checking) return
    session.current?.detach()
    const next = new ExportFileCheckSession(paths, {
      client: new WorkerClient({ baseUrl: workerUrl, token: workerToken }),
      current: () => currentScope.current === identity && session.current === next,
      publish: result => setFeedback({ scope: identity, value: result })
    })
    session.current = next
    void next.run()
  }
  function forget(id: string) {
    setError(null)
    try { onProjectChange(forgetExportReceipt(project, id)) }
    catch (cause) { setError({ project, detail: String(cause) }) }
  }
  return <section className="renderJob" aria-label={t('exports.heading')}>
    <div className="renderJobHead"><strong>{t('exports.heading')}</strong><span>{t('exports.count', { count: receipts.length })}</span></div>
    <p className="cardBody">{t('exports.help')}</p><p className="cardBody">{t('exports.presenceHelp')}</p>
    {!receipts.length && <p className="cardBody">{t('exports.empty')}</p>}
    {receipts.length > 0 && <div className="renderActions">
      <button disabled={!workerConnected || !workerToken.trim() || checking} onClick={checkFiles}>{t(checking ? 'exports.checking' : 'exports.check')}</button>
      {check && <span role="status">{t('exports.checked', { available: check.available, missing: check.missing, time: new Date(check.checkedAt).toLocaleString(language) })}</span>}
    </div>}
    {value?.phase === 'failed' && <div className="errorBox" role="alert">{t('exports.checkFailed')}<details><summary>{t('common.details')}</summary>{value.detail}</details></div>}
    {error?.project === project && <div className="errorBox" role="alert">{t('exports.forgetFailed')}<details><summary>{t('common.details')}</summary>{error.detail}</details></div>}
    {receipts.map(receipt => {
      const available = check?.byPath[receipt.outputRelativePath]
      return <div className="renderJob" key={receipt.jobId}>
        <div className="renderJobHead"><strong>{receipt.label}</strong><span>{t(`export.${receipt.format}`)} · {(receipt.durationMs / 1000).toLocaleString(language)} s · {new Date(receipt.completedAt).toLocaleString(language)}</span><span className={available === undefined ? 'status' : available ? 'status online' : 'status missing'}>{t(available === undefined ? 'exports.unchecked' : available ? 'exports.present' : 'exports.missing')}</span></div>
        {receipt.courseLesson && <small>{t('exports.course', { course: receipt.courseLesson.courseTitle, module: receipt.courseLesson.moduleTitle, lesson: receipt.courseLesson.lessonTitle, revision: receipt.courseLesson.outlineRevision, language: receipt.courseLesson.language })}</small>}
        <div className="renderMeta">
          <code>{receipt.outputRelativePath}</code>
          {receipt.sizeBytes !== undefined && <span>{(receipt.sizeBytes / 1024 / 1024).toLocaleString(language, { maximumFractionDigits: 1 })} MB</span>}
          <span>{(receipt.range.inMs / 1000).toLocaleString(language)}–{(receipt.range.outMs / 1000).toLocaleString(language)} s</span>
          {receipt.sceneIds.length > 0 && <span>{t('exports.scenes', { count: receipt.sceneIds.length })}</span>}
          <button disabled={busy || checking} onClick={() => forget(receipt.jobId)}>{t('exports.forget')}</button>
        </div>
      </div>
    })}
  </section>
}
