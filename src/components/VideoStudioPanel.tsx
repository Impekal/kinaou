import { useEffect, useRef, useState } from 'react'
import { AssetPlacementControl } from './AssetPlacementControl'
import { SceneFulfillmentControl } from './SceneFulfillmentControl'
import { registerGeneratedVideo } from '../core/generatedVideos'
import type { ImageGenerationAvailability } from '../core/imageJobs'
import type { VideoJobRecord } from '../core/videoJobs'
import type { KinaouProject } from '../core/project'
import type { PersistentVersionHistory } from '../core/versioning'
import { WorkerClient } from '../core/workerClient'

interface Props { project: KinaouProject; history: PersistentVersionHistory; workerUrl: string; workerToken: string; workerConnected: boolean; workerCapabilities: string[]; onProjectChange: (project: KinaouProject) => void }
const terminal = new Set(['succeeded', 'failed', 'cancelled'])

function randomSeed(): number { return Math.floor(Math.random() * 2 ** 31) }

export function VideoStudioPanel({ project, history, workerUrl, workerToken, workerConnected, workerCapabilities, onProjectChange }: Props) {
  const [availability, setAvailability] = useState<ImageGenerationAvailability | null>(null)
  const [templatePath, setTemplatePath] = useState('')
  const [positivePrompt, setPositivePrompt] = useState('')
  const [negativePrompt, setNegativePrompt] = useState('')
  const [seed, setSeed] = useState(() => String(randomSeed()))
  const [width, setWidth] = useState('1024')
  const [height, setHeight] = useState('576')
  const [job, setJob] = useState<VideoJobRecord | null>(null)
  const [error, setError] = useState('')
  const registered = useRef(new Set<string>())
  const client = () => new WorkerClient({ baseUrl: workerUrl, token: workerToken })

  useEffect(() => {
    if (!job || terminal.has(job.state)) return
    const timer = window.setTimeout(async () => { try { setJob(await client().videoJobStatus(job.id)) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Video status failed'); setJob((previous) => previous ? { ...previous } : previous) } }, 1000)
    return () => window.clearTimeout(timer)
  }, [job, workerUrl, workerToken])

  useEffect(() => {
    if (job?.state !== 'succeeded' || registered.current.has(job.id)) return
    registered.current.add(job.id)
    try { onProjectChange(registerGeneratedVideo(project, job)) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Video registration failed') }
  }, [job, project, onProjectChange])

  async function detect() {
    setError('')
    try {
      const next = await client().videoGenerationAvailability()
      setAvailability(next)
      setTemplatePath(next.templates[0]?.path ?? '')
      if (!next.comfyui.available) setError('ComfyUI is not reachable on the configured localhost endpoint. Start your local ComfyUI to enable video generation.')
      else if (!next.templates.length) setError('ComfyUI is running, but no managed workflow template declares "mediaType": "video" under KINAOU/Models/ComfyUI/Workflows.')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Video availability check failed') }
  }

  const template = availability?.templates.find((entry) => entry.path === templatePath) ?? null
  const seedValue = Number(seed)
  const seedValid = Number.isSafeInteger(seedValue) && seedValue >= 0
  const widthValue = Number(width)
  const heightValue = Number(height)
  const dimensionsValid = (!template?.supportsWidth || (Number.isInteger(widthValue) && widthValue > 0)) && (!template?.supportsHeight || (Number.isInteger(heightValue) && heightValue > 0))

  async function generate() {
    if (!template) return
    setError('')
    try {
      setJob(await client().startVideoJob({
        templatePath: template.path,
        positivePrompt: positivePrompt.trim(),
        ...(template.supportsNegativePrompt && negativePrompt.trim() ? { negativePrompt: negativePrompt.trim() } : {}),
        seed: seedValue,
        ...(template.supportsWidth ? { width: widthValue } : {}),
        ...(template.supportsHeight ? { height: heightValue } : {})
      }))
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Video generation failed to start') }
  }

  async function cancel() { if (job) try { setJob(await client().cancelVideoJob(job.id)) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Video cancellation failed') } }

  function reuseSettings(metadata: Record<string, unknown>) {
    if (typeof metadata.templatePath === 'string' && availability?.templates.some((entry) => entry.path === metadata.templatePath)) setTemplatePath(metadata.templatePath)
    if (typeof metadata.positivePrompt === 'string') setPositivePrompt(metadata.positivePrompt)
    if (typeof metadata.negativePrompt === 'string') setNegativePrompt(metadata.negativePrompt)
    if (typeof metadata.seed === 'number') setSeed(String(metadata.seed))
  }

  const capabilityReady = workerConnected && workerCapabilities.includes('video-generation')
  const running = Boolean(job && !terminal.has(job.state))
  const canGenerate = workerConnected && Boolean(availability?.comfyui.available) && Boolean(template) && Boolean(positivePrompt.trim()) && seedValid && dimensionsValid && !running
  const generated = project.assets.filter((asset) => asset.kind === 'video' && asset.metadata.adapterId === 'comfyui' && asset.metadata.generated === true)

  return <section className="stack">
    <div className="sectionLead"><div><div className="eyebrow">LOCAL VIDEO STUDIO</div><h2>Video</h2><p>Generate scene video locally through managed video workflow templates. Generated clips keep prompt/template/seed provenance and are never presented as real recordings.</p></div><span className={capabilityReady ? 'status online' : 'status'}>{capabilityReady ? 'VIDEO TEMPLATES AVAILABLE' : 'NOT CONFIGURED'}</span></div>
    <div className="card imageStudio">
      <div className="directorActions"><button className="secondaryButton" disabled={!workerConnected || running} onClick={detect}>Check availability</button>{availability && <small>{availability.comfyui.available ? `ComfyUI reachable${availability.comfyui.version ? ` · ${availability.comfyui.version}` : ''}` : 'ComfyUI not reachable'} · {availability.templates.length} video template{availability.templates.length === 1 ? '' : 's'}</small>}</div>
      <label>Managed video workflow template<select value={templatePath} onChange={(event) => setTemplatePath(event.target.value)}><option value="">Check availability first</option>{availability?.templates.map((entry) => <option key={entry.path} value={entry.path}>{entry.label}</option>)}</select></label>
      <label>Prompt<textarea value={positivePrompt} onChange={(event) => setPositivePrompt(event.target.value)} placeholder="Describe the scene motion…" /></label>
      {template?.supportsNegativePrompt && <label>Negative prompt (optional)<textarea value={negativePrompt} onChange={(event) => setNegativePrompt(event.target.value)} placeholder="What to avoid…" /></label>}
      <div className="formRow">
        <label>Seed<input value={seed} onChange={(event) => setSeed(event.target.value)} inputMode="numeric" /></label>
        <button className="secondaryButton" onClick={() => setSeed(String(randomSeed()))}>Randomize</button>
        {template?.supportsWidth && <label>Width<input value={width} onChange={(event) => setWidth(event.target.value)} inputMode="numeric" /></label>}
        {template?.supportsHeight && <label>Height<input value={height} onChange={(event) => setHeight(event.target.value)} inputMode="numeric" /></label>}
      </div>
      <div className="directorActions"><button className="primary" disabled={!canGenerate} onClick={generate}>Generate locally</button>{running && <button className="dangerButton" onClick={cancel}>Cancel</button>}</div>
      {job && <div className="sttJob"><div><strong>{job.state}</strong><span>{Math.round(job.progress * 100)}%</span></div><div className="progressTrack"><div className="progressFill" style={{ width: `${job.progress * 100}%` }} /></div>{job.videoPath && <small>{job.videoPath} · {((job.durationMs ?? 0) / 1000).toFixed(2)}s · seed {job.provenance.seed}</small>}{job.state === 'failed' && job.error && <small>{job.error}</small>}</div>}
      {error && <div className="errorBox">{error}</div>}
    </div>
    {generated.length > 0 && <div className="card generatedImages"><div className="eyebrow">GENERATED VIDEO ASSETS</div><p className="cardBody">Regenerating never overwrites: reuse the settings, adjust them, and every run stays its own attributable asset until you explicitly replace a scene visual.</p>{generated.map((asset) => <div key={asset.id}><span><strong>{String(asset.metadata.name)}</strong><small>GENERATED · {(Number(asset.metadata.durationMs) / 1000).toFixed(2)}s · seed {String(asset.metadata.seed)} · {String(asset.metadata.templateId)}</small><button className="secondaryButton" onClick={() => reuseSettings(asset.metadata)}>Reuse settings</button></span><div className="stackControls"><SceneFulfillmentControl project={project} history={history} asset={asset} onProjectChange={onProjectChange} onError={setError} /><AssetPlacementControl project={project} asset={asset} onProjectChange={onProjectChange} /></div></div>)}</div>}
  </section>
}
