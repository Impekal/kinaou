import { useEffect, useMemo, useRef, useState } from 'react'
import type { KinaouProject } from '../core/project'
import { createRenderPlan, formatProfiles, formatReframingRequiresWorker, projectFormatPreset, projectFormatReframing, projectTargetFormat, setProjectTargetFormat, type RenderPlan, type TargetFormat } from '../core/render'
import type { RenderJobRecord } from '../core/renderJobs'
import { renderOutputPath, renderReadiness } from '../core/renderUi'
import { WorkerClient } from '../core/workerClient'
import { createRangeRenderPlan, validateRenderRange } from '../core/renderRange'
import { defaultAudioDucking, validateAudioDucking } from '../core/audioDucking'
import { defaultLoudnessNormalization } from '../core/audioLoudness'
import { planShortExportBatch, planShortExportRanges, projectShortExportMaximum, setProjectShortExportMaximum, shortExportMaximumError, shortExportVariant, shortPreviewOutputPath } from '../core/shortExportRanges'
import { acceptShortBatchJob, archiveProjectShortBatch, cancelPendingShortBatchItems, clearProjectShortBatch, createPersistedShortBatch, failMissingShortBatchJob, forgetProjectShortBatchArchiveEntry, nextShortBatchItem, planSelectiveShortBatchRetry, projectPersistedShortBatch, projectShortBatchArchive, rebuildPersistedShortBatchPlans, replacePersistedShortBatchItems, requeueMissingShortBatchJob, retryableShortBatchItems, reviewArchivedShortBatchSelection, shortBatchArchiveLimit, shortBatchBusy, shortBatchTerminalStates, storeProjectShortBatch, type PersistedShortBatch, type PersistedShortBatchItem } from '../core/shortExportBatch'
import { forgetProjectShortExportRecipe, projectShortExportRecipes, reviewShortExportRecipe, saveProjectShortExportRecipe, shortExportRecipeLimit } from '../core/shortExportRecipes'
import { recordSuccessfulExport } from '../core/exportHistory'
import { courseLessonChoices, planCourseLessonExport } from '../core/course'
import { CourseLessonSelector } from './CourseLessonSelector'
import { reviewCourseExport, resolveCourseExportReview, type CourseExportReview } from '../core/courseExportReview'
import { SingleExportSession, type ExportFeedback } from '../core/singleExportSession'
import { useUiLanguage } from './UiLanguageProvider'
import { SingleExportStatus } from './SingleExportStatus'
import { FormatFramingPanel } from './FormatFramingPanel'
import { ExportHistoryPanel } from './ExportHistoryPanel'

interface RenderPanelProps {
  project: KinaouProject
  workerUrl: string
  workerToken: string
  workerConnected: boolean
  workerCapabilities: string[]
  onProjectChange: (project: KinaouProject) => void
}

const terminalStates = new Set(['succeeded', 'failed', 'cancelled'])
const targetFormats = Object.keys(formatProfiles) as TargetFormat[]
interface ExportFileCheck { byPath: Record<string, boolean>; available: number; missing: number; checkedAt: string }
interface ArchivedBatchFileCheck extends ExportFileCheck { batchId: string }
interface ArchivedBatchSelectionReview { batchId: string; unavailable: Array<{ candidateId: string; title: string }> }
interface ShortRecipeReview { recipeId: string; unavailableCandidateIds: string[] }

