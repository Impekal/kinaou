import { useMemo, useRef } from 'react'
import { createTimelinePreviewPlan, formatReframingRequiresWorker, projectTargetFormat, type RenderPlan } from '../core/render'
import { renderReadiness } from '../core/renderUi'
import type { KinaouProject } from '../core/project'
import { WorkerClient } from '../core/workerClient'
import { freshPreviewPlan, runTimelinePreview } from '../core/previewSession'
import { useUiLanguage } from './UiLanguageProvider'
import { PreviewPlayback, PreviewStatus, usePreviewSession } from './PreviewFeedback'

interface Props { project: KinaouProject; workerUrl: string; workerToken: string; workerConnected: boolean; workerCapabilities: string[] }

export function TimelinePreview({ project, ...connection }: Props) {
  const { t } = useUiLanguage()
  const readiness = useMemo(() => renderReadiness(project), [project])
  const prepared = useMemo(() => {
    if (!readiness.ready) return { plan: null }
    try { return { plan: createTimelinePreviewPlan(project) } }
    catch (cause) { return { plan: null, error: cause instanceof Error ? cause.message : String(cause) } }
  }, [project, readiness.ready])
  const reframingBlocked = formatReframingRequiresWorker(project, projectTargetFormat(project)) && !connection.workerCapabilities.includes('format-reframing')
  return <section className="card timelinePreview">
    <div><div className="eyebrow">{t('preview.composed')}</div><h3>{t('preview.heading')}</h3><p>{t('preview.help')}</p><p>{t('preview.scopeHelp')}</p></div>
    {!readiness.ready && readiness.code && <div className="warning">{t(`preview.reason.${readiness.code}`, { track: readiness.track ?? '', speed: readiness.speed ?? 1 })}</div>}
    {readiness.ready && !prepared.plan && <div className="errorBox" role="alert">{t('preview.planFailed')}<details><summary>{t('common.details')}</summary>{prepared.error}</details></div>}
    {connection.workerConnected && reframingBlocked && <div className="warning">{t('preview.restart')}</div>}
    <TimelinePlayback key={JSON.stringify([project.id, prepared.plan, connection.workerUrl, connection.workerToken, connection.workerConnected, reframingBlocked])} plan={prepared.plan} blocked={reframingBlocked} {...connection} />
  </section>
}

function TimelinePlayback({ plan, blocked, workerUrl, workerToken, workerConnected }: Omit<Props, 'project'> & { plan: RenderPlan | null; blocked: boolean }) {
  const { t } = useUiLanguage()
  const { url, feedback, perform, busy } = usePreviewSession()
  const submitted = useRef<RenderPlan | null>(null)
  const retry = Boolean(feedback.job && (feedback.phase === 'pollFailed' || feedback.phase === 'loadFailed'))
  function render() {
    if (!plan || blocked || !workerConnected || busy) return
    void perform((current, publish, accept) => {
      if (!retry) submitted.current = freshPreviewPlan(plan)
      return runTimelinePreview(submitted.current!, new WorkerClient({ baseUrl: workerUrl, token: workerToken }), current, publish, accept, retry ? feedback.job : undefined)
    })
  }
  return <div aria-busy={busy}>
    <button className="secondaryButton" disabled={!plan || blocked || !workerConnected || busy} onClick={render}>{t(retry ? 'preview.retry' : url ? 'preview.refresh' : 'preview.render')}</button>
    {!workerConnected && <p>{t('preview.connect')}</p>}
    <PreviewStatus feedback={feedback} />
    {url && <PreviewPlayback key={url} url={url} durationSeconds={(submitted.current?.durationMs ?? 0) / 1000} />}
  </div>
}
