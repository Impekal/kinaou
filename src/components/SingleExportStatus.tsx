import type { ExportFeedback } from '../core/singleExportSession'
import { useUiLanguage } from './UiLanguageProvider'

export function SingleExportStatus({ feedback, onRetry, onCancel, onDetach }: { feedback: ExportFeedback; onRetry: () => void; onCancel: () => void; onDetach: () => void }) {
  const { t } = useUiLanguage()
  const percent = Math.round((feedback.job?.progress ?? 0) * 100)
  const terminal = ['succeeded', 'failed', 'cancelled', 'detached'].includes(feedback.phase)
  return <div className="renderJob" role="status">
    <div className="renderJobHead"><strong>{t(`export.phase.${feedback.phase}`)}</strong><span>{percent}%</span></div>
    <div className="progressTrack" aria-label={t('export.progress', { percent })}><div className="progressFill" style={{ width: `${percent}%` }} /></div>
    <code>{feedback.path}</code>
    {feedback.detail && <details><summary>{t('common.details')}</summary>{feedback.detail}</details>}
    <div className="renderActions">
      {['pollFailed', 'saveFailed', 'cancelFailed'].includes(feedback.phase) && <button onClick={onRetry}>{t('export.retry')}</button>}
      {['queued', 'running', 'pollFailed', 'cancelFailed'].includes(feedback.phase) && <button className="dangerButton" onClick={onCancel}>{t('export.cancel')}</button>}
      {!terminal && <button onClick={onDetach}>{t('export.detach')}</button>}
    </div>
  </div>
}
