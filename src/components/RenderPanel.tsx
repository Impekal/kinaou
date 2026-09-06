import { useEffect, useMemo, useState } from 'react'
import type { KinaouProject } from '../core/project'
import { createRenderPlan, preview1080pPreset } from '../core/render'
import type { RenderJobRecord } from '../core/renderJobs'
import { renderOutputPath, renderReadiness } from '../core/renderUi'
import { WorkerClient } from '../core/workerClient'

interface RenderPanelProps {
  project: KinaouProject
  workerUrl: string
  workerToken: string
  workerConnected: boolean
}

const terminalStates = new Set(['succeeded', 'failed', 'cancelled'])

export function RenderPanel({ project, workerUrl, workerToken, workerConnected }: RenderPanelProps) {
  const readiness = useMemo(() => renderReadiness(project), [project])
  const [job, setJob] = useState<RenderJobRecord | null>(null)
  const [outputPath, setOutputPath] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!job || terminalStates.has(job.state) || !workerToken.trim()) return
    let disposed = false
    let timer: ReturnType<typeof setInterval> | undefined
    const client = new WorkerClient({ baseUrl: workerUrl, token: workerToken })

    const poll = async () => {
      try {
        const next = await client.renderStatus(job.id)
        if (disposed) return
        setJob(next)
        if (terminalStates.has(next.state) && timer) clearInterval(timer)
      } catch (pollError) {
        if (!disposed) setError(pollError instanceof Error ? pollError.message : 'Render status failed')
      }
    }

    void poll()
    timer = setInterval(() => void poll(), 1000)
    return () => {
      disposed = true
      if (timer) clearInterval(timer)
    }
  }, [job?.id, workerToken, workerUrl])

  async function startRender() {
    if (!readiness.ready || !workerConnected || !workerToken.trim() || submitting) return
    setSubmitting(true)
    setError('')
    try {
      const path = renderOutputPath(project)
      const plan = createRenderPlan(project, preview1080pPreset, path)
      const next = await new WorkerClient({ baseUrl: workerUrl, token: workerToken }).startRender(plan)
      setOutputPath(path)
      setJob(next)
    } catch (renderError) {
      setError(renderError instanceof Error ? renderError.message : 'Could not start render')
    } finally {
      setSubmitting(false)
    }
  }

  async function cancelRender() {
    if (!job || terminalStates.has(job.state)) return
    setError('')
    try {
      const next = await new WorkerClient({ baseUrl: workerUrl, token: workerToken }).cancelRender(job.id)
      setJob(next)
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : 'Could not cancel render')
    }
  }

  const busy = job && !terminalStates.has(job.state)
  const percent = Math.round((job?.progress ?? 0) * 100)

  return (
    <section className="card renderPanel">
      <div className="sectionLead">
        <div>
          <div className="eyebrow">REAL LOCAL RENDER</div>
          <h3>Render timeline</h3>
          <p>1080p H.264 is rendered by the authenticated local worker into <code>KINAOU/Renders</code>.</p>
        </div>
        <span className={workerConnected ? 'status online' : 'status'}>{workerConnected ? 'WORKER READY' : 'WORKER OFFLINE'}</span>
      </div>

      {!readiness.ready && <div className="warning">{readiness.reason}</div>}
      {!workerConnected && readiness.ready && <div className="warning">Connect the local worker in Settings before rendering.</div>}
      {error && <div className="errorBox">{error}</div>}

      {job && (
        <div className="renderJob">
          <div className="renderJobHead"><strong>{job.state.toUpperCase()}</strong><span>{percent}%</span></div>
          <div className="progressTrack" aria-label={`Render progress ${percent}%`}><div className="progressFill" style={{ width: `${percent}%` }} /></div>
          <div className="renderMeta">
            <code>{job.outputPath ?? outputPath}</code>
            {job.sizeBytes !== undefined && <span>{(job.sizeBytes / 1024 / 1024).toFixed(1)} MB</span>}
            {job.durationMs !== undefined && <span>{(job.durationMs / 1000).toFixed(1)} s</span>}
          </div>
          {job.error && <div className="errorBox">{job.error}</div>}
        </div>
      )}

      <div className="renderActions">
        <button className="primary" disabled={!readiness.ready || !workerConnected || !workerToken.trim() || Boolean(busy) || submitting} onClick={startRender}>
          {submitting ? 'Submitting…' : job && terminalStates.has(job.state) ? 'Render again' : 'Start render'}
        </button>
        {busy && <button className="dangerButton" onClick={cancelRender}>Cancel render</button>}
      </div>
    </section>
  )
}
