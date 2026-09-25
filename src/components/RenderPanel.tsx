import { useEffect, useMemo, useRef, useState } from 'react'
import type { KinaouProject } from '../core/project'
import { createRenderPlan, formatProfiles, formatReframingRequiresWorker, projectFormatPreset, projectTargetFormat, setProjectTargetFormat, type RenderPlan, type TargetFormat } from '../core/render'
import { renderOutputPath, renderReadiness } from '../core/renderUi'
import { WorkerClient } from '../core/workerClient'
import { createRangeRenderPlan, validateRenderRange } from '../core/renderRange'
import { defaultAudioDucking, validateAudioDucking } from '../core/audioDucking'
import { defaultLoudnessNormalization } from '../core/audioLoudness'
import { planShortExportBatch, planShortExportRanges, projectShortExportMaximum, setProjectShortExportMaximum, shortExportMaximumError, shortExportVariant } from '../core/shortExportRanges'
import { archiveProjectShortBatch, requestPersistedShortBatchCancellation, clearProjectShortBatch, createPersistedShortBatch, nextShortBatchItem, planSelectiveShortBatchRetry, projectPersistedShortBatch, projectShortBatchArchive, rebuildPersistedShortBatchPlans, replacePersistedShortBatchItems, retryableShortBatchItems, reviewArchivedShortBatchSelection, shortBatchBusy, storeProjectShortBatch, type PersistedShortBatch, type PersistedShortBatchItem } from '../core/shortExportBatch'
import { forgetProjectShortExportRecipe, projectShortExportRecipes, reviewShortExportRecipe, saveProjectShortExportRecipe, shortExportRecipeLimit } from '../core/shortExportRecipes'
import { recordSuccessfulExport } from '../core/exportHistory'
import { courseLessonChoices, planCourseLessonExport } from '../core/course'
import { CourseLessonSelector } from './CourseLessonSelector'
import { reviewCourseExport, resolveCourseExportReview, type CourseExportReview } from '../core/courseExportReview'
import { SingleExportSession, type ExportFeedback } from '../core/singleExportSession'
import { useUiLanguage } from './UiLanguageProvider'
import { resolveUiMessage, uiMessageReference } from '../core/uiMessages'
import { SingleExportStatus } from './SingleExportStatus'
import { FormatFramingPanel } from './FormatFramingPanel'
import { ExportHistoryPanel } from './ExportHistoryPanel'
import { ShortPreviewPanel } from './ShortPreviewPanel'
import { ShortIntelligencePanel } from './ShortIntelligencePanel'
import { ShortBatchArchivePanel } from './ShortBatchArchivePanel'
import { ShortBatchStatus, ShortBatchReceiptRecovery } from './ShortBatchStatus'
import { persistShortBatchReceipts } from '../core/shortBatchReceipts'
import { ShortBatchJobMonitor } from '../core/shortBatchJobMonitor'
import { markShortBatchSubmission, ShortBatchSubmission } from '../core/shortBatchSubmission'
import { commitShortBatchChange, type ShortBatchNotice } from '../core/shortBatchCommit'

interface RenderPanelProps {
  project: KinaouProject
  workerUrl: string
  workerToken: string
  workerConnected: boolean
  workerCapabilities: string[]
  onProjectChange: (project: KinaouProject) => void
  onCreateDerivative?: (project: KinaouProject) => void
}

const terminalStates = new Set(['succeeded', 'failed', 'cancelled'])
const targetFormats = Object.keys(formatProfiles) as TargetFormat[]
interface ArchivedBatchSelectionReview { batchId: string; unavailable: Array<{ candidateId: string; title: string }> }
interface ShortRecipeReview { recipeId: string; unavailableCandidateIds: string[] }

