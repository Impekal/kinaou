import { useEffect, useRef, useState } from 'react'
import { AssetPlacementControl } from './AssetPlacementControl'
import { SceneFulfillmentControl } from './SceneFulfillmentControl'
import { ImageJobStatus } from './ImageJobStatus'
import { ImageStudioSession, type ImageFeedback } from '../core/imageStudioSession'
import { reviewImageDraft } from '../core/imageStudioDraft'
import { AiEditorRequestScope } from '../core/aiEditorReview'
import type { ImageGenerationAvailability, ImageJobParameters } from '../core/imageJobs'
import type { KinaouProject } from '../core/project'
import { commitSceneAssignment } from '../core/sceneAssignmentCommit'
import type { PersistentVersionHistory } from '../core/versioning'
import { WorkerClient } from '../core/workerClient'
import { useUiLanguage } from './UiLanguageProvider'

interface Props { project: KinaouProject; history: PersistentVersionHistory; workerUrl: string; workerToken: string; workerConnected: boolean; workerCapabilities: string[]; onProjectChange: (project: KinaouProject) => void }
function randomSeed(): string { return String(Math.floor(Math.random() * 2 ** 31)) }

export function ImageStudioPanel({ project, history, workerUrl, workerToken, workerConnected, workerCapabilities, onProjectChange }: Props) {
  const { language, t } = useUiLanguage()
  const [availability, setAvailability] = useState<ImageGenerationAvailability | null>(null)
  const [templatePath, setTemplatePath] = useState('')
  const [positivePrompt, setPositivePrompt] = useState('')
  const [negativePrompt, setNegativePrompt] = useState('')
  const [seed, setSeed] = useState(randomSeed)
  const [width, setWidth] = useState('1024'), [height, setHeight] = useState('1024')
  const [feedback, setFeedback] = useState<ImageFeedback | null>(null)
  const [submitted, setSubmitted] = useState<ImageJobParameters | null>(null)
  const [error, setError] = useState('')
  const [detectingKey, setDetectingKey] = useState('')
  const availableKey = useRef('')
  const scope = useRef(new AiEditorRequestScope())
  const session = useRef<ImageStudioSession | null>(null)
  const mounted = useRef(true)
  const connection = JSON.stringify([workerUrl, workerToken, workerConnected, [...workerCapabilities].sort()])
  const key = JSON.stringify([project.id, connection])
  const environment = useRef({ project, connection }); environment.current = { project, connection }
  session.current?.observe(project, connection); scope.current.update(key)
  useEffect(() => { mounted.current = true; scope.current.attach(); return () => { mounted.current = false; scope.current.detach(); session.current?.detach() } }, [])
  useEffect(() => { setAvailability(null); setTemplatePath(''); setDetectingKey(''); setError('') }, [key])
  const locked = Boolean(session.current?.unresolved)
  const detecting = detectingKey === key
  const currentAvailability = availableKey.current === key ? availability : null
  const template = currentAvailability?.templates.find(entry => entry.path === templatePath) ?? null
  const review = reviewImageDraft(template, { positivePrompt, negativePrompt, seed, width, height })
  const connected = workerConnected && Boolean(workerToken.trim())
  const capabilityReady = connected && workerCapabilities.includes('image-generation')
  const client = () => new WorkerClient({ baseUrl: workerUrl, token: workerToken })

  async function detect() {
    if (!connected || locked || detecting) return
    const current = scope.current.begin()
    setError(''); setAvailability(null); setTemplatePath(''); setDetectingKey(key)
    try {
      const next = await client().imageGenerationAvailability()
      if (!current()) return
      const images = { ...next, templates: next.templates.filter(entry => entry.mediaType === 'image') }
      availableKey.current = key; setAvailability(images); setTemplatePath(images.templates[0]?.path ?? '')
    } catch (cause) { if (current()) setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { if (current()) setDetectingKey('') }
  }
  async function generate() {
    if (!connected || !currentAvailability?.comfyui.available || !template || !review.parameters || session.current?.unresolved || detecting) return
    const parameters = review.parameters
    setError(''); setSubmitted(parameters)
    const task = new ImageStudioSession(project, connection, parameters, template.id, {
      client: client(), environment: () => environment.current,
      snapshot: value => { history.snapshot(value, 'Before saving generated image', 'system') },
      persist: value => { onProjectChange(value); environment.current = { project: value, connection } },
      publish: value => { if (mounted.current && session.current === task) setFeedback(value) }
    })
    session.current = task; await task.run()
  }
  const currentFeedback: ImageFeedback | null = session.current?.wasDetached ? { phase: 'detached' } : feedback
  const generated = project.assets.filter(asset => asset.kind === 'image' && asset.metadata.adapterId === 'comfyui' && asset.metadata.generated === true)
  return <section className="stack">
    <div className="sectionLead"><div><div className="eyebrow">{t('image.eyebrow')}</div><h2>{t('image.heading')}</h2><p>{t('image.help')}</p></div><span className={capabilityReady ? 'status online' : 'status'}>{t(capabilityReady ? 'image.available' : 'image.unavailable')}</span></div>
    <div className="card imageStudio">
      <p>{t('audio.scope')}</p>
      <div className="directorActions"><button className="secondaryButton" disabled={!connected || locked || detecting} onClick={detect}>{t(detecting ? 'image.detecting' : 'image.detect')}</button>
        {currentAvailability && <small>{t(currentAvailability.comfyui.available ? 'image.reachable' : 'image.unreachable')}{currentAvailability.comfyui.version && ` · ${currentAvailability.comfyui.version}`} · {t('image.templateCount', { count: currentAvailability.templates.length })}</small>}
      </div>
      {currentAvailability?.comfyui.available && !currentAvailability.templates.length && <p role="status">{t('image.noTemplates')}</p>}
      <label>{t('image.templateLabel')}<select value={templatePath} disabled={locked || detecting} onChange={event => setTemplatePath(event.target.value)}><option value="">{t('image.choose')}</option>{currentAvailability?.templates.map(entry => <option key={entry.path} value={entry.path}>{entry.label}</option>)}</select></label>
      <label>{t('image.promptLabel')}<textarea value={positivePrompt} onChange={event => setPositivePrompt(event.target.value)} /></label>
      <label>{t('image.negativeLabel')}<textarea value={negativePrompt} onChange={event => setNegativePrompt(event.target.value)} /></label>
      {template && !template.supportsNegativePrompt && <small>{t('image.unsupported')}</small>}
      <div className="formRow">
        <label>{t('image.seedLabel')}<input value={seed} onChange={event => setSeed(event.target.value)} inputMode="numeric" /></label><button className="secondaryButton" onClick={() => setSeed(randomSeed())}>{t('image.randomize')}</button>
        {template?.supportsWidth && <label>{t('image.width')}<input value={width} onChange={event => setWidth(event.target.value)} inputMode="numeric" /></label>}
        {template?.supportsHeight && <label>{t('image.height')}<input value={height} onChange={event => setHeight(event.target.value)} inputMode="numeric" /></label>}
      </div>
      {review.issue && <p>{t(`image.${review.issue}`)}</p>}
      <button className="primary" disabled={!connected || !currentAvailability?.comfyui.available || !review.parameters || locked || detecting} onClick={generate}>{t('image.generate')}</button>
      {currentFeedback && <ImageJobStatus feedback={currentFeedback} submitted={submitted} onRetry={() => void session.current?.run()} onCancel={() => void session.current?.cancel()} onDetach={() => { session.current?.detach(); setFeedback({ phase: 'detached' }) }} />}
      {error && <div className="errorBox" role="alert">{t('image.error')}<details><summary>{t('common.details')}</summary>{error}</details></div>}
    </div>
    {generated.length > 0 && <div className="card generatedImages"><div className="eyebrow">{t('image.assets')}</div><p className="cardBody">{t('image.assignmentHelp')}</p>{generated.map(asset => <div key={asset.id}><span><strong>{String(asset.metadata.name)}</strong><small>{t('image.generated')} · {t('image.seedLabel')} {String(asset.metadata.seed)} · {String(asset.metadata.templateId)}</small></span><div className="stackControls"><SceneFulfillmentControl project={project} history={history} asset={asset} onProjectChange={onProjectChange} onError={setError} /><AssetPlacementControl project={project} asset={asset} onProjectChange={onProjectChange} /></div></div>)}</div>}
    {project.storyboard.length > 0 && <div className="card storyboardFulfillment"><div className="eyebrow">{t('image.storyboard')}</div>{project.storyboard.map(scene => {
      const assigned = project.assets.find(asset => asset.id === scene.assetId)
      return <div key={scene.id}><span><strong>{scene.title}</strong><small>{new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(scene.durationMs / 1000)}s · {assigned ? t('image.assigned', { name: String(assigned.metadata.name ?? assigned.id) }) : t(scene.assetId ? 'image.missing' : 'image.unassigned')}</small></span>{scene.assetId && <button className="secondaryButton" onClick={() => { setError(''); try { commitSceneAssignment(project, scene.id, undefined, history, onProjectChange) } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) } }}>{t('image.clear')}</button>}</div>
    })}</div>}
  </section>
}
