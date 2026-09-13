import { useEffect, useMemo, useRef, useState } from 'react'
import type { KinaouProject } from '../core/project'
import { createRenderPlan, formatProfiles, projectTargetFormat, setProjectTargetFormat, type RenderPlan, type TargetFormat } from '../core/render'
import type { RenderJobRecord } from '../core/renderJobs'
import { renderOutputPath, renderReadiness } from '../core/renderUi'
import { WorkerClient } from '../core/workerClient'
import { createRangeRenderPlan, validateRenderRange } from '../core/renderRange'
import { defaultAudioDucking, validateAudioDucking } from '../core/audioDucking'
import { defaultLoudnessNormalization } from '../core/audioLoudness'
import { planShortExportBatch, planShortExportRanges, projectShortExportMaximum, setProjectShortExportMaximum, shortExportMaximumError, shortExportVariant, shortPreviewOutputPath } from '../core/shortExportRanges'
import { cancelPendingShortBatchItems, nextShortBatchItem, shortBatchBusy, shortBatchTerminalStates, type ShortBatchRenderItem } from '../core/shortExportBatch'
import { forgetExportReceipt, projectExportHistory, recordSuccessfulExport, type SuccessfulExportReceiptInput } from '../core/exportHistory'

interface RenderPanelProps {
  project: KinaouProject
  workerUrl: string
  workerToken: string
  workerConnected: boolean
  onProjectChange: (project: KinaouProject) => void
}

const terminalStates = new Set(['succeeded', 'failed', 'cancelled'])
const targetFormats = Object.keys(formatProfiles) as TargetFormat[]
type SubmittedExportReceipt = Omit<SuccessfulExportReceiptInput, 'completedAt' | 'sizeBytes'>
interface ExportFileCheck { byPath: Record<string, boolean>; available: number; missing: number; checkedAt: string }