export function RenderPanel({ project, workerUrl, workerToken, workerConnected, workerCapabilities, onProjectChange, onCreateDerivative }: RenderPanelProps) {
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
  const [batchReceiptError, setBatchReceiptError] = useState('')
  const timelineDurationMs = useMemo(() => project.tracks.flatMap((track) => track.muted ? [] : track.clips).reduce((end, clip) => Math.max(end, clip.startMs + clip.durationMs), 0), [project])
  const [inSeconds, setInSeconds] = useState('0')
  const [outSeconds, setOutSeconds] = useState(() => String(timelineDurationMs / 1000))
  const [duckingEnabled, setDuckingEnabled] = useState(defaultAudioDucking.enabled)
  const [duckingReductionDb, setDuckingReductionDb] = useState(String(defaultAudioDucking.reductionDb))
  const [duckingAttackMs, setDuckingAttackMs] = useState(String(defaultAudioDucking.attackMs))
  const [duckingReleaseMs, setDuckingReleaseMs] = useState(String(defaultAudioDucking.releaseMs))
  const [normalizeLoudness, setNormalizeLoudness] = useState(defaultLoudnessNormalization.enabled)
  const duckingSettings = { enabled: duckingEnabled, reductionDb: Number(duckingReductionDb), attackMs: Number(duckingAttackMs), releaseMs: Number(duckingReleaseMs) }
  const duckingCheck = (() => { try { validateAudioDucking(duckingSettings); return { valid: true, reason: '' } } catch (value) { return { valid: false, reason: value instanceof Error ? value.message : uiMessageReference('recovery.duckingSettings') } } })()
  const range = { inMs: Math.round(Number(inSeconds) * 1000), outMs: Math.round(Number(outSeconds) * 1000) }
  const rangeCheck = Number.isFinite(range.inMs) && Number.isFinite(range.outMs) ? validateRenderRange(range, timelineDurationMs) : { valid: false, reason: uiMessageReference('recovery.rangeNumbers') }
  const shortMaximumMs = projectShortExportMaximum(project)
  const [shortMaximumSeconds, setShortMaximumSeconds] = useState(() => String(shortMaximumMs / 1000))
  const customShortMaximumMs = Math.round(Number(shortMaximumSeconds) * 1000)
  const customShortMaximumError = Number.isFinite(customShortMaximumMs) ? shortExportMaximumError(customShortMaximumMs) : uiMessageReference('recovery.shortMaximumNumber')
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
  const [batchItemsBatchId, setBatchItemsBatchId] = useState('')
  const batchPlans = useRef(new Map<string, RenderPlan>())
  const persistedBatch = useRef<PersistedShortBatch | null>(null)
  const batchMonitor = useRef<ShortBatchJobMonitor | null>(null)
  const [batchCancelling, setBatchCancelling] = useState(false)
  const batchSubmitting = useRef(false)
  const batchSubmittingId = useRef<string | undefined>(undefined)
  const batchSubmission = useRef<ShortBatchSubmission | null>(null)
  const batchCancelRequested = useRef(false)
  const [batchResumeError, setBatchResumeError] = useState('')
  const [batchPersistenceMessage, setBatchPersistenceMessage] = useState<ShortBatchNotice | null>(null)
  const [retrySelectedIds, setRetrySelectedIds] = useState<string[]>([])
  const batchArchive = projectShortBatchArchive(project)
  const [archivedBatchSelectionReview, setArchivedBatchSelectionReview] = useState<ArchivedBatchSelectionReview | null>(null)
  const projectBatchId = projectPersistedShortBatch(project)?.id ?? (Object.prototype.hasOwnProperty.call(project.metadata, 'shortExportBatch') ? 'invalid' : '')
  const submissionScope = useMemo(() => ({}), [project.id, projectBatchId, workerUrl, workerToken, workerConnected])
  const currentSubmissionScope = useRef(submissionScope)
  currentSubmissionScope.current = submissionScope
  const selectedShort = shortExports.candidates.find((candidate) => candidate.id === selectedShortId && candidate.inMs === range.inMs && candidate.outMs === range.outMs)
  const [shortPreviewFormat, setShortPreviewFormat] = useState<TargetFormat>(format)
  const [shortPreviewBusy, setShortPreviewBusy] = useState(false)
  const singleBusy = Boolean(single && !['succeeded', 'failed', 'cancelled', 'detached'].includes(single.phase))
  const batchBusy = shortBatchBusy(batchItems)
  const busy = singleBusy || batchBusy || shortPreviewBusy || Boolean(batchReceiptError)
  const workerSupportsFormatReframing = workerCapabilities.includes('format-reframing')
  const singleReframingBlocked = formatReframingRequiresWorker(project, format) && !workerSupportsFormatReframing
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

  useEffect(() => {
    batchSubmission.current?.detach()
    batchSubmission.current = null
    batchSubmitting.current = false
    batchSubmittingId.current = undefined
    if (projectPersistedShortBatch(latest.current.project)?.items.some(item => item.submissionStartedAt)) {
      setBatchResumeError(uiMessageReference('recovery.shortUnconfirmed'))
    }
    return () => { batchSubmission.current?.detach() }
  }, [submissionScope])

  useEffect(() => {
    setBatchReceiptError('')
    batchSubmitting.current = false
    batchSubmittingId.current = undefined
    batchCancelRequested.current = false
    batchPlans.current = new Map()
    setRetrySelectedIds([])
    setBatchResumeError('')
    const stored = projectPersistedShortBatch(project)
    if (!stored) {
      persistedBatch.current = null
      setBatchItemsBatchId('')
      setBatchItems([])
      setBatchPersistenceMessage(null)
      if (Object.prototype.hasOwnProperty.call(project.metadata, 'shortExportBatch')) setBatchResumeError(uiMessageReference('recovery.shortMalformed'))
      return
    }
    persistedBatch.current = stored
    setBatchItemsBatchId(stored.id)
    batchCancelRequested.current = stored.cancelRequested === true
    setBatchItems(stored.items)
    setDuckingEnabled(stored.audioDucking.enabled)
    setDuckingReductionDb(String(stored.audioDucking.reductionDb))
    setDuckingAttackMs(String(stored.audioDucking.attackMs))
    setDuckingReleaseMs(String(stored.audioDucking.releaseMs))
    setNormalizeLoudness(stored.loudnessNormalization.enabled)
    setBatchPersistenceMessage({ kind: 'restored', date: stored.updatedAt })
    try {
      batchPlans.current = rebuildPersistedShortBatchPlans(project, stored)
    } catch (resumeError) {
      setBatchResumeError(resumeError instanceof Error ? resumeError.message : uiMessageReference('recovery.shortResume'))
    }
  }, [project.id, projectBatchId])

  useEffect(() => {
    const current = persistedBatch.current
    if (!current || !batchItems.length || batchItemsBatchId !== projectBatchId) return
    const stored = projectPersistedShortBatch(project)
    if (stored?.id === current.id && JSON.stringify(stored.items) === JSON.stringify(batchItems)) return
    try {
      const updated = replacePersistedShortBatchItems(current, batchItems)
      const nextProject = storeProjectShortBatch(project, updated)
      if (nextProject !== project) onProjectChange(nextProject)
      persistedBatch.current = updated
    } catch (persistenceError) {
      setBatchResumeError(persistenceError instanceof Error ? persistenceError.message : uiMessageReference('recovery.shortPersist'))
    }
  }, [batchItems, batchItemsBatchId, projectBatchId, onProjectChange, project])

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
    setBatchCancelling(false)
    if (batchItemsBatchId !== projectBatchId || !activeBatchItem?.jobId || !workerConnected || !workerToken.trim()) return
    const monitor = new ShortBatchJobMonitor(activeBatchItem, {
      client: new WorkerClient({ baseUrl: workerUrl, token: workerToken }),
      publish: accepted => setBatchItems(items => items.map(item => item.id === accepted.id ? accepted : item)),
      notice: setBatchPersistenceMessage,
      error: setError,
      onCancelling: setBatchCancelling
    })
    batchMonitor.current = monitor
    if (persistedBatch.current?.cancelRequested) void monitor.cancel()
    else void monitor.run()
    return () => {
      monitor.detach()
      if (batchMonitor.current === monitor) batchMonitor.current = null
    }
  }, [project.id, projectBatchId, batchItemsBatchId, activeBatchItem?.id, activeBatchItem?.jobId, workerConnected, workerToken, workerUrl])

  useEffect(() => {
    if (batchItemsBatchId !== projectBatchId || batchCancelRequested.current || batchSubmitting.current || activeBatchItem || batchResumeError || !workerConnected || !workerToken.trim()) return
    const nextItem = nextShortBatchItem(batchItems)
    if (!nextItem) return
    const current = persistedBatch.current
    const saved = projectPersistedShortBatch(latest.current.project)
    if (!current || current.id !== projectBatchId || saved?.id !== current.id || !saved.items.some(item => item.id === nextItem.id && item.outputPath === nextItem.outputPath)) return
    let plan: RenderPlan | undefined
    try {
      // Revalidate the actual current edit before every POST, not just on reload.
      plan = rebuildPersistedShortBatchPlans(latest.current.project, { ...current, items: batchItems }).get(nextItem.id)
      if (!plan) throw new Error('The prepared render plan is missing.')
    } catch (cause) {
      setBatchResumeError(cause instanceof Error ? cause.message : String(cause))
      return
    }
    batchSubmitting.current = true
    batchSubmittingId.current = nextItem.id
    const session = new ShortBatchSubmission({
      plan,
      client: new WorkerClient({ baseUrl: workerUrl, token: workerToken }),
      isCurrent: () => currentSubmissionScope.current === submissionScope,
      saveIntent: () => {
        const target = latest.current
        const marked = markShortBatchSubmission({ ...current, items: batchItems }, nextItem.id)
        const nextProject = storeProjectShortBatch(target.project, marked)
        commitShortBatchChange(nextProject, target.onProjectChange, () => {
          latest.current = { ...target, project: nextProject }
          persistedBatch.current = marked
          setBatchItems(marked.items)
        })
        return marked.items.find(item => item.id === nextItem.id)!
      },
      accepted: accepted => {
        // The accepted-job monitor handles saved cancellation on this exact job.
        setBatchItems(items => items.map(item => item.id === accepted.id ? accepted : item))
      },
      error: setBatchResumeError,
      finished: () => { batchSubmitting.current = false; batchSubmittingId.current = undefined }
    })
    batchSubmission.current = session
    void session.run()
  }, [activeBatchItem, batchItems, batchItemsBatchId, batchResumeError, projectBatchId, submissionScope, workerConnected, workerToken, workerUrl])


  function saveBatchReceipts() {
    const current = persistedBatch.current
    if (!current || !batchItems.length || batchItemsBatchId !== projectBatchId) return
    try {
      const target = latest.current
      persistShortBatchReceipts(target.project, current.id, batchItems, target.onProjectChange)
      setBatchReceiptError('')
    } catch (cause) { setBatchReceiptError(cause instanceof Error ? cause.message : uiMessageReference('recovery.shortReceipt')) }
  }
  useEffect(() => {
    saveBatchReceipts()
  }, [batchItems, batchItemsBatchId, projectBatchId, onProjectChange, project])

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
      setShortRecipeReview(null)
    } catch (reviewError) {
      setArchivedBatchSelectionReview(null)
      setError(reviewError instanceof Error ? reviewError.message : uiMessageReference('recovery.shortArchiveReview'))
    }
  }

  function applyShortMaximum(value: number) {
    if (busy) return
    setError('')
    try { onProjectChange(setProjectShortExportMaximum(project, value)) }
    catch (cause) { setError(cause instanceof Error ? cause.message : uiMessageReference('recovery.shortMaximumSave')) }
  }

  function saveShortRecipe() {
    if (busy) return
    setError('')
    try {
      onProjectChange(saveProjectShortExportRecipe(project, { name: shortRecipeName, candidateIds: batchSelectedIds, formats: batchFormats }, shortExports.candidates))
      setShortRecipeName('')
    } catch (recipeError) {
      setError(recipeError instanceof Error ? recipeError.message : uiMessageReference('recovery.shortRecipeSave'))
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
      commitShortBatchChange(nextProject, onProjectChange, () => {
        batchPlans.current = plans
        batchCancelRequested.current = false
        persistedBatch.current = durable
        setBatchItemsBatchId(durable.id)
        setBatchItems(durable.items)
        setRetrySelectedIds([])
        setArchivedBatchSelectionReview(null)
        setBatchResumeError('')
        setBatchPersistenceMessage({ kind: 'saved' })
      })
    } catch (batchError) {
      setError(batchError instanceof Error ? batchError.message : uiMessageReference('recovery.shortPrepare'))
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
      commitShortBatchChange(storeProjectShortBatch(project, result.batch), onProjectChange, () => {
        batchPlans.current = result.plans
        batchCancelRequested.current = false
        persistedBatch.current = result.batch
        setBatchItems(result.batch.items)
        setRetrySelectedIds([])
        setBatchResumeError('')
        setBatchPersistenceMessage({ kind: 'retrySaved', count: result.plans.size })
      })
    } catch (batchError) {
      setError(batchError instanceof Error ? batchError.message : uiMessageReference('recovery.shortRetry'))
    }
  }

  async function cancelShortBatch() {
    if (!batchBusy) return
    const current = persistedBatch.current
    if (!current) return
    try {
      const cancelled = requestPersistedShortBatchCancellation({ ...current, items: batchItems }, batchSubmittingId.current)
      const target = latest.current
      const nextProject = storeProjectShortBatch(target.project, cancelled)
      commitShortBatchChange(nextProject, target.onProjectChange, () => {
        latest.current = { ...target, project: nextProject }
        persistedBatch.current = cancelled
        batchCancelRequested.current = true
        setBatchItems(cancelled.items)
      })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : uiMessageReference('recovery.shortCancelSave'))
      return
    }
    if (!activeBatchItem?.jobId) return
    if (!batchMonitor.current) {
      setError(uiMessageReference('recovery.shortCancelOriginalWorker'))
      return
    }
    await batchMonitor.current.cancel()
  }

  function discardShortBatch() {
    if (activeBatchItem || batchSubmitting.current || batchReceiptError) return
    setError('')
    try {
      const current = persistedBatch.current
      const now = new Date()
      const archivedProject = current && batchItems.length && !shortBatchBusy(batchItems) ? archiveProjectShortBatch(project, { ...current, items: batchItems }, now) : project
      commitShortBatchChange(clearProjectShortBatch(archivedProject, now), onProjectChange, () => {
        batchPlans.current = new Map()
        persistedBatch.current = null
        batchCancelRequested.current = false
        setBatchItems([])
        setRetrySelectedIds([])
        setBatchResumeError('')
        setBatchPersistenceMessage(null)
      })
    } catch (cause) { setError(cause instanceof Error ? cause.message : uiMessageReference('recovery.shortBatchChange')) }
  }

  const visibleError = resolveUiMessage(language, error)
  const visibleBatchResumeError = resolveUiMessage(language, batchResumeError)
  const visibleBatchReceiptError = resolveUiMessage(language, batchReceiptError)

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
      {!rangeCheck.valid && <div className="warning">{t('export.invalidRange')}<details><summary>{t('common.details')}</summary>{resolveUiMessage(language, rangeCheck.reason ?? '')}</details></div>}

      <ShortIntelligencePanel
        project={project}
        maximumDurationMs={shortMaximumMs}
        workerUrl={workerUrl}
        workerToken={workerToken}
        workerConnected={workerConnected}
        workerCapabilities={workerCapabilities}
        disabled={busy || submitting}
        onCreateDerivative={onCreateDerivative}
      />

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
          {shortRecipes.map((recipe) => <div className="renderMeta" key={recipe.id}><span><strong>{recipe.name}</strong> · {t('shortRecipe.candidates', { count: recipe.candidateIds.length })} · {recipe.formats.map((id) => t(`export.${id}`)).join(', ')}</span><div className="renderActions"><button className="secondaryButton" disabled={busy} onClick={() => reviewRecipe(recipe.id)}>{t('shortRecipe.review')}</button><button disabled={busy} onClick={() => { try { onProjectChange(forgetProjectShortExportRecipe(project, recipe.id)); if (shortRecipeReview?.recipeId === recipe.id) setShortRecipeReview(null) } catch (recipeError) { setError(recipeError instanceof Error ? recipeError.message : uiMessageReference('recovery.shortRecipeForget')) } }}>{t('shortRecipe.forget')}</button></div></div>)}
        </div>
      </div>}

      <label className="checkRow"><input type="checkbox" checked={duckingEnabled} disabled={busy} onChange={(event) => setDuckingEnabled(event.target.checked)} />{t('export.duck')}</label>
      {duckingEnabled && <div className="fieldGrid">
        <label>{t('export.reduction')}<input type="number" min="0" max="40" step="1" value={duckingReductionDb} disabled={busy} onChange={(event) => setDuckingReductionDb(event.target.value)} /></label>
        <label>{t('export.attack')}<input type="number" min="0" max="5000" step="10" value={duckingAttackMs} disabled={busy} onChange={(event) => setDuckingAttackMs(event.target.value)} /></label>
        <label>{t('export.release')}<input type="number" min="0" max="5000" step="10" value={duckingReleaseMs} disabled={busy} onChange={(event) => setDuckingReleaseMs(event.target.value)} /></label>
      </div>}
      {!duckingCheck.valid && <div className="warning">{t('export.invalidAudio')}<details><summary>{t('common.details')}</summary>{resolveUiMessage(language, duckingCheck.reason)}</details></div>}

      <label className="checkRow"><input type="checkbox" checked={normalizeLoudness} disabled={busy} onChange={(event) => setNormalizeLoudness(event.target.checked)} />{t('export.normalize')}</label>
      <p className="cardBody">{t('export.normalizeHelp')}</p>

      {selectedShort && <ShortPreviewPanel project={project} candidate={selectedShort} format={shortPreviewFormat} onFormatChange={setShortPreviewFormat} onBusyChange={setShortPreviewBusy} audioDucking={duckingSettings} normalizeLoudness={normalizeLoudness} workerUrl={workerUrl} workerToken={workerToken} workerConnected={workerConnected} workerCapabilities={workerCapabilities} disabled={!readiness.ready || !duckingCheck.valid || singleBusy || batchBusy} />}

      {!readiness.ready && <div className="warning">{readiness.code ? t(`preview.reason.${readiness.code}`, { track: readiness.track ?? '', speed: readiness.speed ?? 1 }) : readiness.reason}</div>}
      {!workerConnected && readiness.ready && <div className="warning">{t('preview.connect')}</div>}
      {error && <div className="errorBox" role="alert">{t('export.failed')}<details><summary>{t('common.details')}</summary>{visibleError}</details></div>}

      {single && <SingleExportStatus feedback={single} onRetry={() => { void singleSession.current?.run() }} onCancel={() => { void singleSession.current?.cancel() }} onDetach={detachSingle} />}

      <ShortBatchStatus items={batchItems} notice={batchPersistenceMessage} resumeError={visibleBatchResumeError} retryableIds={retryableBatchIds} retrySelectedIds={retrySelectedIds} setRetrySelectedIds={setRetrySelectedIds} busy={busy} retryDisabled={!retrySelectedIds.length || !readiness.ready || !duckingCheck.valid || !workerConnected || !workerToken.trim() || busy || submitting || retryReframingBlocked || Boolean(batchResumeError)} retryReframingBlocked={retryReframingBlocked} cancelRequested={persistedBatch.current?.cancelRequested} cancelling={batchCancelling} canCancel={batchBusy && !batchResumeError} canDiscard={!batchReceiptError && !batchSubmitting.current && !activeBatchItem && (!batchBusy || Boolean(batchResumeError))} archiveOnDiscard={!batchBusy && Boolean(persistedBatch.current)} onRetry={startSelectedShortBatchRetries} onCancel={() => { void cancelShortBatch() }} onDiscard={discardShortBatch} />

      {batchReceiptError && <ShortBatchReceiptRecovery detail={visibleBatchReceiptError} onRetry={saveBatchReceipts} />}

      <ShortBatchArchivePanel project={project} workerUrl={workerUrl} workerToken={workerToken} workerConnected={workerConnected} busy={busy} onProjectChange={onProjectChange} onReview={reviewArchivedBatchSelection} />

      <ExportHistoryPanel project={project} workerUrl={workerUrl} workerToken={workerToken} workerConnected={workerConnected} busy={busy} onProjectChange={onProjectChange} />

      <div className="renderActions">
        <button className="primary" disabled={!readiness.ready || !rangeCheck.valid || lessonReviewStale || !duckingCheck.valid || !workerConnected || !workerToken.trim() || busy || submitting || singleReframingBlocked} onClick={startRender}>
          {t(submitting ? 'export.submitting' : batchBusy ? 'export.batchBusy' : job && terminalStates.has(job.state) ? 'export.again' : 'export.start')}
        </button>
      </div>
    </section>
  )
}
