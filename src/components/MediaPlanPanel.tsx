import { useEffect, useRef, useState } from 'react'
import { registerCapturedMedia } from '../core/capturedMedia'
import { registerGeneratedImage } from '../core/generatedImages'
import { registerWebCapture } from '../core/webCaptures'
import { parseMediaAcquisitionPlan, type MediaAcquisitionItem, type MediaAcquisitionPlan } from '../core/mediaAcquisition'
import { type KinaouProject } from '../core/project'
import type { PersistentVersionHistory } from '../core/versioning'
import { WorkerClient } from '../core/workerClient'

import { MediaPlanDetachedError, MediaPlanSession, pollMediaPlanJob, runMediaPlanItems, type MediaPlanItemRun } from '../core/mediaPlanSession'
import { useUiLanguage } from './UiLanguageProvider'

interface Props { project: KinaouProject; history: PersistentVersionHistory; workerUrl: string; workerToken: string; workerConnected: boolean; workerCapabilities: string[]; onProjectChange: (project: KinaouProject) => void }
interface DraftItem { kind: 'web-capture' | 'app-capture' | 'generate-image'; sceneId: string; rationale: string; url?: string; appName?: string; positivePrompt?: string; negativePrompt?: string }

function randomSeed(): number { return Math.floor(Math.random() * 2 ** 31) }

function planErrorMessage(cause: unknown): string {
  const issues = (cause as { issues?: Array<{ path: Array<string | number>; message: string }> })?.issues
  if (Array.isArray(issues) && issues.length) {
    const issue = issues[0]
    const itemIndex = typeof issue.path[1] === 'number' ? ` (item ${issue.path[1] + 1})` : ''
    return `${issue.message}${itemIndex}`
  }
  return cause instanceof Error ? cause.message : 'Invalid media plan'
}

