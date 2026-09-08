import { useRef, useState } from 'react'
import { registerCapturedMedia } from '../core/capturedMedia'
import { registerGeneratedImage } from '../core/generatedImages'
import { registerWebCapture } from '../core/webCaptures'
import { assignAssetToScene } from '../core/storyboardFulfillment'
import { describeAcquisitionItem, parseMediaAcquisitionPlan, type MediaAcquisitionItem, type MediaAcquisitionPlan } from '../core/mediaAcquisition'
import { parseProject, touchProject, type KinaouProject } from '../core/project'
import type { PersistentVersionHistory } from '../core/versioning'
import { WorkerClient } from '../core/workerClient'

interface Props { project: KinaouProject; history: PersistentVersionHistory; workerUrl: string; workerToken: string; workerConnected: boolean; workerCapabilities: string[]; onProjectChange: (project: KinaouProject) => void }
interface ItemRun { status: 'running' | 'succeeded' | 'failed'; message?: string }

const terminal = new Set(['succeeded', 'failed', 'cancelled'])
const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))
function randomSeed(): number { return Math.floor(Math.random() * 2 ** 31) }

export function MediaPlanPanel({ project, history, workerUrl, workerToken, workerConnected, workerCapabilities, onProjectChange }: Props) {
  const [models, setModels] = useState<Array<{ id: string }>>([])
  const [model, setModel] = useState('')
  const [plan, setPlan] = useState<MediaAcquisitionPlan | null>(null)
  const [runs, setRuns] = useState<Record<number, ItemRun>>({})
  const [busy, setBusy] = useState(false)
  const [finished, setFinished] = useState(false)
  const [error, setError] = useState('')
  const projectRef = useRef(project)
  projectRef.current = project
  const client = () => new WorkerClient({ baseUrl: workerUrl, token: workerToken })

  async function detectModels() {
    setError('')
    try {
      const next = await client().listLocalModels()
      setModels(next)
      setModel(next[0]?.id ?? '')
      if (!next.length) setError('No installed local Ollama model was found.')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Model discovery failed') }
  }

  async function pollUntilTerminal<T extends { id: string; state: string }>(job: T, status: (id: string) => Promise<T>): Promise<T> {
    let current = job
    while (!terminal.has(current.state)) {
      await sleep(1000)
      current = await status(current.id)
    }
    return current
  }

  async function acquire(item: MediaAcquisitionItem, current: KinaouProject): Promise<{ project: KinaouProject; uri: string }> {
    const worker = client()
    if (item.kind === 'web-capture') {
      const browsers = await worker.listWebCaptureBrowsers()
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
    const template = availability.templates[0]
    if (!availability.comfyui.available || !template) throw new Error('Local image generation is not available (running ComfyUI plus a managed template required)')
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

  async function planAndAcquire() {
    setError(''); setPlan(null); setRuns({}); setFinished(false); setBusy(true)
    try {
      const context = { title: project.title, scenes: project.storyboard.map((scene) => ({ id: scene.id, title: scene.title, description: scene.description })) }
      const raw = await client().generateMediaAcquisitionPlan(model, context)
      const validated = parseMediaAcquisitionPlan(raw, projectRef.current)
      setPlan(validated)
      history.snapshot(projectRef.current, 'Before media acquisition run', 'system')
      let current = projectRef.current
      const results: Array<{ sceneId: string; summary: string; status: string; message?: string }> = []
      for (const [index, item] of validated.items.entries()) {
        setRuns((previous) => ({ ...previous, [index]: { status: 'running' } }))
        try {
          const result = await acquire(item, current)
          current = result.project
          const asset = current.assets.find((candidate) => candidate.uri === result.uri)
          const scene = current.storyboard.find((candidate) => candidate.id === item.sceneId)
          let message = 'acquired'
          if (asset && scene && !scene.assetId) { current = assignAssetToScene(current, item.sceneId, asset.id); message = 'acquired and assigned to its scene' }
          else if (asset) message = 'acquired; kept as alternative because the scene is already fulfilled'
          onProjectChange(current)
          setRuns((previous) => ({ ...previous, [index]: { status: 'succeeded', message } }))
          results.push({ sceneId: item.sceneId, summary: describeAcquisitionItem(item), status: 'succeeded', message })
        } catch (cause) {
          const message = cause instanceof Error ? cause.message : 'Acquisition failed'
          setRuns((previous) => ({ ...previous, [index]: { status: 'failed', message } }))
          results.push({ sceneId: item.sceneId, summary: describeAcquisitionItem(item), status: 'failed', message })
        }
      }
      current = parseProject(touchProject({ ...current, metadata: { ...current.metadata, mediaAcquisition: { plan: validated, completedAt: new Date().toISOString(), results } } }))
      onProjectChange(current)
      setFinished(true)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Media acquisition failed') }
    finally { setBusy(false) }
  }

  const available = workerConnected && workerCapabilities.includes('local-llm')
  const hasScenes = project.storyboard.length > 0

  return <div className="card imageStudio">
    <div><div className="eyebrow">SCENE MEDIA PLAN</div><h3>Let KINAOU gather the visuals</h3><p className="cardBody">The local model decides per storyboard scene how to obtain its visual — capture a real website, capture a real app window, or generate an illustrative image — and KINAOU acquires everything immediately. You review the results: every item below shows what was fetched from where, each asset keeps its full provenance, only still-empty scenes are filled, and an automatic safety version taken before the run makes the whole acquisition reversible in one restore.</p></div>
    {!hasScenes && <p className="cardBody">Apply a Director plan first — the media plan works from the storyboard scenes.</p>}
    <div className="directorActions">
      <button className="secondaryButton" disabled={!available || busy} onClick={detectModels}>Detect local models</button>
      <select value={model} onChange={(event) => setModel(event.target.value)}><option value="">Detect models first</option>{models.map((entry) => <option key={entry.id} value={entry.id}>{entry.id}</option>)}</select>
      <button className="primary" disabled={!available || !model || !hasScenes || busy} onClick={planAndAcquire}>{busy ? 'Acquiring…' : 'Plan & acquire automatically'}</button>
    </div>
    {plan && <div className="mediaPlanItems">
      {plan.items.map((item, index) => {
        const scene = project.storyboard.find((candidate) => candidate.id === item.sceneId)
        const run = runs[index]
        return <div key={index} className="mediaPlanItem">
          <strong>{scene?.title ?? item.sceneId}</strong>
          <span>{describeAcquisitionItem(item)}</span>
          <small>{item.rationale}</small>
          {run && <small className={run.status === 'failed' ? 'errorText' : ''}>{run.status}{run.message ? ` · ${run.message}` : ''}</small>}
        </div>
      })}
      {finished && <p className="cardBody">Done. Review the results above and in the storyboard fulfillment overview — clear or replace any scene visual there, or restore the automatic "Before media acquisition run" version to undo everything.</p>}
    </div>}
    {error && <div className="errorBox">{error}</div>}
  </div>
}
