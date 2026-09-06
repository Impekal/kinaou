import { useEffect, useMemo, useRef, useState } from 'react'
import { createTimelinePreviewPlan } from '../core/render'
import type { RenderJobRecord } from '../core/renderJobs'
import { renderReadiness } from '../core/renderUi'
import type { KinaouProject } from '../core/project'
import { WorkerClient } from '../core/workerClient'

const terminal = new Set(['succeeded', 'failed', 'cancelled'])

export function TimelinePreview({ project, workerUrl, workerToken, workerConnected }: { project: KinaouProject; workerUrl: string; workerToken: string; workerConnected: boolean }) {
  const readiness = useMemo(() => renderReadiness(project), [project])
  const plan = useMemo(() => readiness.ready ? createTimelinePreviewPlan(project) : null, [project, readiness.ready])
  const videoRef = useRef<HTMLVideoElement>(null)
  const [job, setJob] = useState<RenderJobRecord | null>(null)
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const [currentTime, setCurrentTime] = useState(0)

  useEffect(() => {
    if (!job || terminal.has(job.state) || !workerToken.trim()) return
    let disposed = false
    const client = new WorkerClient({ baseUrl: workerUrl, token: workerToken })
    const timer = setInterval(async () => {
      try {
        const next = await client.renderStatus(job.id)
        if (disposed) return
        setJob(next)
        if (next.state === 'succeeded' && plan) {
          clearInterval(timer)
          const blob = await client.loadTimelinePreview(plan.outputRelativePath)
          if (!disposed) setUrl((old) => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(blob) })
        } else if (terminal.has(next.state)) clearInterval(timer)
      } catch (reason) { if (!disposed) setError(reason instanceof Error ? reason.message : 'Preview failed') }
    }, 750)
    return () => { disposed = true; clearInterval(timer) }
  }, [job?.id, plan, workerToken, workerUrl])
  useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url])

  async function renderPreview() {
    if (!plan) return
    setError(''); setUrl(''); setCurrentTime(0)
    try { setJob(await new WorkerClient({ baseUrl: workerUrl, token: workerToken }).startRender(plan)) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not start preview') }
  }

  const busy = job && !terminal.has(job.state)
  const durationSeconds = (plan?.durationMs ?? 0) / 1000
  return <section className="card timelinePreview">
    <div className="sectionLead"><div><div className="eyebrow">COMPOSED PREVIEW</div><h3>Timeline preview</h3><p>Renders the actual timeline at 960×540 into managed cache. Export still uses original media and the full preset.</p></div><button className="secondaryButton" disabled={!readiness.ready || !workerConnected || Boolean(busy)} onClick={renderPreview}>{busy ? `Rendering ${Math.round((job?.progress ?? 0) * 100)}%` : url ? 'Refresh preview' : 'Render preview'}</button></div>
    {!readiness.ready && <div className="warning">{readiness.reason}</div>}
    {job?.error && <div className="errorBox">{job.error}</div>}{error && <div className="errorBox">{error}</div>}
    {url && <><video ref={videoRef} className="proxyVideo" src={url} controls preload="metadata" onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)} /><label>Playhead {currentTime.toFixed(2)}s<input type="range" min="0" max={durationSeconds} step="0.01" value={currentTime} onChange={(event) => { const value = Number(event.target.value); setCurrentTime(value); if (videoRef.current) videoRef.current.currentTime = value }} /></label></>}
  </section>
}