export function RenderPanel({ project, workerUrl, workerToken, workerConnected, workerCapabilities, onProjectChange }: RenderPanelProps) {
  const readiness = useMemo(() => renderReadiness(project), [project])
  const format = projectTargetFormat(project)
  const profile = formatProfiles[format]
  const { language, t } = useUiLanguage()
  const [single, setSingle] = useState<ExportFeedback | null>(null)
  const singleSession = useRef<SingleExportSession | null>(null)
  const latest = useRef({ project, onProjectChange, workerUrl, workerToken, workerConnected })
  latest.current = { project, onProjectChange, workerUrl, workerToken, workerConnected }
  const job = single?.job ?? null
  const submitting = single?.phase === 'starting'
  useEffect(() => {
    singleSession.current?.detach()
    singleSession.current = null
    setSingle(null)
    return () => { singleSession.current?.detach() }
  }, [project.id, workerUrl, workerToken, workerConnected])
  const [error, setError] = useState('')
  const recordedExportJobs = useRef(new Set<string>())
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
  const [lessonReview, setLessonReview] = useState<CourseExportReview | null>(null)
  let lessonChoices: ReturnType<typeof courseLessonChoices> = []
  let courseError = ''
  try { lessonChoices = courseLessonChoices(project, timelineDurationMs) } catch (cause) { courseError = (cause as Error).message }
  const { lesson: selectedLesson, stale: lessonReviewStale } = resolveCourseExportReview(project.id, lessonReview, lessonChoices, range)
  const [batchSelectedIds, setBatchSelectedIds] = useState<string[]>([])
  const [batchFormats, setBatchFormats] = useState<TargetFormat[]>([format])
  const [shortRecipeName, setShortRecipeName] = useState('')
  const [shortRecipeReview, setShortRecipeReview] = useState<ShortRecipeReview | null>(null)
  const shortRecipes = projectShortExportRecipes(project)
  const [batchItems, setBatchItems] = useState<PersistedShortBatchItem[]>([])
  const batchPlans = useRef(new Map<string, RenderPlan>())
  const persistedBatch = useRef<PersistedShortBatch | null>(null)
  const batchSubmitting = useRef(false)
  const batchCancelRequested = useRef(false)
  const [batchResumeError, setBatchResumeError] = useState('')
  const [batchPersistenceMessage, setBatchPersistenceMessage] = useState('')
  const [retrySelectedIds, setRetrySelectedIds] = useState<string[]>([])
  const batchArchive = projectShortBatchArchive(project)
  const batchArchivePathSignature = batchArchive.map((entry) => `${entry.batchId}:${entry.items.map((item) => item.outputPath).join('\u0000')}`).join('|')
  const [archivedBatchFileCheck, setArchivedBatchFileCheck] = useState<ArchivedBatchFileCheck | null>(null)
  const [checkingArchivedBatchId, setCheckingArchivedBatchId] = useState('')
  const [archivedBatchAvailabilityError, setArchivedBatchAvailabilityError] = useState('')
  const archivedBatchAvailabilityRequest = useRef(0)
  const [archivedBatchSelectionReview, setArchivedBatchSelectionReview] = useState<ArchivedBatchSelectionReview | null>(null)
  const projectBatchId = projectPersistedShortBatch(project)?.id ?? (Object.prototype.hasOwnProperty.call(project.metadata, 'shortExportBatch') ? 'invalid' : '')
  const selectedShort = shortExports.candidates.find((candidate) => candidate.id === selectedShortId && candidate.inMs === range.inMs && candidate.outMs === range.outMs)
  const shortPreviewVideoRef = useRef<HTMLVideoElement>(null)
  const [shortPreviewJob, setShortPreviewJob] = useState<RenderJobRecord | null>(null)
  const [shortPreviewPath, setShortPreviewPath] = useState('')
  const [shortPreviewUrl, setShortPreviewUrl] = useState('')
  const [shortPreviewError, setShortPreviewError] = useState('')
  const [shortPreviewCurrentTime, setShortPreviewCurrentTime] = useState(0)
  const [shortPreviewDurationMs, setShortPreviewDurationMs] = useState(0)
  const [shortPreviewFormat, setShortPreviewFormat] = useState<TargetFormat>(format)
  const [shortPreviewSubmitting, setShortPreviewSubmitting] = useState(false)
  const [shortPreviewSourceConfiguration, setShortPreviewSourceConfiguration] = useState('')
  const shortPreviewReframing = projectFormatReframing(project, shortPreviewFormat)
  const shortPreviewConfiguration = selectedShort ? `${shortPreviewFormat}:${shortPreviewReframing.fit}:${shortPreviewReframing.focusX}:${shortPreviewReframing.focusY}:${selectedShort.id}:${selectedShort.inMs}:${selectedShort.outMs}:${duckingEnabled}:${duckingReductionDb}:${duckingAttackMs}:${duckingReleaseMs}:${normalizeLoudness}` : ''
  const shortPreviewCurrent = Boolean(shortPreviewSourceConfiguration && shortPreviewSourceConfiguration === shortPreviewConfiguration)
  const shortPreviewBusy = shortPreviewSubmitting || Boolean(shortPreviewJob && !terminalStates.has(shortPreviewJob.state))
  const singleBusy = Boolean(single && !['succeeded', 'failed', 'cancelled', 'detached'].includes(single.phase))
  const batchBusy = shortBatchBusy(batchItems)
  const busy = singleBusy || batchBusy || shortPreviewBusy
  const workerSupportsFormatReframing = workerCapabilities.includes('format-reframing')
  const singleReframingBlocked = formatReframingRequiresWorker(project, format) && !workerSupportsFormatReframing
  const shortPreviewReframingBlocked = formatReframingRequiresWorker(project, shortPreviewFormat) && !workerSupportsFormatReframing
  const batchReframingBlocked = batchFormats.some((id) => formatReframingRequiresWorker(project, id)) && !workerSupportsFormatReframing
  const anyReframingBlocked = targetFormats.some((id) => formatReframingRequiresWorker(project, id)) && !workerSupportsFormatReframing
  const retryableBatchItems = useMemo(() => {
    if (batchBusy || !persistedBatch.current) return []
    try {
      const current = replacePersistedShortBatchItems(persistedBatch.current, batchItems, new Date(persistedBatch.current.updatedAt))
      return retryableShortBatchItems(current)
    } catch {
      return []
    }
  }, [batchBusy, batchItems])
  const retryableBatchIds = useMemo(() => new Set(retryableBatchItems.map((item) => item.id)), [retryableBatchItems])
  const retryableBatchSignature = retryableBatchItems.map((item) => item.id).join('\u0000')
  const retryFormats = new Set(batchItems.filter((item) => retrySelectedIds.includes(item.id)).map((item) => item.format))
  const retryReframingBlocked = [...retryFormats].some((id) => formatReframingRequiresWorker(project, id)) && !workerSupportsFormatReframing
  const activeBatchItem = batchItems.find((item) => item.jobId && !terminalStates.has(item.state))
  const successfulBatchSignature = batchItems.filter((item) => item.state === 'succeeded' && item.jobId).map((item) => `${item.jobId}:${item.updatedAt}:${item.sizeBytes}`).join('|')

  useEffect(() => {
    batchSubmitting.current = false
    batchCancelRequested.current = false
    batchPlans.current = new Map()
    setRetrySelectedIds([])
    setBatchResumeError('')
    const stored = projectPersistedShortBatch(project)
    if (!stored) {
      persistedBatch.current = null
      setBatchItems([])
      setBatchPersistenceMessage('')
      if (Object.prototype.hasOwnProperty.call(project.metadata, 'shortExportBatch')) setBatchResumeError('The saved Short batch is malformed and was ignored. Discard it before preparing a new batch.')
      return
    }
    persistedBatch.current = stored
    setBatchItems(stored.items)
    setDuckingEnabled(stored.audioDucking.enabled)
    setDuckingReductionDb(String(stored.audioDucking.reductionDb))
    setDuckingAttackMs(String(stored.audioDucking.attackMs))
    setDuckingReleaseMs(String(stored.audioDucking.releaseMs))
    setNormalizeLoudness(stored.loudnessNormalization.enabled)
    setBatchPersistenceMessage(`Restored the Short batch saved ${new Date(stored.updatedAt).toLocaleString()}. Finished outputs stay finished; only unfinished work can continue.`)
    try {
      batchPlans.current = rebuildPersistedShortBatchPlans(project, stored)
    } catch (resumeError) {
      setBatchResumeError(resumeError instanceof Error ? resumeError.message : 'Could not safely resume the saved Short batch.')
    }
  }, [project.id, projectBatchId])

  useEffect(() => {
    const current = persistedBatch.current
    if (!current || !batchItems.length) return
    const stored = projectPersistedShortBatch(project)
    if (stored?.id === current.id && JSON.stringify(stored.items) === JSON.stringify(batchItems)) return
    try {
      const updated = replacePersistedShortBatchItems(current, batchItems)
      persistedBatch.current = updated
      const nextProject = storeProjectShortBatch(project, updated)
      if (nextProject !== project) onProjectChange(nextProject)
    } catch (persistenceError) {
      setBatchResumeError(persistenceError instanceof Error ? persistenceError.message : 'Could not save the Short batch with this project.')
    }
  }, [batchItems, onProjectChange, project])

  useEffect(() => {
    setInSeconds('0')
    setOutSeconds(String(timelineDurationMs / 1000))
    setSelectedShortId('')
  }, [timelineDurationMs])

  useEffect(() => {
    setBatchSelectedIds([])
    setArchivedBatchSelectionReview(null)
    setShortRecipeReview(null)
  }, [shortCandidateSignature])

  useEffect(() => {
    setRetrySelectedIds((ids) => ids.filter((id) => retryableBatchIds.has(id)))
  }, [retryableBatchIds, retryableBatchSignature])

  useEffect(() => {
    setBatchFormats([format])
    setShortPreviewFormat(format)
  }, [format])

  useEffect(() => {
    setShortMaximumSeconds(String(shortMaximumMs / 1000))
  }, [shortMaximumMs])


  useEffect(() => {
    archivedBatchAvailabilityRequest.current += 1
    setArchivedBatchFileCheck(null)
    setCheckingArchivedBatchId('')
    setArchivedBatchAvailabilityError('')
  }, [batchArchivePathSignature])

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
    if (!activeBatchItem?.jobId || !workerConnected || !workerToken.trim()) return
    let disposed = false
    let timer: ReturnType<typeof setInterval> | undefined
    const client = new WorkerClient({ baseUrl: workerUrl, token: workerToken })
    const poll = async () => {
      try {
        const next = await client.renderStatus(activeBatchItem.jobId!)
        if (disposed) return
        const accepted = acceptShortBatchJob(activeBatchItem, next)
        setBatchItems((items) => items.map((item) => item.id === activeBatchItem.id ? accepted : item))
        if (terminalStates.has(next.state) && timer) clearInterval(timer)
      } catch (pollError) {
        if (disposed) return
        const message = pollError instanceof Error ? pollError.message : 'Short export status failed'
        if (/render job not found/i.test(message)) {
          try {
            const [output] = await client.exportAvailability([activeBatchItem.outputPath])
            if (output.available) {
              setBatchItems((items) => failMissingShortBatchJob(items, activeBatchItem.id, 'The worker lost this job but an output file already exists. KINAOU did not overwrite or trust it; prepare a new batch if this variant must be rendered again.'))
              setBatchPersistenceMessage('An interrupted output already existed and was left untouched. The remaining queued outputs can continue.')
            } else {
              setBatchItems((items) => requeueMissingShortBatchJob(items, activeBatchItem.id))
              setBatchPersistenceMessage('The worker no longer had the interrupted job and no output file existed. Its unfinished output was safely returned to the queue.')
            }
          } catch (availabilityError) {
            setError(availabilityError instanceof Error ? availabilityError.message : 'Could not safely check the interrupted Short output.')
          }
        } else setError(message)
      }
    }
    void poll()
    timer = setInterval(() => void poll(), 1000)
    return () => {
      disposed = true
      if (timer) clearInterval(timer)
    }
  }, [activeBatchItem?.id, activeBatchItem?.jobId, workerConnected, workerToken, workerUrl])

  useEffect(() => {
    if (batchCancelRequested.current || batchSubmitting.current || activeBatchItem || batchResumeError || !workerConnected || !workerToken.trim()) return
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
      const accepted = acceptShortBatchJob(nextItem, next)
      if (batchCancelRequested.current) {
        try {
          const cancelled = await client.cancelRender(next.id)
          const result = acceptShortBatchJob(accepted, cancelled)
          setBatchItems((items) => items.map((item) => item.id === nextItem.id ? result : item))
        } catch (cancelError) {
          const message = cancelError instanceof Error ? cancelError.message : 'Could not cancel submitted Short export'
          setBatchItems((items) => items.map((item) => item.id === nextItem.id ? { ...accepted, error: message } : item))
          setError(message)
        }
        return
      }
      setBatchItems((items) => items.map((item) => item.id === nextItem.id ? accepted : item))
    }).catch((batchError) => {
      setBatchItems((items) => items.map((item) => item.id === nextItem.id ? { ...item, state: 'failed', error: batchError instanceof Error ? batchError.message : 'Could not start Short export' } : item))
    }).finally(() => { batchSubmitting.current = false })
  }, [activeBatchItem, batchItems, batchResumeError, workerConnected, workerToken, workerUrl])


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

  async function checkArchivedBatchFiles(batchId: string) {
    if (!workerConnected || !workerToken.trim() || checkingArchivedBatchId) return
    const entry = batchArchive.find((item) => item.batchId === batchId)
    if (!entry) return
    const request = archivedBatchAvailabilityRequest.current + 1
    archivedBatchAvailabilityRequest.current = request
    setCheckingArchivedBatchId(batchId)
    setArchivedBatchFileCheck(null)
    setArchivedBatchAvailabilityError('')
    try {
      const results = await new WorkerClient({ baseUrl: workerUrl, token: workerToken }).exportAvailabilityBatched(entry.items.map((item) => item.outputPath))
      if (archivedBatchAvailabilityRequest.current !== request) return
      const byPath = Object.fromEntries(results.map((result) => [result.path, result.available]))
      const available = results.filter((result) => result.available).length
      setArchivedBatchFileCheck({ batchId, byPath, available, missing: results.length - available, checkedAt: new Date().toISOString() })
    } catch (availabilityError) {
      if (archivedBatchAvailabilityRequest.current !== request) return
      setArchivedBatchAvailabilityError(availabilityError instanceof Error ? availabilityError.message : 'Could not check archived Short outputs')
    } finally {
      if (archivedBatchAvailabilityRequest.current === request) setCheckingArchivedBatchId('')
    }
  }

  function reviewArchivedBatchSelection(batchId: string) {
    if (busy) return
    const entry = batchArchive.find((item) => item.batchId === batchId)
    if (!entry) return
    setError('')
    try {
      const review = reviewArchivedShortBatchSelection(entry, shortExports.candidates)
      setBatchSelectedIds(review.candidateIds)
      setBatchFormats(review.formats)
      setArchivedBatchSelectionReview({ batchId, unavailable: review.unavailable })
    } catch (reviewError) {
      setArchivedBatchSelectionReview(null)
      setError(reviewError instanceof Error ? reviewError.message : 'Could not restore the archived Short selection for review')
    }
  }

  function applyShortMaximum(value: number) {
    if (busy) return
    setError('')
    try { onProjectChange(setProjectShortExportMaximum(project, value)) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save the Short maximum') }
  }

  function saveShortRecipe() {
    if (busy) return
    setError('')
    try {
      onProjectChange(saveProjectShortExportRecipe(project, { name: shortRecipeName, candidateIds: batchSelectedIds, formats: batchFormats }, shortExports.candidates))
      setShortRecipeName('')
    } catch (recipeError) {
      setError(recipeError instanceof Error ? recipeError.message : 'Could not save the Short recipe')
    }
  }

  function reviewRecipe(recipeId: string) {
    if (busy) return
    const recipe = shortRecipes.find((item) => item.id === recipeId)
    if (!recipe) return
    const review = reviewShortExportRecipe(recipe, shortExports.candidates)
    setBatchSelectedIds(review.candidateIds)
    setBatchFormats(review.formats)
    setShortRecipeReview({ recipeId, unavailableCandidateIds: review.unavailableCandidateIds })
    setArchivedBatchSelectionReview(null)
    setError('')
  }

  async function startShortPreview() {
    if (!selectedShort || !readiness.ready || !duckingCheck.valid || !workerConnected || !workerToken.trim() || busy || shortPreviewReframingBlocked) return
    setShortPreviewSubmitting(true)
    setShortPreviewError('')
    try {
      const path = shortPreviewOutputPath(project, selectedShort, shortPreviewFormat)
      const fullPlan = createRenderPlan(project, projectFormatPreset(project, shortPreviewFormat, 'preview'), path, { audioDucking: duckingSettings, loudnessNormalization: { ...defaultLoudnessNormalization, enabled: normalizeLoudness } })
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

  function startRender() {
    if (!readiness.ready || !rangeCheck.valid || lessonReviewStale || !duckingCheck.valid || !workerConnected || !workerToken.trim() || busy || singleSession.current?.busy || singleReframingBlocked) return
    setError('')
    try {
      const wholeTimeline = range.inMs === 0 && range.outMs === timelineDurationMs
      const path = renderOutputPath(project, new Date(), `${format}-${crypto.randomUUID()}`)
      const fullPlan = createRenderPlan(project, projectFormatPreset(project, format, 'export'), path, { audioDucking: duckingSettings, loudnessNormalization: { ...defaultLoudnessNormalization, enabled: normalizeLoudness } })
      const lessonExport = selectedLesson ? planCourseLessonExport(project, selectedLesson.id, fullPlan, path) : null
      const plan = lessonExport?.plan ?? (wholeTimeline ? fullPlan : createRangeRenderPlan(fullPlan, range, path))
      singleSession.current?.detach()
      const session = new SingleExportSession(plan, {
        label: lessonExport?.label ?? (wholeTimeline ? 'Whole timeline' : selectedShort ? selectedShort.titles.join(' + ') : `Custom range ${(range.inMs / 1000).toFixed(3)}–${(range.outMs / 1000).toFixed(3)} s`),
        ...(lessonExport ? { courseLesson: lessonExport.context } : {}),
        outputRelativePath: path, format, range: { ...range },
        sceneIds: wholeTimeline ? [] : selectedShort?.sceneIds ?? [], durationMs: plan.durationMs
      }, {
        client: new WorkerClient({ baseUrl: workerUrl, token: workerToken }),
        current: () => latest.current.project.id === project.id && latest.current.workerUrl === workerUrl && latest.current.workerToken === workerToken && latest.current.workerConnected,
        record: (receipt) => {
          const current = latest.current
          const saved = recordSuccessfulExport(current.project, receipt)
          if (saved !== current.project) { current.onProjectChange(saved); latest.current.project = saved }
        },
        publish: setSingle
      })
      singleSession.current = session
      void session.run()
    } catch (cause) { setError(String(cause)) }
  }

  function detachSingle() {
    singleSession.current?.detach()
    singleSession.current = null
    setSingle((previous) => previous ? { ...previous, phase: 'detached', detail: undefined } : null)
  }

  function startShortBatch() {
    if (!readiness.ready || !duckingCheck.valid || !workerConnected || !workerToken.trim() || busy || submitting || batchReframingBlocked || batchResumeError) return
    setError('')
    try {
      const now = new Date()
      const previousBatch = persistedBatch.current
      const planned = planShortExportBatch(project, shortExports.candidates, batchSelectedIds, batchFormats, now)
      const plans = new Map<string, RenderPlan>()
      for (const item of planned) {
        const fullPlan = createRenderPlan(project, projectFormatPreset(project, item.format, 'export'), item.outputPath, { audioDucking: duckingSettings, loudnessNormalization: { ...defaultLoudnessNormalization, enabled: normalizeLoudness } })
        plans.set(item.id, createRangeRenderPlan(fullPlan, { inMs: item.inMs, outMs: item.outMs }, item.outputPath))
      }
      const durable = createPersistedShortBatch(planned.map((item) => ({ ...item, state: 'queued', progress: 0 })), plans, now)
      const archivedProject = previousBatch && batchItems.length ? archiveProjectShortBatch(project, { ...previousBatch, items: batchItems }, now) : project
      const nextProject = storeProjectShortBatch(archivedProject, durable, now)
      batchPlans.current = plans
      batchCancelRequested.current = false
      persistedBatch.current = durable
      setBatchItems(durable.items)
      setRetrySelectedIds([])
      setArchivedBatchSelectionReview(null)
      setBatchResumeError('')
      setBatchPersistenceMessage('This reviewed batch is saved with the project. Reloading keeps completed results and continues only unfinished outputs.')
      onProjectChange(nextProject)
    } catch (batchError) {
      setError(batchError instanceof Error ? batchError.message : 'Could not prepare Short exports')
    }
  }

  function startSelectedShortBatchRetries() {
    const current = persistedBatch.current
    if (!current || !retrySelectedIds.length || !readiness.ready || !duckingCheck.valid || !workerConnected || !workerToken.trim() || busy || submitting || retryReframingBlocked || batchResumeError) return
    setError('')
    try {
      const result = planSelectiveShortBatchRetry(project, { ...current, items: batchItems }, shortExports.candidates, retrySelectedIds, {
        audioDucking: duckingSettings,
        loudnessNormalization: { ...defaultLoudnessNormalization, enabled: normalizeLoudness }
      }, new Date())
      batchPlans.current = result.plans
      batchCancelRequested.current = false
      persistedBatch.current = result.batch
      setBatchItems(result.batch.items)
      setRetrySelectedIds([])
      setBatchResumeError('')
      setBatchPersistenceMessage(`${result.plans.size} selected Short ${result.plans.size === 1 ? 'variant has' : 'variants have'} a fresh retry output. Earlier attempts and completed files stay untouched.`)
      onProjectChange(storeProjectShortBatch(project, result.batch))
    } catch (batchError) {
      setError(batchError instanceof Error ? batchError.message : 'Could not retry the selected Short variants')
    }
  }

  async function cancelShortBatch() {
    if (!batchBusy) return
    batchCancelRequested.current = true
    setBatchItems(cancelPendingShortBatchItems)
    if (!activeBatchItem?.jobId) return
    try {
      const next = await new WorkerClient({ baseUrl: workerUrl, token: workerToken }).cancelRender(activeBatchItem.jobId)
      const accepted = acceptShortBatchJob(activeBatchItem, next)
      setBatchItems((items) => items.map((item) => item.id === activeBatchItem.id ? accepted : item))
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : 'Could not cancel Short export batch')
    }
  }

  function discardShortBatch() {
    if (activeBatchItem) return
    const current = persistedBatch.current
    const now = new Date()
    const archivedProject = current && batchItems.length && !shortBatchBusy(batchItems) ? archiveProjectShortBatch(project, { ...current, items: batchItems }, now) : project
    batchPlans.current = new Map()
    persistedBatch.current = null
    batchCancelRequested.current = false
    setBatchItems([])
    setRetrySelectedIds([])
    setBatchResumeError('')
    setBatchPersistenceMessage('')
    onProjectChange(clearProjectShortBatch(archivedProject, now))
  }

  const shortPreviewPercent = Math.round((shortPreviewJob?.progress ?? 0) * 100)

  return (
    <section className="card renderPanel">
      <div className="sectionLead">
        <div>
          <div className="eyebrow">{t('export.eyebrow')}</div>
          <h3>{t('export.heading')}</h3>
          <p>{t('export.help')}</p><p>{t('export.scope')}</p>
        </div>
        <span className={workerConnected ? 'status online' : 'status'}>{t(workerConnected ? 'export.ready' : 'export.offline')}</span>
      </div>

      <div className="formatChooser" role="group" aria-label={t('export.format')}>
        {targetFormats.map((id) => (
          <button key={id} className={id === format ? 'formatOption active' : 'formatOption'} disabled={busy} onClick={() => onProjectChange(setProjectTargetFormat(project, id))}>
            <strong>{t(`export.${id}`)}</strong>
            <small>{formatProfiles[id].aspect} · {formatProfiles[id].export.width}×{formatProfiles[id].export.height}</small>
          </button>
        ))}
      </div>
      <p className="cardBody">{profile.aspect} · {profile.export.width}×{profile.export.height}</p>

      <FormatFramingPanel project={project} busy={busy} workerBlocked={workerConnected && anyReframingBlocked} onProjectChange={onProjectChange} />

      <CourseLessonSelector lessons={lessonChoices} selectedId={lessonReview?.lessonId ?? ''} stale={lessonReviewStale} disabled={busy || submitting} onSelect={(id) => {
        const lesson = lessonChoices.find(entry => entry.id === id)
        if (!id) { setLessonReview(null); return }
        if (!lesson?.check.valid) return
        setLessonReview(reviewCourseExport(project.id, lesson))
        setSelectedShortId('')
        setInSeconds(String(lesson.range.inMs / 1000))
        setOutSeconds(String(lesson.range.outMs / 1000))
      }} />
      {courseError && <div className="warning" role="alert">{t('lessonExport.error')}<details><summary>{t('common.details')}</summary>{courseError}</details></div>}
      <div className="fieldGrid">
        <label>{t('export.in')}<input type="number" min="0" step="0.001" value={inSeconds} disabled={busy} onChange={(event) => { setInSeconds(event.target.value); setSelectedShortId(''); setLessonReview(null) }} /></label>
        <label>{t('export.out')}<input type="number" min="0" step="0.001" value={outSeconds} disabled={busy} onChange={(event) => { setOutSeconds(event.target.value); setSelectedShortId(''); setLessonReview(null) }} /></label>
      </div>
      <div className="renderActions">
        <button disabled={busy || (!selectedLesson && range.inMs === 0 && range.outMs === timelineDurationMs)} onClick={() => { setInSeconds('0'); setOutSeconds(String(timelineDurationMs / 1000)); setSelectedShortId(''); setLessonReview(null) }}>{t('export.whole')}</button>
        {rangeCheck.valid && <span className="cardBody">{t('export.range', { start: (range.inMs / 1000).toLocaleString(language), end: (range.outMs / 1000).toLocaleString(language), duration: ((range.outMs - range.inMs) / 1000).toLocaleString(language) })}</span>}
      </div>
      {!rangeCheck.valid && <div className="warning">{t('export.invalidRange')}<details><summary>{t('common.details')}</summary>{rangeCheck.reason}</details></div>}

      {project.storyboard.length > 0 && <div className="renderJob">
        <div className="renderJobHead"><strong>{t('shortSelect.heading')}</strong><span>{t('shortSelect.limit', { seconds: (shortMaximumMs / 1000).toLocaleString(language) })}</span></div>
        <p className="cardBody">{t('shortSelect.help')}</p>
        <div className="formatChooser" role="group" aria-label={t('shortSelect.max')}>
          {[15, 30, 60, 90].map((seconds) => <button key={seconds} className={shortMaximumMs === seconds * 1000 ? 'formatOption active' : 'formatOption'} disabled={busy} onClick={() => applyShortMaximum(seconds * 1000)}>
            <strong>{t('shortSelect.seconds', { seconds })}</strong>
            <small>{t('shortSelect.replan')}</small>
          </button>)}
        </div>
        <div className="fieldGrid"><label>{t('shortSelect.custom')}<input type="number" min="1" max="600" step="0.001" value={shortMaximumSeconds} disabled={busy} onChange={(event) => setShortMaximumSeconds(event.target.value)} /></label></div>
        <div className="renderActions"><button disabled={busy || Boolean(customShortMaximumError) || customShortMaximumMs === shortMaximumMs} onClick={() => applyShortMaximum(customShortMaximumMs)}>{t('shortSelect.apply')}</button></div>
        {customShortMaximumError && <div className="warning">{t('shortSelect.invalid')}</div>}
        <p className="cardBody">{t('shortSelect.limitHelp')}</p>
        <div className="renderJobHead"><strong>{t('shortSelect.formats')}</strong><span>{t('shortSelect.selectedCount', { count: batchFormats.length })}</span></div>
        <p className="cardBody">{t('shortSelect.formatHelp')}</p>
        <div className="formatChooser" role="group" aria-label={t('shortSelect.formatGroup')}>
          {targetFormats.map((id) => <button key={id} className={batchFormats.includes(id) ? 'formatOption active' : 'formatOption'} aria-pressed={batchFormats.includes(id)} disabled={busy} onClick={() => setBatchFormats((current) => {
            const selected = new Set(current)
            if (selected.has(id)) selected.delete(id)
            else selected.add(id)
            return targetFormats.filter((candidate) => selected.has(candidate))
          })}>
            <strong>{t(`export.${id}`)}</strong>
            <small>{formatProfiles[id].aspect} · {formatProfiles[id].export.width}×{formatProfiles[id].export.height}</small>
          </button>)}
        </div>
        {!batchFormats.length && <div className="warning">{t('shortSelect.noFormats')}</div>}
        {archivedBatchSelectionReview && <div className="warning">{t('shortSelect.archiveReview', { candidates: batchSelectedIds.length, formats: batchFormats.length })}{archivedBatchSelectionReview.unavailable.length > 0 && <> {t('shortSelect.unavailable', { names: archivedBatchSelectionReview.unavailable.map((item) => item.title).join(', ') })}</>}</div>}
        {shortRecipeReview && <div className="warning">{t('shortSelect.recipeReview', { candidates: batchSelectedIds.length, formats: batchFormats.length, missing: shortRecipeReview.unavailableCandidateIds.length })}</div>}
        {shortExports.candidates.map((candidate) => <div className="renderMeta" key={candidate.id}>
          <span><strong>{candidate.titles.join(' + ')}</strong> · {(candidate.durationMs / 1000).toLocaleString(language)} s · {(candidate.inMs / 1000).toLocaleString(language)}–{(candidate.outMs / 1000).toLocaleString(language)} s</span>
          <div className="renderActions">
            <label className="checkRow"><input type="checkbox" checked={batchSelectedIds.includes(candidate.id)} disabled={busy} onChange={(event) => setBatchSelectedIds((ids) => event.target.checked ? [...ids, candidate.id] : ids.filter((id) => id !== candidate.id))} />{t('shortSelect.include')}</label>
            <button disabled={busy} onClick={() => { setInSeconds(String(candidate.inMs / 1000)); setOutSeconds(String(candidate.outMs / 1000)); setSelectedShortId(candidate.id); setLessonReview(null) }}>{t(selectedShort?.id === candidate.id ? 'shortSelect.selected' : 'shortSelect.use')}</button>
          </div>
        </div>)}
        {!shortExports.candidates.length && <div className="warning">{t('shortSelect.empty')}</div>}
        {shortExports.skipped.map((item) => <div className="warning" key={item.sceneId}><strong>{item.title}:</strong> {t(`shortSelect.skip.${item.code}`, { seconds: ((item.limitMs ?? shortMaximumMs) / 1000).toLocaleString(language) })}</div>)}
        {shortExports.candidates.length > 0 && <div className="renderActions">
          <button disabled={busy} onClick={() => setBatchSelectedIds(batchSelectedIds.length === shortExports.candidates.length ? [] : shortExports.candidates.map((candidate) => candidate.id))}>{t(batchSelectedIds.length === shortExports.candidates.length ? 'shortSelect.clear' : 'shortSelect.all')}</button>
          <button className="primary" disabled={!batchSelectedIds.length || !batchFormats.length || !readiness.ready || !duckingCheck.valid || !workerConnected || !workerToken.trim() || busy || submitting || batchReframingBlocked || Boolean(batchResumeError)} onClick={startShortBatch}>{t('shortSelect.export', { count: batchSelectedIds.length * batchFormats.length })}</button>
        </div>}
        <div className="renderJob">
          <div className="renderJobHead"><strong>{t('shortRecipe.heading')}</strong><span>{t('shortRecipe.count', { count: shortRecipes.length, limit: shortExportRecipeLimit })}</span></div>
          <p className="cardBody">{t('shortRecipe.help')}</p>
          <div className="renderActions"><input aria-label={t('shortRecipe.name')} value={shortRecipeName} maxLength={80} disabled={busy} placeholder={t('shortRecipe.name')} onChange={(event) => setShortRecipeName(event.target.value)} /><button disabled={busy || !shortRecipeName.trim() || !batchSelectedIds.length || !batchFormats.length} onClick={saveShortRecipe}>{t('shortRecipe.save')}</button></div>
          {shortRecipes.map((recipe) => <div className="renderMeta" key={recipe.id}><span><strong>{recipe.name}</strong> · {t('shortRecipe.candidates', { count: recipe.candidateIds.length })} · {recipe.formats.map((id) => t(`export.${id}`)).join(', ')}</span><div className="renderActions"><button className="secondaryButton" disabled={busy} onClick={() => reviewRecipe(recipe.id)}>{t('shortRecipe.review')}</button><button disabled={busy} onClick={() => { try { onProjectChange(forgetProjectShortExportRecipe(project, recipe.id)); if (shortRecipeReview?.recipeId === recipe.id) setShortRecipeReview(null) } catch (recipeError) { setError(recipeError instanceof Error ? recipeError.message : 'Could not forget the Short recipe') } }}>{t('shortRecipe.forget')}</button></div></div>)}
        </div>
      </div>}

      <label className="checkRow"><input type="checkbox" checked={duckingEnabled} disabled={busy} onChange={(event) => setDuckingEnabled(event.target.checked)} />{t('export.duck')}</label>
      {duckingEnabled && <div className="fieldGrid">
        <label>{t('export.reduction')}<input type="number" min="0" max="40" step="1" value={duckingReductionDb} disabled={busy} onChange={(event) => setDuckingReductionDb(event.target.value)} /></label>
        <label>{t('export.attack')}<input type="number" min="0" max="5000" step="10" value={duckingAttackMs} disabled={busy} onChange={(event) => setDuckingAttackMs(event.target.value)} /></label>
        <label>{t('export.release')}<input type="number" min="0" max="5000" step="10" value={duckingReleaseMs} disabled={busy} onChange={(event) => setDuckingReleaseMs(event.target.value)} /></label>
      </div>}
      {!duckingCheck.valid && <div className="warning">{t('export.invalidAudio')}<details><summary>{t('common.details')}</summary>{duckingCheck.reason}</details></div>}

      <label className="checkRow"><input type="checkbox" checked={normalizeLoudness} disabled={busy} onChange={(event) => setNormalizeLoudness(event.target.checked)} />{t('export.normalize')}</label>
      <p className="cardBody">{t('export.normalizeHelp')}</p>

      {selectedShort && <div className="renderJob">
        <div className="renderJobHead"><strong>Selected Short preview</strong><span>{formatProfiles[shortPreviewFormat].label} · {(selectedShort.durationMs / 1000).toFixed(1)} s</span></div>
        <p className="cardBody">Renders this exact scene range through the real composed-preview path, including layers, captions, transforms, retiming and the audio settings above. The temporary MP4 stays in <code>KINAOU/Cache/Previews</code>.</p>
        <p className="cardBody">Choose the adaptation you want to review. This changes only the Short preview and leaves the project's main format unchanged.</p>
        <div className="formatChooser" role="group" aria-label="Short preview format">
          {targetFormats.map((id) => <button key={id} className={id === shortPreviewFormat ? 'formatOption active' : 'formatOption'} aria-pressed={id === shortPreviewFormat} disabled={busy} onClick={() => setShortPreviewFormat(id)}>
            <strong>{t(`export.${id}`)}</strong>
            <small>{formatProfiles[id].aspect} · {formatProfiles[id].preview.width}×{formatProfiles[id].preview.height}</small>
          </button>)}
        </div>
        <div className="renderActions">
          <button className="secondaryButton" disabled={!readiness.ready || !duckingCheck.valid || !workerConnected || !workerToken.trim() || busy || shortPreviewReframingBlocked} onClick={startShortPreview}>{shortPreviewBusy ? `Rendering ${shortPreviewPercent}%` : shortPreviewUrl && shortPreviewCurrent ? 'Refresh Short preview' : 'Render Short preview'}</button>
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

      {!readiness.ready && <div className="warning">{readiness.code ? t(`preview.reason.${readiness.code}`, { track: readiness.track ?? '', speed: readiness.speed ?? 1 }) : readiness.reason}</div>}
      {!workerConnected && readiness.ready && <div className="warning">{t('preview.connect')}</div>}
      {error && <div className="errorBox" role="alert">{t('export.failed')}<details><summary>{t('common.details')}</summary>{error}</details></div>}

      {single && <SingleExportStatus feedback={single} onRetry={() => { void singleSession.current?.run() }} onCancel={() => { void singleSession.current?.cancel() }} onDetach={detachSingle} />}

      {batchItems.length > 0 && <div className="renderJob">
        <div className="renderJobHead"><strong>SHORT EXPORT BATCH · SAVED WITH PROJECT</strong><span>{batchItems.filter((item) => shortBatchTerminalStates.has(item.state)).length}/{batchItems.length} finished</span></div>
        <p className="cardBody">Exports run one at a time so local FFmpeg work stays bounded. Reloading keeps terminal receipts and resumes only unfinished entries whose exact timeline and render configuration still match. Once every attempt is terminal, starting another batch or clearing this one first archives a compact project-local summary.</p>
        {batchPersistenceMessage && <div className="note">{batchPersistenceMessage}</div>}
        {batchResumeError && <div className="errorBox">{batchResumeError}</div>}
        {batchItems.map((item) => <div className="renderJob" key={item.id}>
          <div className="renderJobHead"><strong>{item.title}</strong><span>{formatProfiles[item.format].label} · attempt {item.attempt ?? 1} · {item.state.toUpperCase()} · {Math.round(item.progress * 100)}%</span></div>
          <div className="progressTrack" aria-label={`${item.title} render progress ${Math.round(item.progress * 100)}%`}><div className="progressFill" style={{ width: `${Math.round(item.progress * 100)}%` }} /></div>
          <div className="renderMeta">
            <code>{item.renderedPath ?? item.outputPath}</code>
            {item.sizeBytes !== undefined && <span>{(item.sizeBytes / 1024 / 1024).toFixed(1)} MB</span>}
            {retryableBatchIds.has(item.id) && <label className="checkRow"><input type="checkbox" checked={retrySelectedIds.includes(item.id)} onChange={(event) => setRetrySelectedIds((ids) => event.target.checked ? [...ids, item.id] : ids.filter((id) => id !== item.id))} />Retry this variant</label>}
          </div>
          {item.error && <div className="errorBox">{item.error}</div>}
        </div>)}
        {retryableBatchItems.length > 0 && <>
          <p className="cardBody">Retry only the failed or cancelled variants you choose. KINAOU revalidates the current scene ranges and export settings, then creates new output names; successful files and earlier attempts are never overwritten.</p>
          <div className="renderActions">
            <button disabled={busy} onClick={() => setRetrySelectedIds(retrySelectedIds.length === retryableBatchItems.length ? [] : retryableBatchItems.map((item) => item.id))}>{retrySelectedIds.length === retryableBatchItems.length ? 'Clear retry selection' : 'Select all retryable'}</button>
            <button className="primary" disabled={!retrySelectedIds.length || !readiness.ready || !duckingCheck.valid || !workerConnected || !workerToken.trim() || busy || submitting || retryReframingBlocked || Boolean(batchResumeError)} onClick={startSelectedShortBatchRetries}>Retry selected variants ({retrySelectedIds.length})</button>
          </div>
          {retryReframingBlocked && <div className="warning">Restart the local worker before retrying the selected off-centre crop variants.</div>}
        </>}
        <div className="renderActions">{batchBusy && !batchResumeError && <button className="dangerButton" onClick={cancelShortBatch}>Cancel batch</button>}{!activeBatchItem && (!batchBusy || Boolean(batchResumeError)) && <button className="secondaryButton" onClick={discardShortBatch}>{!batchBusy && persistedBatch.current ? 'Archive and clear current batch' : 'Discard saved batch'}</button>}</div>
      </div>}
      {!batchItems.length && batchResumeError && <div className="renderJob"><div className="errorBox">{batchResumeError}</div><div className="renderActions"><button className="secondaryButton" onClick={discardShortBatch}>Discard malformed saved batch</button></div></div>}

      {batchArchive.length > 0 && <div className="renderJob">
        <div className="renderJobHead"><strong>PAST SHORT BATCHES · SAVED WITH PROJECT</strong><span>{batchArchive.length}/{shortBatchArchiveLimit} retained</span></div>
        <p className="cardBody">KINAOU keeps compact summaries for the latest completed batches before a new queue replaces them. Check one batch on demand to compare every recorded path with the connected managed drive; the check reads presence only and never hashes or changes media. Forgetting a summary never deletes or changes an MP4.</p>
        {archivedBatchAvailabilityError && <div className="errorBox">{archivedBatchAvailabilityError}</div>}
        {batchArchive.map((entry) => {
          const succeeded = entry.items.filter((item) => item.state === 'succeeded').length
          const failed = entry.items.filter((item) => item.state === 'failed').length
          const cancelled = entry.items.filter((item) => item.state === 'cancelled').length
          const fileCheck = archivedBatchFileCheck?.batchId === entry.batchId ? archivedBatchFileCheck : null
          return <details className="renderJob" key={entry.batchId}>
            <summary className="renderJobHead"><strong>{new Date(entry.completedAt).toLocaleString()}</strong><span>{entry.items.length} attempt{entry.items.length === 1 ? '' : 's'} · {succeeded} succeeded · {failed} failed · {cancelled} cancelled</span>{fileCheck && <span className={fileCheck.missing ? 'status missing' : 'status online'}>{fileCheck.available} PRESENT · {fileCheck.missing} MISSING</span>}</summary>
            <p className="cardBody">Prepared {new Date(entry.createdAt).toLocaleString()} · archived {new Date(entry.archivedAt).toLocaleString()}</p>
            {fileCheck && <p className="cardBody">Drive checked {new Date(fileCheck.checkedAt).toLocaleString()}.</p>}
            {entry.items.map((item) => {
              const fileAvailable = fileCheck?.byPath[item.outputPath]
              return <div className="renderMeta" key={item.id}>
                <span><strong>{item.title}</strong> · {formatProfiles[item.format].label} · attempt {item.attempt} · {item.state.toUpperCase()}</span>
                <code>{item.outputPath}</code>
                {item.sizeBytes !== undefined && <span>{(item.sizeBytes / 1024 / 1024).toFixed(1)} MB</span>}
                {fileAvailable !== undefined && <span className={fileAvailable ? 'status online' : 'status missing'}>{fileAvailable ? 'FILE PRESENT' : 'FILE MISSING'}</span>}
              </div>
            })}
            <div className="renderActions">
              <button className="secondaryButton" disabled={busy || Boolean(checkingArchivedBatchId)} onClick={() => reviewArchivedBatchSelection(entry.batchId)}>Review current selections</button>
              <button className="secondaryButton" disabled={!workerConnected || !workerToken.trim() || Boolean(checkingArchivedBatchId)} onClick={() => void checkArchivedBatchFiles(entry.batchId)}>{checkingArchivedBatchId === entry.batchId ? 'Checking recorded files…' : 'Check recorded files'}</button>
              <button disabled={busy || Boolean(checkingArchivedBatchId)} onClick={() => { try { onProjectChange(forgetProjectShortBatchArchiveEntry(project, entry.batchId)) } catch (archiveError) { setError(archiveError instanceof Error ? archiveError.message : 'Could not forget the Short batch summary') } }}>Forget summary (keep every file)</button>
            </div>
          </details>
        })}
      </div>}

      <ExportHistoryPanel project={project} workerUrl={workerUrl} workerToken={workerToken} workerConnected={workerConnected} busy={busy} onProjectChange={onProjectChange} />

      <div className="renderActions">
        <button className="primary" disabled={!readiness.ready || !rangeCheck.valid || lessonReviewStale || !duckingCheck.valid || !workerConnected || !workerToken.trim() || busy || submitting || singleReframingBlocked} onClick={startRender}>
          {t(submitting ? 'export.submitting' : batchBusy ? 'export.batchBusy' : job && terminalStates.has(job.state) ? 'export.again' : 'export.start')}
        </button>
      </div>
    </section>
  )
}
