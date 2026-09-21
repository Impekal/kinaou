import type { AudioFeedback } from '../core/audioStudioSession'
import { useUiLanguage } from './UiLanguageProvider'

export function AudioJobStatus({ feedback, submittedText, onRetry, onCancel, onDetach }: { feedback: AudioFeedback; submittedText: string; onRetry: () => void; onCancel: () => void; onDetach: () => void }) {
  const { language, t } = useUiLanguage()
  const { phase, job } = feedback
  const unresolved = !['succeeded', 'failed', 'cancelled', 'detached'].includes(phase)
  const retry = ['pollFailed', 'saveFailed', 'cancelFailed'].includes(phase)
  const cancellable = unresolved && job && ['queued', 'running'].includes(job.state) && phase !== 'cancelling'
  return <div className="sttJob" role="status">
    <strong>{t(`audio.${phase}`)}</strong>
    {job && <><span>{Math.round(job.progress * 100)}%</span><div className="progressTrack"><div className="progressFill" style={{ width: `${job.progress * 100}%` }} /></div>{job.audioPath && job.durationMs !== undefined && <small>{new Intl.NumberFormat(language, { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(job.durationMs / 1000)}s · {job.audioPath}</small>}</>}
    <div className="directorActions">
      {cancellable && <button className="dangerButton" onClick={onCancel}>{t('audio.cancel')}</button>}
      {retry && <button className="secondaryButton" onClick={onRetry}>{t(phase === 'saveFailed' ? 'audio.retrySave' : 'audio.retry')}</button>}
      {unresolved && <button className="secondaryButton" onClick={onDetach}>{t('audio.detach')}</button>}
    </div>
    {submittedText && <details><summary>{t('audio.source')}</summary><p>{submittedText}</p></details>}
    {feedback.detail && <details><summary>{t('common.details')}</summary>{feedback.detail}</details>}
  </div>
}
