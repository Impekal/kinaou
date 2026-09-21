import type { VideoFeedback } from '../core/videoStudioSession'
import type { ImageJobParameters } from '../core/imageJobs'
import { useUiLanguage } from './UiLanguageProvider'
export function VideoJobStatus({ feedback, submitted, onRetry, onCancel, onDetach }: { feedback: VideoFeedback; submitted: ImageJobParameters | null; onRetry: () => void; onCancel: () => void; onDetach: () => void }) {
  const { t } = useUiLanguage(), { phase, job } = feedback
  const unresolved = !['succeeded', 'failed', 'cancelled', 'detached'].includes(phase)
  return <div className="sttJob" role="status"><strong>{t(`video.${phase}`)}</strong>
    {job && <><span>{Math.round(job.progress * 100)}%</span><div className="progressTrack"><div className="progressFill" style={{ width: `${job.progress * 100}%` }} /></div>{job.videoPath && <small>{job.videoPath}</small>}</>}
    <div className="directorActions">
      {unresolved && job && ['queued', 'running'].includes(job.state) && phase !== 'cancelling' && <button className="dangerButton" onClick={onCancel}>{t('audio.cancel')}</button>}
      {['pollFailed', 'saveFailed', 'cancelFailed'].includes(phase) && <button className="secondaryButton" onClick={onRetry}>{t(phase === 'saveFailed' ? 'audio.retrySave' : 'audio.retry')}</button>}
      {unresolved && <button className="secondaryButton" onClick={onDetach}>{t('audio.detach')}</button>}
    </div>
    {submitted && <details><summary>{t('video.submitted')}</summary><p>{submitted.positivePrompt}</p><p>{submitted.negativePrompt}</p><small>{submitted.templatePath} · {t('video.seedLabel')} {submitted.seed}{submitted.width !== undefined && ` · ${t('video.width')} ${submitted.width}`}{submitted.height !== undefined && ` · ${t('video.height')} ${submitted.height}`}</small></details>}
    {submitted?.references && <ul>{Object.entries(submitted.references).map(([role, ref]) => <li key={role}>{t(role === 'portrait' ? 'video.portrait' : 'video.speech')} · {ref?.path} · {ref?.assetId}</li>)}</ul>}
    {feedback.detail && <details><summary>{t('common.details')}</summary>{feedback.detail}</details>}
  </div>
}

