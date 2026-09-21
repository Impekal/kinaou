import { useEffect, useRef, useState } from 'react'
import { PreviewImageSession, type PreviewImageFeedback } from '../core/mediaPreviewSession'
import { assertMediaPreviewPath } from '../core/previewAssets'
import { WorkerClient } from '../core/workerClient'
import { useUiLanguage } from './UiLanguageProvider'

export interface MediaPreviewImageProps { kind: 'thumbnail' | 'waveform'; path: string; workerUrl: string; workerToken: string; workerConnected: boolean; alt: string; scope?: string }
export function MediaPreviewImageStatus({ feedback, retry }: { feedback: PreviewImageFeedback; retry: () => void }) {
  const { t } = useUiLanguage()
  if (feedback.phase === 'ready') return null
  return <div role="status"><small>{t(`cache.${feedback.phase}`)}</small>{feedback.phase === 'loadFailed' && <button className="secondaryButton" onClick={retry}>{t('cache.retryLoad')}</button>}{feedback.detail && <details><summary>{t('common.details')}</summary>{feedback.detail}</details>}</div>
}
function ImageSession({ kind, path, workerUrl, workerToken, alt }: MediaPreviewImageProps) {
  const [feedback, setFeedback] = useState<PreviewImageFeedback>({ phase: 'loading' }), session = useRef<PreviewImageSession | null>(null)
  useEffect(() => {
    const task = new PreviewImageSession({
      load: () => { assertMediaPreviewPath(kind, path); const client = new WorkerClient({ baseUrl: workerUrl, token: workerToken }); return kind === 'thumbnail' ? client.loadVideoThumbnail(path) : client.loadWaveform(path) },
      mime: kind === 'thumbnail' ? 'image/jpeg' : 'image/png', createUrl: blob => URL.createObjectURL(blob), revokeUrl: url => URL.revokeObjectURL(url), publish: setFeedback
    })
    session.current = task; void task.load()
    return () => task.detach()
  }, [kind, path, workerUrl, workerToken])
  return <>{feedback.phase === 'ready' && feedback.url && <img className={kind === 'waveform' ? 'waveformImage' : undefined} src={feedback.url} alt={alt} onError={() => session.current?.failDisplay()} />}<MediaPreviewImageStatus feedback={feedback} retry={() => { void session.current?.load() }} /></>
}
export function MediaPreviewImage(props: MediaPreviewImageProps) {
  if (!props.path || !props.workerConnected || !props.workerToken.trim()) return null
  const key = JSON.stringify([props.kind, props.path, props.workerUrl, props.workerToken, props.scope ?? ''])
  return <ImageSession key={key} {...props} />
}