export function MediaPlanPanel({ project, history, workerUrl, workerToken, workerConnected, workerCapabilities, onProjectChange }: Props) {
  const { t } = useUiLanguage()
  const [models, setModels] = useState<Array<{ id: string }>>([])
  const [model, setModel] = useState('')
  const [plan, setPlan] = useState<MediaAcquisitionPlan | null>(null)
  const [draft, setDraft] = useState<DraftItem[] | null>(null)
  const [runs, setRuns] = useState<Record<number, MediaPlanItemRun>>({})
  const [pending, setPending] = useState(false)
  const [detached, setDetached] = useState(false)
  const mounted = useRef(true)
  const taskRef = useRef<MediaPlanSession | null>(null)
  const connection = JSON.stringify([workerUrl, workerToken, workerConnected, [...workerCapabilities].sort()])
  const connectionRef = useRef(connection)
  connectionRef.current = connection
  const modelsConnection = useRef('')
  const [finished, setFinished] = useState(false)
  const [noModels, setNoModels] = useState(false)
  const [error, setError] = useState('')
  const projectRef = useRef(project)
  projectRef.current = project
  taskRef.current?.observe(project, connection)
  const busy = pending && Boolean(taskRef.current?.active)
  const wasDetached = detached || Boolean(taskRef.current?.wasDetached)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; taskRef.current?.detach() } }, [])
  useEffect(() => { setPlan(null); setDraft(null); setRuns({}); setFinished(false); setError(''); setDetached(false) }, [project.id])
  function begin() {
    if (!mounted.current || taskRef.current?.active) return null
    const task = new MediaPlanSession(projectRef.current, connectionRef.current, () => ({ project: projectRef.current, connection: connectionRef.current }))
    taskRef.current = task; setPending(true); setDetached(false); setError(''); setNoModels(false)
    return task
  }
  function fail(task: MediaPlanSession, cause: unknown) {
    if (!mounted.current || taskRef.current !== task) return
    if (cause instanceof MediaPlanDetachedError || task.wasDetached) setDetached(true)
    else setError(planErrorMessage(cause))
  }
  function finish(task: MediaPlanSession) {
    task.finish()
    if (mounted.current && taskRef.current === task) setPending(false)
  }
  const client = () => new WorkerClient({ baseUrl: workerUrl, token: workerToken })

  async function detectModels() {
    if (!available) return
    const task = begin()
    if (!task) return
    try {
      const next = await client().listLocalModels()
      task.assertCurrent()
      setModels(next); modelsConnection.current = connection
      setModel(next[0]?.id ?? '')
      setNoModels(!next.length)
    } catch (cause) { fail(task, cause) }
    finally { finish(task) }
  }

  async function acquire(item: MediaAcquisitionItem, current: KinaouProject, task: MediaPlanSession): Promise<{ project: KinaouProject; uri: string }> {
    task.assertCurrent()
    const worker = client()
    const pollUntilTerminal = <T extends { id: string; state: string }>(job: T, status: (id: string) => Promise<T>) => pollMediaPlanJob(job, status, task.assertCurrent)
    if (item.kind === 'web-capture') {
      const browsers = await worker.listWebCaptureBrowsers()
      task.assertCurrent()
      if (!browsers.length) throw new Error('No local browser is available for web capture')
      const job = await pollUntilTerminal(await worker.startWebCapture({ browserId: browsers[0].id, url: item.url }), (id) => worker.webCaptureStatus(id))
      if (job.state !== 'succeeded' || !job.imagePath) throw new Error(job.error ?? `Web capture ${job.state}`)
      return { project: registerWebCapture(current, job), uri: job.imagePath }
    }
    if (item.kind === 'app-capture') {
      const job = await pollUntilTerminal(await worker.startCapture({ kind: 'screenshot', appName: item.appName }), (id) => worker.captureStatus(id))
      if (job.state !== 'succeeded' || !job.capturePath) throw new Error(job.error ?? `App capture ${job.state}`)
      return { project: registerCapturedMedia(current, job), uri: job.capturePath }
    }
    const availability = await worker.imageGenerationAvailability()
    task.assertCurrent()
    const template = availability.templates[0]
    if (!availability.comfyui.available || !template) throw new Error('Local image generation is not available (running ComfyUI plus a managed template required)')
    if (item.negativePrompt?.trim() && !template.supportsNegativePrompt) throw new Error('Selected image template does not support a negative prompt; nothing submitted')
    const job = await pollUntilTerminal(await worker.startImageJob({
      templatePath: template.path,
      positivePrompt: item.positivePrompt,
      ...(item.negativePrompt && template.supportsNegativePrompt ? { negativePrompt: item.negativePrompt } : {}),
      seed: randomSeed(),
      ...(template.supportsWidth ? { width: 1024 } : {}),
      ...(template.supportsHeight ? { height: 1024 } : {})
    }), (id) => worker.imageJobStatus(id))
    if (job.state !== 'succeeded' || !job.imagePath) throw new Error(job.error ?? `Image generation ${job.state}`)
    return { project: registerGeneratedImage(current, job), uri: job.imagePath }
  }

  async function generatePlan(task: MediaPlanSession): Promise<MediaAcquisitionPlan> {
    const context = { title: project.title, scenes: project.storyboard.map((scene) => ({ id: scene.id, title: scene.title, description: scene.description })) }
    task.assertCurrent()
    const raw = await client().generateMediaAcquisitionPlan(model, context)
    task.assertCurrent()
    return parseMediaAcquisitionPlan(raw, projectRef.current)
  }

  async function runItems(task: MediaPlanSession, validated: MediaAcquisitionPlan, mode: 'auto' | 'reviewed' = 'auto') {
    await runMediaPlanItems({
      session: task, plan: validated, mode, project: projectRef.current,
      snapshot: value => { history.snapshot(value, 'Before media acquisition run', 'system') },
      persist: value => { onProjectChange(value); projectRef.current = value },
      acquire: (item, value) => acquire(item, value, task),
      onItem: (index, run) => {
        if (mounted.current && taskRef.current === task && !task.wasDetached) setRuns(previous => ({ ...previous, [index]: run }))
      }
    })
    task.assertCurrent()
    setFinished(true)
  }

  async function startPlan(mode: 'auto' | 'reviewed') {
    if (!available || !installedModel || !project.storyboard.length) return
    const task = begin()
    if (!task) return
    setPlan(null); setDraft(null); setRuns({}); setFinished(false)
    try {
      const validated = await generatePlan(task)
      task.assertCurrent()
      setPlan(validated)
      if (mode === 'auto') await runItems(task, validated)
      else setDraft(validated.items.map(item => ({ ...item })))
    } catch (cause) { fail(task, cause) }
    finally { finish(task) }
  }

  function updateDraft(index: number, changes: Partial<DraftItem>) {
    setDraft((previous) => previous ? previous.map((item, current) => current === index ? { ...item, ...changes } : item) : previous)
  }

  function switchKind(index: number, kind: DraftItem['kind']) {
    setDraft((previous) => previous ? previous.map((item, current) => {
      if (current !== index || item.kind === kind) return item
      const base = { sceneId: item.sceneId, rationale: item.rationale, kind }
      if (kind === 'web-capture') return { ...base, url: 'https://' }
      if (kind === 'app-capture') return { ...base, appName: '' }
      return { ...base, positivePrompt: '' }
    }) : previous)
  }

  function addDraftItem() {
    const emptyScene = project.storyboard.find((scene) => !scene.assetId) ?? project.storyboard[0]
    if (!emptyScene) return
    setDraft((previous) => [...(previous ?? []), { kind: 'web-capture', sceneId: emptyScene.id, url: 'https://', rationale: t('mediaPlan.added') }])
  }

  async function validateAndRun() {
    if (!draft || !plan || !workerConnected || !workerToken.trim()) return
    const task = begin()
    if (!task) return
    setRuns({}); setFinished(false)
    try {
      const validated = parseMediaAcquisitionPlan({ schemaVersion: 1, items: draft, provenance: plan.provenance }, projectRef.current)
      setPlan(validated)
      await runItems(task, validated, 'reviewed')
      task.assertCurrent()
      setDraft(null)
    } catch (cause) { fail(task, cause) }
    finally { finish(task) }
  }

  const available = workerConnected && Boolean(workerToken.trim()) && workerCapabilities.includes('local-llm')
  const installedModel = modelsConnection.current === connection && models.some(entry => entry.id === model)
  const hasScenes = project.storyboard.length > 0
  const reviewing = draft !== null

  return <div className="card imageStudio">
    <div><h3>{t('mediaPlan.heading')}</h3><p className="cardBody">{t('mediaPlan.help')}</p></div>
    <p>{t('mediaPlan.scope')}</p>
    {busy && <button className="secondaryButton" onClick={() => { taskRef.current?.detach(); setPending(false); setDetached(true) }}>{t('mediaPlan.detach')}</button>}
    {wasDetached && <div className="warning" role="status">{t('mediaPlan.detached')}</div>}
    {!hasScenes && <p className="cardBody">{t('mediaPlan.scenesRequired')}</p>}
    <div className="directorActions">
      <button className="secondaryButton" disabled={!available || busy} onClick={detectModels}>{t('editor.detect')}</button>
      <select aria-label={t('editor.model')} disabled={busy} value={installedModel ? model : ''} onChange={(event) => setModel(event.target.value)}><option value="">{t('editor.chooseModel')}</option>{(modelsConnection.current === connection ? models : []).map((entry) => <option key={entry.id} value={entry.id}>{entry.id}</option>)}</select>
      <button className="primary" disabled={!available || !installedModel || !hasScenes || busy} onClick={() => void startPlan('auto')}>{t(busy && !reviewing ? 'mediaPlan.busy' : 'mediaPlan.auto')}</button>
      <button className="secondaryButton" disabled={!available || !installedModel || !hasScenes || busy} onClick={() => void startPlan('reviewed')}>{t('mediaPlan.propose')}</button>
    </div>
    {reviewing && draft && <div className="mediaPlanItems">
      {draft.map((item, index) => <div key={index} className="mediaPlanItem">
        <div className="formRow">
          <label>{t('mediaPlan.scene')}<select value={item.sceneId} disabled={busy} onChange={(event) => updateDraft(index, { sceneId: event.target.value })}>{project.storyboard.map((scene) => <option key={scene.id} value={scene.id}>{scene.title}</option>)}</select></label>
          <label>{t('mediaPlan.action')}<select value={item.kind} disabled={busy} onChange={(event) => switchKind(index, event.target.value as DraftItem['kind'])}><option value="web-capture">{t('mediaPlan.web-capture')}</option><option value="app-capture">{t('mediaPlan.app-capture')}</option><option value="generate-image">{t('mediaPlan.generate-image')}</option></select></label>
          <button className="dangerButton" disabled={busy} onClick={() => setDraft((previous) => previous ? previous.filter((_item, current) => current !== index) : previous)}>{t('mediaPlan.remove')}</button>
        </div>
        {item.kind === 'web-capture' && <label>{t('mediaPlan.url')}<input value={item.url ?? ''} disabled={busy} onChange={(event) => updateDraft(index, { url: event.target.value })} /></label>}
        {item.kind === 'app-capture' && <label>{t('mediaPlan.app')}<input value={item.appName ?? ''} disabled={busy} onChange={(event) => updateDraft(index, { appName: event.target.value })} /></label>}
        {item.kind === 'generate-image' && <label>{t('mediaPlan.prompt')}<textarea value={item.positivePrompt ?? ''} disabled={busy} onChange={(event) => updateDraft(index, { positivePrompt: event.target.value })} /></label>}
        {item.kind === 'generate-image' && <label>{t('mediaPlan.negative')}<textarea value={item.negativePrompt ?? ''} disabled={busy} onChange={event => updateDraft(index, { negativePrompt: event.target.value })} /></label>}
        <small>{item.rationale}</small>
      </div>)}
      <div className="directorActions">
        <button className="secondaryButton" disabled={busy} onClick={addDraftItem}>{t('mediaPlan.add')}</button>
        <button className="primary" disabled={busy || !workerConnected || !workerToken.trim() || !draft.length} onClick={validateAndRun}>{t(busy ? 'mediaPlan.busy' : 'mediaPlan.run')}</button>
      </div>
    </div>}
    {!reviewing && plan && <div className="mediaPlanItems">
      {plan.items.map((item, index) => {
        const scene = project.storyboard.find((candidate) => candidate.id === item.sceneId)
        const run = runs[index]
        return <div key={index} className="mediaPlanItem">
          <strong>{scene?.title ?? item.sceneId}</strong>
          <span>{t(`mediaPlan.${item.kind}`)} · {item.kind === 'web-capture' ? item.url : item.kind === 'app-capture' ? item.appName : item.positivePrompt}</span>
          <small>{item.rationale}</small>
          {run && <small className={run.status === 'failed' ? 'errorText' : ''}>{t(run.status === 'failed' ? 'mediaPlan.failedStep' : `mediaPlan.${run.status}`)}{run.outcome && <> · {t(`mediaPlan.${run.outcome}`)}</>}{run.message && <details><summary>{t('common.details')}</summary>{run.message}</details>}</small>}
        </div>
      })}
      {finished && <p className="cardBody">{t('mediaPlan.done')}</p>}
    </div>}
    {noModels && <div className="note" role="status">{t('mediaPlan.noModels')}</div>}
    {error && <div className="errorBox" role="alert">{t('mediaPlan.failed')}<details><summary>{t('common.details')}</summary>{error}</details></div>}
  </div>
}
