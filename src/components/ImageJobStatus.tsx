import type { ImageFeedback } from '../core/imageStudioSession'
import type { ImageJobParameters } from '../core/imageJobs'
import { useUiLanguage } from './UiLanguageProvider'
export function ImageJobStatus({ feedback, submitted, onRetry, onCancel, onDetach }: { feedback: ImageFeedback; submitted: ImageJobParameters | null; onRetry: () => void; onCancel: () => void; onDetach: () => void }) {
  const { t } = useUiLanguage(), { phase, job } = feedback
  const unresolved = !['succeeded', 'failed', 'cancelled', 'detached'].includes(phase)
  return <div className="sttJob" role="status"><strong>{t(`image.${phase}`)}</strong>
    {job && <><span>{Math.round(job.progress * 100)}%</span><div className="progressTrack"><div className="progressFill" style={{ width: `${job.progress * 100}%` }} /></div>{job.imagePath && <small>{job.imagePath}</small>}</>}
    <div className="directorActions">
      {unresolved && job && ['queued', 'running'].includes(job.state) && phase !== 'cancelling' && <button className="dangerButton" onClick={onCancel}>{t('audio.cancel')}</button>}
      {['pollFailed', 'saveFailed', 'cancelFailed'].includes(phase) && <button className="secondaryButton" onClick={onRetry}>{t(phase === 'saveFailed' ? 'audio.retrySave' : 'audio.retry')}</button>}
      {unresolved && <button className="secondaryButton" onClick={onDetach}>{t('audio.detach')}</button>}
    </div>
    {submitted && <details><summary>{t('image.submitted')}</summary><p>{submitted.positivePrompt}</p><p>{submitted.negativePrompt}</p><small>{submitted.templatePath} · {t('image.seedLabel')} {submitted.seed}{submitted.width !== undefined && ` · ${t('image.width')} ${submitted.width}`}{submitted.height !== undefined && ` · ${t('image.height')} ${submitted.height}`}</small></details>}
    {feedback.detail && <details><summary>{t('common.details')}</summary>{feedback.detail}</details>}
  </div>
}
