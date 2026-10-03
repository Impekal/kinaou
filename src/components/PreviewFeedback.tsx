import { useEffect, useLayoutEffect, useRef, useState } from 'react'
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

export function PreviewPlayback({
  url,
  durationSeconds,
  playheadSeconds,
  onPlayheadChange,
  seekPoints = []
}: {
  url: string
  durationSeconds?: number
  playheadSeconds?: number
  onPlayheadChange?: (seconds: number) => void
  seekPoints?: ReadonlyArray<{ label: string; seconds: number }>
}) {
  const { language, t } = useUiLanguage()
  const video = useRef<HTMLVideoElement>(null)
  const [time, setTime] = useState(0)
  const [failed, setFailed] = useState(false)
  const [ready, setReady] = useState(false)

  const requestedTime = playheadSeconds ?? time
  const boundedTime = Math.max(
    0,
    durationSeconds === undefined
      ? requestedTime
      : Math.min(requestedTime, durationSeconds)
  )

  useEffect(() => {
    if (playheadSeconds === undefined || !video.current || failed) return
    if (Math.abs(video.current.currentTime - boundedTime) > 0.02) {
      video.current.currentTime = boundedTime
    }
    setTime(boundedTime)
  }, [boundedTime, failed, playheadSeconds])

  function publishTime(next: number) {
    const bounded = Math.max(
      0,
      durationSeconds === undefined
        ? next
        : Math.min(next, durationSeconds)
    )

    setTime(bounded)
    onPlayheadChange?.(bounded)
  }

  function seek(next: number) {
    if (video.current) video.current.currentTime = next
    publishTime(next)
  }

  return <>
    <video
      ref={video}
      aria-label={t('preview.video')}
      className="proxyVideo"
      src={url}
      controls
      preload="metadata"
      onError={() => setFailed(true)}
      onLoadedMetadata={() => setReady(true)}
      onTimeUpdate={(event) => publishTime(event.currentTarget.currentTime)}
    />
    {failed && <div className="errorBox" role="alert">{t('preview.playbackFailed')}</div>}
    {seekPoints.length > 0 && <div className="renderActions">{seekPoints.filter(point => point.label.trim() && Number.isFinite(point.seconds) && point.seconds >= 0 && Number.isFinite(durationSeconds) && point.seconds < durationSeconds!).map((point, index) => <button key={index} className="secondaryButton" disabled={failed || !ready} onClick={() => { video.current?.pause(); seek(point.seconds) }}>{point.label}</button>)}</div>}
    {durationSeconds !== undefined && <label>
      {t('preview.playhead', { time: boundedTime.toLocaleString(language, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) })}
      <input
        type="range"
        min="0"
        max={durationSeconds}
        step="0.01"
        value={boundedTime}
        disabled={failed}
        onChange={(event) => seek(Number(event.target.value))}
      />
    </label>}
  </>
}
