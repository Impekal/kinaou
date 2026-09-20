import { useLayoutEffect, useRef, useState } from 'react'
import { PreviewScope, previewBusy, type PreviewFeedback } from '../core/previewSession'
import { useUiLanguage } from './UiLanguageProvider'

export function usePreviewSession() {
  const [scope] = useState(() => new PreviewScope())
  const running = useRef(false)
  const objectUrl = useRef('')
  const [url, setUrl] = useState('')
  const [feedback, setFeedback] = useState<PreviewFeedback>({ phase: 'idle' })
  useLayoutEffect(() => () => {
    scope.invalidate()
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current)
    objectUrl.current = ''
  }, [scope])
  async function perform(work: (current: () => boolean, publish: (state: PreviewFeedback) => void, accept: (blob: Blob) => void) => Promise<void>) {
    if (running.current) return
    running.current = true
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current)
    objectUrl.current = ''; setUrl('')
    const current = scope.capture()
    try {
      await work(current, setFeedback, (blob) => {
        objectUrl.current = URL.createObjectURL(blob)
        setUrl(objectUrl.current)
      })
    } catch (cause) {
      if (current()) setFeedback({ phase: 'startFailed', detail: cause instanceof Error ? cause.message : String(cause) })
    } finally { if (current()) running.current = false }
  }
  return { url, feedback, perform, busy: previewBusy(feedback.phase) }
}

export function PreviewStatus({ feedback }: { feedback: PreviewFeedback }) {
  const { language, t } = useUiLanguage()
  if (feedback.phase === 'idle') return null
  const failed = ['failed', 'startFailed', 'pollFailed', 'loadFailed'].includes(feedback.phase)
  return <div className={failed ? 'errorBox' : 'note'} role={failed ? 'alert' : 'status'}>
    {t(`preview.${feedback.phase}`, { progress: Math.round((feedback.job?.progress ?? 0) * 100).toLocaleString(language) })}
    {feedback.detail && <details><summary>{t('common.details')}</summary>{feedback.detail}</details>}
  </div>
}

export function PreviewPlayback({ url, durationSeconds }: { url: string; durationSeconds?: number }) {
  const { language, t } = useUiLanguage()
  const video = useRef<HTMLVideoElement>(null)
  const [time, setTime] = useState(0)
  const [failed, setFailed] = useState(false)
  return <>
    <video ref={video} aria-label={t('preview.video')} className="proxyVideo" src={url} controls preload="metadata" onError={() => setFailed(true)} onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)} />
    {failed && <div className="errorBox" role="alert">{t('preview.playbackFailed')}</div>}
    {durationSeconds !== undefined && <label>{t('preview.playhead', { time: time.toLocaleString(language, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) })}<input type="range" min="0" max={durationSeconds} step="0.01" value={Math.min(time, durationSeconds)} disabled={failed} onChange={(event) => {
      const next = Number(event.target.value)
      if (video.current) { video.current.currentTime = next; setTime(next) }
    }} /></label>}
  </>
}
