import { useEffect, useRef, useState } from 'react'
import type { KinaouProject } from '../core/project'
import { CourseOutputPlayback, type CoursePlaybackFeedback } from '../core/courseOutputPlayback'
import { WorkerClient } from '../core/workerClient'
import { useUiLanguage } from './UiLanguageProvider'
import type { CourseOutputWorkerProps } from './CourseOutputFileCheckPanel'

export function CourseOutputPlaybackControl({ project, jobId, dirty, workerUrl = '', workerToken = '', workerConnected = false, workerCapabilities = [] }: CourseOutputWorkerProps & { project: KinaouProject; jobId: string; dirty: boolean }) {
  const { t } = useUiLanguage(), [feedback, setFeedback] = useState<CoursePlaybackFeedback | null>(null)
  const available = workerConnected && !!workerToken.trim() && workerCapabilities.includes('course-output-playback')
  const scope = { project, jobId, dirty, connection: JSON.stringify([workerUrl, workerToken, available]) }
  const environment = useRef(scope), session = useRef<CourseOutputPlayback | null>(null), mounted = useRef(true)
  environment.current = scope; session.current?.observe(scope)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; session.current?.detach() } }, [])
  const current = session.current, busy = !!current?.busy
  const shown = feedback && current?.wasDetached ? { phase: 'detached' as const } : feedback
  async function load() {
    if (!available || !jobId || dirty || busy) return
    current?.detach()
    const client = new WorkerClient({ baseUrl: workerUrl, token: workerToken })
    const task = new CourseOutputPlayback(environment.current, { environment: () => environment.current,
      load: (receipt, signal) => client.loadCourseOutput(receipt, signal), createUrl: blob => URL.createObjectURL(blob), revokeUrl: url => URL.revokeObjectURL(url),
      publish: value => { if (mounted.current && session.current === task) setFeedback(value) }
    })
    session.current = task; await task.load()
  }
  return <section className="stack">
    <h4>{t('course.playback.heading')}</h4><p>{t('course.playback.help')}</p>
    {!available && <p>{t('course.playback.unavailable')}</p>}
    <button disabled={!available || !jobId || dirty || busy} onClick={load}>{t(busy ? 'course.playback.loading' : 'course.playback.load')}</button>
    {shown && <div role={shown.phase === 'failed' ? 'alert' : 'status'}>{t(`course.playback.${shown.phase}`)}{'detail' in shown && shown.detail && <details><summary>{t('common.details')}</summary>{shown.detail}</details>}</div>}
    {shown && 'url' in shown && shown.url && <video key={shown.url} aria-label={t('course.playback.player')} src={shown.url} controls playsInline preload="metadata" style={{ width: '100%', maxHeight: 480 }} onError={() => { if (session.current === current) current?.playbackFailed() }} />}
    {shown && <button onClick={() => { session.current?.detach(); session.current = null; setFeedback(null) }}>{t('course.playback.close')}</button>}
  </section>
}