export function RenderPanel({ project, workerUrl, workerToken, workerConnected, onProjectChange }: RenderPanelProps) {
  const readiness = useMemo(() => renderReadiness(project), [project])
  const format = projectTargetFormat(project)
  const profile = formatProfiles[format]
  const [job, setJob] = useState<RenderJobRecord | null>(null)
  const [outputPath, setOutputPath] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submittedExport, setSubmittedExport] = useState<SubmittedExportReceipt | null>(null)
  const recordedExportJobs = useRef(new Set<string>())
  const exportHistory = projectExportHistory(project)
  const exportPathSignature = exportHistory.map((receipt) => receipt.outputRelativePath).join('\u0000')
  const [exportFileCheck, setExportFileCheck] = useState<ExportFileCheck | null>(null)
  const [checkingExportFiles, setCheckingExportFiles] = useState(false)
  const [exportAvailabilityError, setExportAvailabilityError] = useState('')
  const timelineDurationMs = useMemo(() => project.tracks.flatMap((track) => track.muted ? [] : track.clips).reduce((end, clip) => Math.max(end, clip.startMs + clip.durationMs), 0), [project])
  const [inSeconds, setInSeconds] = useState('0')
  const [outSeconds, setOutSeconds] = useState(() => String(timelineDurationMs / 1000))
  const [duckingEnabled, setDuckingEnabled] = useState(defaultAudioDucking.enabled)
  const [duckingReductionDb, setDuckingReductionDb] = useState(String(defaultAudioDucking.reductionDb))
  const [duckingAttackMs, setDuckingAttackMs] = useState(String(defaultAudioDucking.attackMs))
  const [duckingReleaseMs, setDuckingReleaseMs] = useState(String(defaultAudioDucking.releaseMs))
  const [normalizeLoudness, setNormalizeLoudness] = useState(defaultLoudnessNormalization.enabled)
  const duckingSettings = { enabled: duckingEnabled, reductionDb: Number(duckingReductionDb), attackMs: Number(duckingAttackMs), releaseMs: Number(duckingReleaseMs) }
  const duckingCheck = (() => { try { validateAudioDucking(duckingSettings); return { valid: true, reason: '' } } catch (value) { return { valid: false, reason: value instanceof Error ? value.message : 'Invalid music ducking settings.' } } })()
  const range = { inMs: Math.round(Number(inSeconds) * 1000), outMs: Math.round(Number(outSeconds) * 1000) }
  const rangeCheck = Number.isFinite(range.inMs) && Number.isFinite(range.outMs) ? validateRenderRange(range, timelineDurationMs) : { valid: false, reason: 'In and Out must be numbers.' }
  const shortMaximumMs = projectShortExportMaximum(project)
  const [shortMaximumSeconds, setShortMaximumSeconds] = useState(() => String(shortMaximumMs / 1000))
  const customShortMaximumMs = Math.round(Number(shortMaximumSeconds) * 1000)
  const customShortMaximumError = Number.isFinite(customShortMaximumMs) ? shortExportMaximumError(customShortMaximumMs) : 'Short export maximum must be a number.'
  const shortExports = useMemo(() => planShortExportRanges(project, shortMaximumMs), [project, shortMaximumMs])
  const shortCandidateSignature = shortExports.candidates.map((candidate) => `${candidate.id}:${candidate.inMs}:${candidate.outMs}:${candidate.titles.join('\u0000')}`).join('|')
  const [selectedShortId, setSelectedShortId] = useState('')
  const [batchSelectedIds, setBatchSelectedIds] = useState<string[]>([])
  const [batchFormats, setBatchFormats] = useState<TargetFormat[]>([format])
  const [batchItems, setBatchItems] = useState<ShortBatchRenderItem[]>([])
  const batchPlans = useRef(new Map<string, RenderPlan>())
  const batchSubmitting = useRef(false)
  const batchCancelRequested = useRef(false)
  const selectedShort = shortExports.candidates.find((candidate) => candidate.id === selectedShortId && candidate.inMs === range.inMs && candidate.outMs === range.outMs)
  const shortPreviewVideoRef = useRef<HTMLVideoElement>(null)
  const [shortPreviewJob, setShortPreviewJob] = useState<RenderJobRecord | null>(null)
  const [shortPreviewPath, setShortPreviewPath] = useState('')
  const [shortPreviewUrl, setShortPreviewUrl] = useState('')
  const [shortPreviewError, setShortPreviewError] = useState('')
  const [shortPreviewCurrentTime, setShortPreviewCurrentTime] = useState(0)
  const [shortPreviewDurationMs, setShortPreviewDurationMs] = useState(0)
  const [shortPreviewSubmitting, setShortPreviewSubmitting] = useState(false)
  const [shortPreviewSourceConfiguration, setShortPreviewSourceConfiguration] = useState('')
  const shortPreviewConfiguration = selectedShort ? `${format}:${selectedShort.id}:${selectedShort.inMs}:${selectedShort.outMs}:${duckingEnabled}:${duckingReductionDb}:${duckingAttackMs}:${duckingReleaseMs}:${normalizeLoudness}` : ''
  const shortPreviewCurrent = Boolean(shortPreviewSourceConfiguration && shortPreviewSourceConfiguration === shortPreviewConfiguration)
  const shortPreviewBusy = shortPreviewSubmitting || Boolean(shortPreviewJob && !terminalStates.has(shortPreviewJob.state))
  const singleBusy = Boolean(job && !terminalStates.has(job.state))
  const batchBusy = shortBatchBusy(batchItems)
  const busy = singleBusy || batchBusy || shortPreviewBusy
  const activeBatchItem = batchItems.find((item) => item.jobId && !terminalStates.has(item.state))
  const successfulBatchSignature = batchItems.filter((item) => item.state === 'succeeded' && item.jobId).map((item) => `${item.jobId}:${item.updatedAt}:${item.sizeBytes}`).join('|')

  useEffect(() => {
    setInSeconds('0')
    setOutSeconds(String(timelineDurationMs / 1000))
    setSelectedShortId('')
  }, [timelineDurationMs])

  useEffect(() => {
    setBatchSelectedIds([])
  }, [shortCandidateSignature])

  useEffect(() => {
    setBatchFormats([format])
  }, [format])

  useEffect(() => {
    setShortMaximumSeconds(String(shortMaximumMs / 1000))
  }, [shortMaximumMs])

  useEffect(() => {
    setExportFileCheck(null)
    setExportAvailabilityError('')
  }, [exportPathSignature])

  useEffect(() => {
    if (shortPreviewBusy || !shortPreviewSourceConfiguration || shortPreviewCurrent) return
    setShortPreviewJob(null)
    setShortPreviewPath('')
    setShortPreviewUrl('')
    setShortPreviewError('')
    setShortPreviewCurrentTime(0)
    setShortPreviewDurationMs(0)
    setShortPreviewSourceConfiguration('')
  }, [shortPreviewBusy, shortPreviewCurrent, shortPreviewSourceConfiguration])

  useEffect(() => () => { if (shortPreviewUrl) URL.revokeObjectURL(shortPreviewUrl) }, [shortPreviewUrl])

  useEffect(() => {
    if (!shortPreviewJob || terminalStates.has(shortPreviewJob.state) || !shortPreviewPath || !workerToken.trim()) return
    let disposed = false
    let loading = false
    let timer: ReturnType<typeof setInterval> | undefined
    const client = new WorkerClient({ baseUrl: workerUrl, token: workerToken })
    const poll = async () => {
      if (loading) return
      loading = true
      try {
        const next = await client.renderStatus(shortPreviewJob.id)
        if (disposed) return
        setShortPreviewJob(next)
        if (next.state === 'succeeded') {
          if (timer) clearInterval(timer)
          const blob = await client.loadTimelinePreview(shortPreviewPath)
          if (!disposed) setShortPreviewUrl(URL.createObjectURL(blob))
        } else if (terminalStates.has(next.state) && timer) clearInterval(timer)
      } catch (previewError) {
        if (!disposed) setShortPreviewError(previewError instanceof Error ? previewError.message : 'Short preview failed')
      } finally {
        loading = false
      }
    }
    void poll()
    timer = setInterval(() => void poll(), 750)
    return () => {
      disposed = true
      if (timer) clearInterval(timer)
    }
  }, [shortPreviewJob?.id, shortPreviewPath, workerToken, workerUrl])

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

  useEffect(() => {
    if (!activeBatchItem?.jobId || !workerToken.trim()) return
    let disposed = false
    let timer: ReturnType<typeof setInterval> | undefined
    const client = new WorkerClient({ baseUrl: workerUrl, token: workerToken })
    const poll = async () => {
      try {
        const next = await client.renderStatus(activeBatchItem.jobId!)
        if (disposed) return
        setBatchItems((items) => items.map((item) => item.id === activeBatchItem.id ? {
          ...item,
          state: next.state,
          progress: next.progress,
          createdAt: next.createdAt,
          updatedAt: next.updatedAt,
          ...(next.outputPath ? { renderedPath: next.outputPath } : {}),
          ...(next.sizeBytes !== undefined ? { sizeBytes: next.sizeBytes } : {}),
          ...(next.error ? { error: next.error } : {})
        } : item))
        if (terminalStates.has(next.state) && timer) clearInterval(timer)
      } catch (pollError) {
        if (!disposed) setError(pollError instanceof Error ? pollError.message : 'Short export status failed')
      }
    }
    void poll()
    timer = setInterval(() => void poll(), 1000)
    return () => {
      disposed = true
      if (timer) clearInterval(timer)
    }
  }, [activeBatchItem?.id, activeBatchItem?.jobId, workerToken, workerUrl])

  useEffect(() => {
    if (batchCancelRequested.current || batchSubmitting.current || activeBatchItem || !workerToken.trim()) return
    const nextItem = nextShortBatchItem(batchItems)
    if (!nextItem) return
    const plan = batchPlans.current.get(nextItem.id)
    if (!plan) {
      setBatchItems((items) => items.map((item) => item.id === nextItem.id ? { ...item, state: 'failed', error: 'The prepared render plan is missing.' } : item))
      return
    }
    batchSubmitting.current = true
    const client = new WorkerClient({ baseUrl: workerUrl, token: workerToken })
    client.startRender(plan).then(async (next) => {
      if (batchCancelRequested.current) {
        try {
          const cancelled = await client.cancelRender(next.id)
          setBatchItems((items) => items.map((item) => item.id === nextItem.id ? { ...item, jobId: next.id, state: cancelled.state, progress: cancelled.progress, createdAt: cancelled.createdAt, updatedAt: cancelled.updatedAt } : item))
        } catch (cancelError) {
          const message = cancelError instanceof Error ? cancelError.message : 'Could not cancel submitted Short export'
          setBatchItems((items) => items.map((item) => item.id === nextItem.id ? { ...item, jobId: next.id, state: next.state, progress: next.progress, createdAt: next.createdAt, updatedAt: next.updatedAt, error: message } : item))
          setError(message)
        }
        return
      }
      setBatchItems((items) => items.map((item) => item.id === nextItem.id ? { ...item, jobId: next.id, state: next.state, progress: next.progress, createdAt: next.createdAt, updatedAt: next.updatedAt } : item))
    }).catch((batchError) => {
      setBatchItems((items) => items.map((item) => item.id === nextItem.id ? { ...item, state: 'failed', error: batchError instanceof Error ? batchError.message : 'Could not start Short export' } : item))
    }).finally(() => { batchSubmitting.current = false })
  }, [activeBatchItem, batchItems, workerToken, workerUrl])

  useEffect(() => {
    if (job?.state !== 'succeeded' || !submittedExport || submittedExport.jobId !== job.id || recordedExportJobs.current.has(job.id)) return
    try {
      const next = recordSuccessfulExport(project, {
        ...submittedExport,
        durationMs: job.durationMs ?? submittedExport.durationMs,
        ...(job.sizeBytes !== undefined ? { sizeBytes: job.sizeBytes } : {}),
        completedAt: job.updatedAt
      })
      recordedExportJobs.current.add(job.id)
      if (next !== project) onProjectChange(next)
    } catch (historyError) {
      setError(historyError instanceof Error ? historyError.message : 'Could not record successful export')
    }
  }, [job?.durationMs, job?.id, job?.sizeBytes, job?.state, job?.updatedAt, onProjectChange, project, submittedExport])

  useEffect(() => {
    if (!successfulBatchSignature) return
    try {
      let next = project
      for (const item of batchItems.filter((candidate) => candidate.state === 'succeeded' && candidate.jobId)) {
        if (recordedExportJobs.current.has(item.jobId!)) continue
        next = recordSuccessfulExport(next, {
          jobId: item.jobId!,
          label: item.title,
          outputRelativePath: item.outputPath,
          format: item.format,
          range: { inMs: item.inMs, outMs: item.outMs },
          sceneIds: item.sceneIds,
          durationMs: item.durationMs,
          ...(item.sizeBytes !== undefined ? { sizeBytes: item.sizeBytes } : {}),
          completedAt: item.updatedAt ?? new Date().toISOString()
        })
        recordedExportJobs.current.add(item.jobId!)
      }
      if (next !== project) onProjectChange(next)
    } catch (historyError) {
      setError(historyError instanceof Error ? historyError.message : 'Could not record successful Short export')
    }
  }, [batchItems, onProjectChange, project, successfulBatchSignature])

  async function checkExportFiles() {
    if (!workerConnected || !workerToken.trim() || checkingExportFiles || !exportHistory.length) return
    setCheckingExportFiles(true)
    setExportAvailabilityError('')
    try {
      const results = await new WorkerClient({ baseUrl: workerUrl, token: workerToken }).exportAvailability(exportHistory.map((receipt) => receipt.outputRelativePath))
      const byPath = Object.fromEntries(results.map((result) => [result.path, result.available]))
      const available = results.filter((result) => result.available).length
      setExportFileCheck({ byPath, available, missing: results.length - available, checkedAt: new Date().toISOString() })
    } catch (availabilityError) {
      setExportFileCheck(null)
      setExportAvailabilityError(availabilityError instanceof Error ? availabilityError.message : 'Could not check export files')
    } finally {
      setCheckingExportFiles(false)
    }
  }

  async function startShortPreview() {
    if (!selectedShort || !readiness.ready || !duckingCheck.valid || !workerConnected || !workerToken.trim() || busy) return
    setShortPreviewSubmitting(true)
    setShortPreviewError('')
    try {
      const path = shortPreviewOutputPath(project, selectedShort, format)
      const fullPlan = createRenderPlan(project, profile.preview, path, { audioDucking: duckingSettings, loudnessNormalization: { ...defaultLoudnessNormalization, enabled: normalizeLoudness } })
      const plan = createRangeRenderPlan(fullPlan, { inMs: selectedShort.inMs, outMs: selectedShort.outMs }, path)
      setShortPreviewJob(null)
      setShortPreviewPath(path)
      setShortPreviewUrl('')
      setShortPreviewCurrentTime(0)
      setShortPreviewDurationMs(plan.durationMs)
      setShortPreviewSourceConfiguration(shortPreviewConfiguration)
      setShortPreviewJob(await new WorkerClient({ baseUrl: workerUrl, token: workerToken }).startRender(plan))
    } catch (previewError) {
      setShortPreviewError(previewError instanceof Error ? previewError.message : 'Could not start Short preview')
    } finally {
      setShortPreviewSubmitting(false)
    }
  }

  async function cancelShortPreview() {
    if (!shortPreviewJob || terminalStates.has(shortPreviewJob.state)) return
    setShortPreviewError('')
    try {
      setShortPreviewJob(await new WorkerClient({ baseUrl: workerUrl, token: workerToken }).cancelRender(shortPreviewJob.id))
    } catch (previewError) {
      setShortPreviewError(previewError instanceof Error ? previewError.message : 'Could not cancel Short preview')
    }
  }

  async function startRender() {
    if (!readiness.ready || !rangeCheck.valid || !duckingCheck.valid || !workerConnected || !workerToken.trim() || submitting) return
    setSubmitting(true)
    setError('')
    setSubmittedExport(null)
    try {
      const wholeTimeline = range.inMs === 0 && range.outMs === timelineDurationMs
      const path = renderOutputPath(project, new Date(), wholeTimeline ? format : selectedShort ? `${format}-${shortExportVariant(selectedShort)}` : `${format}-range-${range.inMs}-${range.outMs}`)
      const fullPlan = createRenderPlan(project, profile.export, path, { audioDucking: duckingSettings, loudnessNormalization: { ...defaultLoudnessNormalization, enabled: normalizeLoudness } })
      const plan = wholeTimeline ? fullPlan : createRangeRenderPlan(fullPlan, range, path)
      const next = await new WorkerClient({ baseUrl: workerUrl, token: workerToken }).startRender(plan)
      setOutputPath(path)
      setSubmittedExport({
        jobId: next.id,
        label: wholeTimeline ? 'Whole timeline' : selectedShort ? selectedShort.titles.join(' + ') : `Custom range ${(range.inMs / 1000).toFixed(3)}–${(range.outMs / 1000).toFixed(3)} s`,
        outputRelativePath: path,
        format,
        range: { ...range },
        sceneIds: wholeTimeline ? [] : selectedShort?.sceneIds ?? [],
        durationMs: plan.durationMs
      })
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

  function startShortBatch() {
    if (!readiness.ready || !duckingCheck.valid || !workerConnected || !workerToken.trim() || busy || submitting) return
    setError('')
    try {
      const planned = planShortExportBatch(project, shortExports.candidates, batchSelectedIds, batchFormats, new Date())
      const plans = new Map<string, RenderPlan>()
      for (const item of planned) {
        const fullPlan = createRenderPlan(project, formatProfiles[item.format].export, item.outputPath, { audioDucking: duckingSettings, loudnessNormalization: { ...defaultLoudnessNormalization, enabled: normalizeLoudness } })
        plans.set(item.id, createRangeRenderPlan(fullPlan, { inMs: item.inMs, outMs: item.outMs }, item.outputPath))
      }
      batchPlans.current = plans
      batchCancelRequested.current = false
      setBatchItems(planned.map((item) => ({ ...item, state: 'queued', progress: 0 })))
    } catch (batchError) {
      setError(batchError instanceof Error ? batchError.message : 'Could not prepare Short exports')
    }
  }

  async function cancelShortBatch() {
    if (!batchBusy) return
    batchCancelRequested.current = true
    setBatchItems(cancelPendingShortBatchItems)
    if (!activeBatchItem?.jobId) return
    try {
      const next = await new WorkerClient({ baseUrl: workerUrl, token: workerToken }).cancelRender(activeBatchItem.jobId)
      setBatchItems((items) => items.map((item) => item.id === activeBatchItem.id ? { ...item, state: next.state, progress: next.progress, createdAt: next.createdAt, updatedAt: next.updatedAt } : item))
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : 'Could not cancel Short export batch')
    }
  }

  const percent = Math.round((job?.progress ?? 0) * 100)
  const shortPreviewPercent = Math.round((shortPreviewJob?.progress ?? 0) * 100)

  return (
    <section className="card renderPanel">
      <div className="sectionLead">
        <div>
          <div className="eyebrow">REAL LOCAL RENDER</div>
          <h3>Render timeline</h3>
          <p>{profile.export.name} is rendered by the authenticated local worker into <code>KINAOU/Renders</code>. The project format drives single renders and composed preview; reviewed Shorts can be adapted to several formats in one sequential batch below.</p>
        </div>
        <span className={workerConnected ? 'status online' : 'status'}>{workerConnected ? 'WORKER READY' : 'WORKER OFFLINE'}</span>
      </div>

      <div className="formatChooser" role="group" aria-label="Output format">
        {targetFormats.map((id) => (
          <button key={id} className={id === format ? 'formatOption active' : 'formatOption'} disabled={busy} onClick={() => onProjectChange(setProjectTargetFormat(project, id))}>
            <strong>{formatProfiles[id].label}</strong>
            <small>{formatProfiles[id].aspect} · {formatProfiles[id].export.width}×{formatProfiles[id].export.height}</small>
          </button>
        ))}
      </div>
      <p className="cardBody">{profile.note}</p>

      <div className="fieldGrid">
        <label>In (seconds)<input type="number" min="0" step="0.001" value={inSeconds} disabled={busy} onChange={(event) => { setInSeconds(event.target.value); setSelectedShortId('') }} /></label>
        <label>Out (seconds)<input type="number" min="0" step="0.001" value={outSeconds} disabled={busy} onChange={(event) => { setOutSeconds(event.target.value); setSelectedShortId('') }} /></label>
      </div>
      <div className="renderActions">
        <button disabled={busy || (range.inMs === 0 && range.outMs === timelineDurationMs)} onClick={() => { setInSeconds('0'); setOutSeconds(String(timelineDurationMs / 1000)); setSelectedShortId('') }}>Whole timeline</button>
        {rangeCheck.valid && <span className="cardBody">Export range: {(range.inMs / 1000).toFixed(3)}–{(range.outMs / 1000).toFixed(3)} s ({((range.outMs - range.inMs) / 1000).toFixed(3)} s)</span>}
      </div>
      {!rangeCheck.valid && <div className="warning">{rangeCheck.reason}</div>}

      {project.storyboard.length > 0 && <div className="renderJob">
        <div className="renderJobHead"><strong>Scene short ranges</strong><span>up to {shortMaximumMs / 1000} s</span></div>
        <p className="cardBody">Reviewable ranges built only from contiguous storyboard scenes that are already anchored on active visual tracks.</p>
        <div className="formatChooser" role="group" aria-label="Maximum Short length">
          {[15, 30, 60, 90].map((seconds) => <button key={seconds} className={shortMaximumMs === seconds * 1000 ? 'formatOption active' : 'formatOption'} disabled={busy} onClick={() => onProjectChange(setProjectShortExportMaximum(project, seconds * 1000))}>
            <strong>{seconds} seconds</strong>
            <small>Replan scene groups</small>
          </button>)}
        </div>
        <div className="fieldGrid"><label>Custom maximum (seconds)<input type="number" min="1" max="600" step="0.001" value={shortMaximumSeconds} disabled={busy} onChange={(event) => setShortMaximumSeconds(event.target.value)} /></label></div>
        <div className="renderActions"><button disabled={busy || Boolean(customShortMaximumError) || customShortMaximumMs === shortMaximumMs} onClick={() => onProjectChange(setProjectShortExportMaximum(project, customShortMaximumMs))}>Apply custom maximum</button></div>
        {customShortMaximumError && <div className="warning">{customShortMaximumError}</div>}
        <div className="renderJobHead"><strong>Batch output formats</strong><span>{batchFormats.length} selected</span></div>
        <p className="cardBody">Choose one or more local adaptations. This does not change the project's main format or the selected Short preview.</p>
        <div className="formatChooser" role="group" aria-label="Short batch output formats">
          {targetFormats.map((id) => <button key={id} className={batchFormats.includes(id) ? 'formatOption active' : 'formatOption'} aria-pressed={batchFormats.includes(id)} disabled={busy} onClick={() => setBatchFormats((current) => {
            const selected = new Set(current)
            if (selected.has(id)) selected.delete(id)
            else selected.add(id)
            return targetFormats.filter((candidate) => selected.has(candidate))
          })}>
            <strong>{formatProfiles[id].label}</strong>
            <small>{formatProfiles[id].aspect} · {formatProfiles[id].export.width}×{formatProfiles[id].export.height}</small>
          </button>)}
        </div>
        {!batchFormats.length && <div className="warning">Select at least one output format for the Short batch.</div>}
        {shortExports.candidates.map((candidate) => <div className="renderMeta" key={candidate.id}>
          <span><strong>{candidate.titles.join(' + ')}</strong> · {(candidate.durationMs / 1000).toFixed(1)} s · {(candidate.inMs / 1000).toFixed(1)}–{(candidate.outMs / 1000).toFixed(1)} s</span>
          <div className="renderActions">
            <label className="checkRow"><input type="checkbox" checked={batchSelectedIds.includes(candidate.id)} disabled={busy} onChange={(event) => setBatchSelectedIds((ids) => event.target.checked ? [...ids, candidate.id] : ids.filter((id) => id !== candidate.id))} />Include</label>
            <button disabled={busy} onClick={() => { setInSeconds(String(candidate.inMs / 1000)); setOutSeconds(String(candidate.outMs / 1000)); setSelectedShortId(candidate.id) }}>{selectedShort?.id === candidate.id ? 'Selected' : 'Use this range'}</button>
          </div>
        </div>)}
        {!shortExports.candidates.length && <div className="warning">No exportable scene range yet. Assemble storyboard scenes on an active visual track first.</div>}
        {shortExports.skipped.map((item) => <div className="warning" key={item.sceneId}><strong>{item.title}:</strong> {item.reason}</div>)}
        {shortExports.candidates.length > 0 && <div className="renderActions">
          <button disabled={busy} onClick={() => setBatchSelectedIds(batchSelectedIds.length === shortExports.candidates.length ? [] : shortExports.candidates.map((candidate) => candidate.id))}>{batchSelectedIds.length === shortExports.candidates.length ? 'Clear selection' : 'Select all'}</button>
          <button className="primary" disabled={!batchSelectedIds.length || !batchFormats.length || !readiness.ready || !duckingCheck.valid || !workerConnected || !workerToken.trim() || busy || submitting} onClick={startShortBatch}>Export selected variants ({batchSelectedIds.length * batchFormats.length})</button>
        </div>}
      </div>}

      <label className="checkRow"><input type="checkbox" checked={duckingEnabled} disabled={busy} onChange={(event) => setDuckingEnabled(event.target.checked)} />Lower music while voice or dialogue is playing</label>
      {duckingEnabled && <div className="fieldGrid">
        <label>Reduction (dB)<input type="number" min="0" max="40" step="1" value={duckingReductionDb} disabled={busy} onChange={(event) => setDuckingReductionDb(event.target.value)} /></label>
        <label>Attack (ms)<input type="number" min="0" max="5000" step="10" value={duckingAttackMs} disabled={busy} onChange={(event) => setDuckingAttackMs(event.target.value)} /></label>
        <label>Release (ms)<input type="number" min="0" max="5000" step="10" value={duckingReleaseMs} disabled={busy} onChange={(event) => setDuckingReleaseMs(event.target.value)} /></label>
      </div>}
      {!duckingCheck.valid && <div className="warning">{duckingCheck.reason}</div>}

      <label className="checkRow"><input type="checkbox" checked={normalizeLoudness} disabled={busy} onChange={(event) => setNormalizeLoudness(event.target.checked)} />Normalize export loudness to −14 LUFS</label>
      <p className="cardBody">Optional master processing · true peak ≤ −1.5 dBTP · loudness range 11 LU. Off by default because it changes the sound.</p>

      {selectedShort && <div className="renderJob">
        <div className="renderJobHead"><strong>Selected Short preview</strong><span>{formatProfiles[format].label} · {(selectedShort.durationMs / 1000).toFixed(1)} s</span></div>
        <p className="cardBody">Renders this exact scene range through the real composed-preview path, including layers, captions, transforms, retiming and the audio settings above. The temporary MP4 stays in <code>KINAOU/Cache/Previews</code>.</p>
        <div className="renderActions">
          <button className="secondaryButton" disabled={!readiness.ready || !duckingCheck.valid || !workerConnected || !workerToken.trim() || busy} onClick={startShortPreview}>{shortPreviewBusy ? `Rendering ${shortPreviewPercent}%` : shortPreviewUrl && shortPreviewCurrent ? 'Refresh Short preview' : 'Render Short preview'}</button>
          {shortPreviewJob && !terminalStates.has(shortPreviewJob.state) && <button className="dangerButton" onClick={cancelShortPreview}>Cancel preview</button>}
        </div>
        {shortPreviewJob && <div className="progressTrack" aria-label={`Short preview progress ${shortPreviewPercent}%`}><div className="progressFill" style={{ width: `${shortPreviewPercent}%` }} /></div>}
        {shortPreviewJob?.error && <div className="errorBox">{shortPreviewJob.error}</div>}
        {shortPreviewError && <div className="errorBox">{shortPreviewError}</div>}
        {shortPreviewUrl && shortPreviewCurrent && <>
          <video ref={shortPreviewVideoRef} className="proxyVideo" src={shortPreviewUrl} controls preload="metadata" onTimeUpdate={(event) => setShortPreviewCurrentTime(event.currentTarget.currentTime)} />
          <label>Playhead {shortPreviewCurrentTime.toFixed(2)}s<input type="range" min="0" max={shortPreviewDurationMs / 1000} step="0.01" value={shortPreviewCurrentTime} onChange={(event) => { const value = Number(event.target.value); setShortPreviewCurrentTime(value); if (shortPreviewVideoRef.current) shortPreviewVideoRef.current.currentTime = value }} /></label>
        </>}
      </div>}

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

      {batchItems.length > 0 && <div className="renderJob">
        <div className="renderJobHead"><strong>SHORT EXPORT BATCH</strong><span>{batchItems.filter((item) => shortBatchTerminalStates.has(item.state)).length}/{batchItems.length} finished</span></div>
        <p className="cardBody">Exports run one at a time so local FFmpeg work stays bounded. A failed item is reported without hiding the remaining results.</p>
        {batchItems.map((item) => <div className="renderJob" key={item.id}>
          <div className="renderJobHead"><strong>{item.title}</strong><span>{formatProfiles[item.format].label} · {item.state.toUpperCase()} · {Math.round(item.progress * 100)}%</span></div>
          <div className="progressTrack" aria-label={`${item.title} render progress ${Math.round(item.progress * 100)}%`}><div className="progressFill" style={{ width: `${Math.round(item.progress * 100)}%` }} /></div>
          <div className="renderMeta"><code>{item.renderedPath ?? item.outputPath}</code>{item.sizeBytes !== undefined && <span>{(item.sizeBytes / 1024 / 1024).toFixed(1)} MB</span>}</div>
          {item.error && <div className="errorBox">{item.error}</div>}
        </div>)}
        {batchBusy && <div className="renderActions"><button className="dangerButton" onClick={cancelShortBatch}>Cancel batch</button></div>}
      </div>}

      <div className="renderJob">
        <div className="renderJobHead"><strong>Successful exports</strong><span>{exportHistory.length}/50 recorded</span></div>
        <p className="cardBody">This project keeps a bounded receipt for each successful worker render. Forgetting a receipt only removes this list entry — the MP4 in <code>KINAOU/Renders</code> is never deleted.</p>
        {!exportHistory.length && <p className="cardBody">No successful export recorded yet.</p>}
        {exportHistory.length > 0 && <div className="renderActions">
          <button className="secondaryButton" disabled={!workerConnected || !workerToken.trim() || checkingExportFiles} onClick={checkExportFiles}>{checkingExportFiles ? 'Checking export files…' : 'Check export files'}</button>
          {exportFileCheck && <span className="cardBody">{exportFileCheck.available} available · {exportFileCheck.missing} missing · checked {new Date(exportFileCheck.checkedAt).toLocaleString()}</span>}
        </div>}
        {exportAvailabilityError && <div className="errorBox">{exportAvailabilityError}</div>}
        {exportHistory.map((receipt) => {
          const fileAvailable = exportFileCheck?.byPath[receipt.outputRelativePath]
          return <div className="renderJob" key={receipt.jobId}>
            <div className="renderJobHead"><strong>{receipt.label}</strong><span>{formatProfiles[receipt.format].label} · {(receipt.durationMs / 1000).toFixed(1)} s · {new Date(receipt.completedAt).toLocaleString()}</span>{fileAvailable !== undefined && <span className={fileAvailable ? 'status online' : 'status missing'}>{fileAvailable ? 'FILE AVAILABLE' : 'FILE MISSING'}</span>}</div>
            <div className="renderMeta">
              <code>{receipt.outputRelativePath}</code>
              {receipt.sizeBytes !== undefined && <span>{(receipt.sizeBytes / 1024 / 1024).toFixed(1)} MB</span>}
              <span>{(receipt.range.inMs / 1000).toFixed(3)}–{(receipt.range.outMs / 1000).toFixed(3)} s{receipt.sceneIds.length ? ` · ${receipt.sceneIds.length} scene${receipt.sceneIds.length === 1 ? '' : 's'}` : ''}</span>
              <button disabled={busy || checkingExportFiles} onClick={() => { try { onProjectChange(forgetExportReceipt(project, receipt.jobId)) } catch (historyError) { setError(historyError instanceof Error ? historyError.message : 'Could not forget export receipt') } }}>Forget receipt (keep MP4)</button>
            </div>
          </div>
        })}
      </div>

      <div className="renderActions">
        <button className="primary" disabled={!readiness.ready || !rangeCheck.valid || !duckingCheck.valid || !workerConnected || !workerToken.trim() || busy || submitting} onClick={startRender}>
          {submitting ? 'Submitting…' : batchBusy ? 'Short batch in progress' : job && terminalStates.has(job.state) ? 'Render again' : 'Start render'}
        </button>
        {singleBusy && <button className="dangerButton" onClick={cancelRender}>Cancel render</button>}
      </div>
    </section>
  )
}
