import { useEffect, useMemo, useState } from 'react'
import type { KinaouProject } from '../core/project'
import { createRenderPlan, formatProfiles, projectTargetFormat, setProjectTargetFormat, type TargetFormat } from '../core/render'
import type { RenderJobRecord } from '../core/renderJobs'
import { renderOutputPath, renderReadiness } from '../core/renderUi'
import { WorkerClient } from '../core/workerClient'
import { createRangeRenderPlan, validateRenderRange } from '../core/renderRange'

interface RenderPanelProps {
  project: KinaouProject
  workerUrl: string
  workerToken: string
  workerConnected: boolean
  onProjectChange: (project: KinaouProject) => void
}

const terminalStates = new Set(['succeeded', 'failed', 'cancelled'])

export function RenderPanel({ project, workerUrl, workerToken, workerConnected, onProjectChange }: RenderPanelProps) {
  const readiness = useMemo(() => renderReadiness(project), [project])
  const format = projectTargetFormat(project)
  const profile = formatProfiles[format]
  const [job, setJob] = useState<RenderJobRecord | null>(null)
  const [outputPath, setOutputPath] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const timelineDurationMs = useMemo(() => project.tracks.flatMap((track) => track.muted ? [] : track.clips).reduce((end, clip) => Math.max(end, clip.startMs + clip.durationMs), 0), [project])
  const [inSeconds, setInSeconds] = useState('0')
  const [outSeconds, setOutSeconds] = useState(() => String(timelineDurationMs / 1000))
  const range = { inMs: Math.round(Number(inSeconds) * 1000), outMs: Math.round(Number(outSeconds) * 1000) }
  const rangeCheck = Number.isFinite(range.inMs) && Number.isFinite(range.outMs) ? validateRenderRange(range, timelineDurationMs) : { valid: false, reason: 'In and Out must be numbers.' }

  useEffect(() => {
    setInSeconds('0')
    setOutSeconds(String(timelineDurationMs / 1000))
  }, [timelineDurationMs])

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
    if (!readiness.ready || !rangeCheck.valid || !workerConnected || !workerToken.trim() || submitting) return
    setSubmitting(true)
    setError('')
    try {
      const wholeTimeline = range.inMs === 0 && range.outMs === timelineDurationMs
      const path = renderOutputPath(project, new Date(), wholeTimeline ? format : `${format}-range-${range.inMs}-${range.outMs}`)
      const fullPlan = createRenderPlan(project, profile.export, path)
      const plan = wholeTimeline ? fullPlan : createRangeRenderPlan(fullPlan, range, path)
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
          <p>{profile.export.name} is rendered by the authenticated local worker into <code>KINAOU/Renders</code>. The format belongs to the project, so the composed preview above shows exactly what you export.</p>
        </div>
        <span className={workerConnected ? 'status online' : 'status'}>{workerConnected ? 'WORKER READY' : 'WORKER OFFLINE'}</span>
      </div>

      <div className="formatChooser" role="group" aria-label="Output format">
        {(Object.keys(formatProfiles) as TargetFormat[]).map((id) => (
          <button key={id} className={id === format ? 'formatOption active' : 'formatOption'} disabled={Boolean(busy)} onClick={() => onProjectChange(setProjectTargetFormat(project, id))}>
            <strong>{formatProfiles[id].label}</strong>
            <small>{formatProfiles[id].aspect} · {formatProfiles[id].export.width}×{formatProfiles[id].export.height}</small>
          </button>
        ))}
      </div>
      <p className="cardBody">{profile.note}</p>

      <div className="fieldGrid">
        <label>In (seconds)<input type="number" min="0" step="0.001" value={inSeconds} disabled={Boolean(busy)} onChange={(event) => setInSeconds(event.target.value)} /></label>
        <label>Out (seconds)<input type="number" min="0" step="0.001" value={outSeconds} disabled={Boolean(busy)} onChange={(event) => setOutSeconds(event.target.value)} /></label>
      </div>
      <div className="renderActions">
        <button disabled={Boolean(busy) || (range.inMs === 0 && range.outMs === timelineDurationMs)} onClick={() => { setInSeconds('0'); setOutSeconds(String(timelineDurationMs / 1000)) }}>Whole timeline</button>
        {rangeCheck.valid && <span className="cardBody">Export range: {(range.inMs / 1000).toFixed(3)}–{(range.outMs / 1000).toFixed(3)} s ({((range.outMs - range.inMs) / 1000).toFixed(3)} s)</span>}
      </div>
      {!rangeCheck.valid && <div className="warning">{rangeCheck.reason}</div>}

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
        <button className="primary" disabled={!readiness.ready || !rangeCheck.valid || !workerConnected || !workerToken.trim() || Boolean(busy) || submitting} onClick={startRender}>
          {submitting ? 'Submitting…' : job && terminalStates.has(job.state) ? 'Render again' : 'Start render'}
        </button>
        {busy && <button className="dangerButton" onClick={cancelRender}>Cancel render</button>}
      </div>
    </section>
  )
}
