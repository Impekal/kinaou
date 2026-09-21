import { useEffect, useRef, useState } from 'react'
import { AssetPlacementControl } from './AssetPlacementControl'
import { SceneFulfillmentControl } from './SceneFulfillmentControl'
import { VideoJobStatus } from './VideoJobStatus'
import { VideoStudioSession, type VideoFeedback } from '../core/videoStudioSession'
import { reviewVideoDraft } from '../core/videoStudioDraft'
import { AiEditorRequestScope } from '../core/aiEditorReview'
import type { ImageGenerationAvailability, ImageJobParameters } from '../core/imageJobs'
import type { KinaouProject } from '../core/project'
import type { ReferenceRole } from '../core/generationReferences'
import { VideoReferenceInputs } from './VideoReferenceInputs'
import type { PersistentVersionHistory } from '../core/versioning'
import { WorkerClient } from '../core/workerClient'
import { useUiLanguage } from './UiLanguageProvider'
import { resolveUiMessage } from '../core/uiMessages'

interface Props { project: KinaouProject; history: PersistentVersionHistory; workerUrl: string; workerToken: string; workerConnected: boolean; workerCapabilities: string[]; onProjectChange: (project: KinaouProject) => void }
function randomSeed(): string { return String(Math.floor(Math.random() * 2 ** 31)) }

export function VideoStudioPanel({ project, history, workerUrl, workerToken, workerConnected, workerCapabilities, onProjectChange }: Props) {
  const { t, language } = useUiLanguage()
  const [availability, setAvailability] = useState<ImageGenerationAvailability | null>(null)
  const [templatePath, setTemplatePath] = useState('')
  const [positivePrompt, setPositivePrompt] = useState('')
  const [negativePrompt, setNegativePrompt] = useState('')
  const [seed, setSeed] = useState(randomSeed)
  const [width, setWidth] = useState('1024'), [height, setHeight] = useState('576')
  const [selectedReferences, setSelectedReferences] = useState<Partial<Record<ReferenceRole, string>>>({})
  const [authorizedReferences, setAuthorizedReferences] = useState<Partial<Record<ReferenceRole, boolean>>>({})
  useEffect(() => { setSelectedReferences({}); setAuthorizedReferences({}) }, [project.id, templatePath, workerUrl, workerToken, workerConnected])
  const [feedback, setFeedback] = useState<VideoFeedback | null>(null)
  const [submitted, setSubmitted] = useState<ImageJobParameters | null>(null)
  const [error, setError] = useState('')
  const [detectingKey, setDetectingKey] = useState('')
  const availableKey = useRef('')
  const scope = useRef(new AiEditorRequestScope())
  const session = useRef<VideoStudioSession | null>(null)
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
  const review = reviewVideoDraft(template, { positivePrompt, negativePrompt, seed, width, height }, project, selectedReferences, authorizedReferences)
  const connected = workerConnected && Boolean(workerToken.trim())
  const capabilityReady = connected && workerCapabilities.includes('video-generation')
  const client = () => new WorkerClient({ baseUrl: workerUrl, token: workerToken })

  async function detect() {
    if (!connected || locked || detecting) return
    const current = scope.current.begin()
    setError(''); setAvailability(null); setTemplatePath(''); setDetectingKey(key)
    try {
      const next = await client().videoGenerationAvailability()
      if (!current()) return
      const videos = { ...next, templates: next.templates.filter(entry => entry.mediaType === 'video') }
      availableKey.current = key; setAvailability(videos); setTemplatePath(videos.templates[0]?.path ?? '')
    } catch (cause) { if (current()) setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { if (current()) setDetectingKey('') }
  }
  async function generate() {
    if (!connected || !currentAvailability?.comfyui.available || !template || !review.parameters || session.current?.unresolved || detecting) return
    const parameters = review.parameters
    setError(''); setSubmitted(parameters)
    const task = new VideoStudioSession(project, connection, parameters, template.id, {
      client: client(), environment: () => environment.current,
      snapshot: value => { history.snapshot(value, 'Before saving generated video', 'system') },
      persist: value => { onProjectChange(value); environment.current = { project: value, connection } },
      publish: value => { if (mounted.current && session.current === task) setFeedback(value) }
    })
    session.current = task; await task.run()
  }
  function reuseSettings(metadata: Record<string, unknown>) {
    if (session.current?.unresolved || !currentAvailability?.templates.some(entry => entry.path === metadata.templatePath)) return
    setTemplatePath(String(metadata.templatePath))
    setPositivePrompt(typeof metadata.positivePrompt === 'string' ? metadata.positivePrompt : '')
    setNegativePrompt(typeof metadata.negativePrompt === 'string' ? metadata.negativePrompt : '')
    setSeed(typeof metadata.seed === 'number' ? String(metadata.seed) : '')
    setWidth(typeof metadata.width === 'number' ? String(metadata.width) : '')
    setHeight(typeof metadata.height === 'number' ? String(metadata.height) : '')
    setSelectedReferences({}); setAuthorizedReferences({})
  }
  const currentFeedback: VideoFeedback | null = session.current?.wasDetached ? { phase: 'detached' } : feedback
  const generated = project.assets.filter(asset => asset.kind === 'video' && asset.metadata.adapterId === 'comfyui' && asset.metadata.generated === true)
  return <section className="stack">
    <div className="sectionLead"><div><div className="eyebrow">{t('video.eyebrow')}</div><h2>{t('video.heading')}</h2><p>{t('video.help')}</p></div><span className={capabilityReady ? 'status online' : 'status'}>{t(capabilityReady ? 'video.available' : 'video.unavailable')}</span></div>
    <div className="card videoStudio">
      <p>{t('audio.scope')}</p>
      <div className="directorActions"><button className="secondaryButton" disabled={!connected || locked || detecting} onClick={detect}>{t(detecting ? 'video.detecting' : 'video.detect')}</button>
        {currentAvailability && <small>{t(currentAvailability.comfyui.available ? 'video.reachable' : 'video.unreachable')}{currentAvailability.comfyui.version && ` · ${currentAvailability.comfyui.version}`} · {t('video.templateCount', { count: currentAvailability.templates.length })}</small>}
      </div>
      {currentAvailability?.comfyui.available && !currentAvailability.templates.length && <p role="status">{t('video.noTemplates')}</p>}
      <label>{t('video.templateLabel')}<select value={templatePath} disabled={locked || detecting} onChange={event => setTemplatePath(event.target.value)}><option value="">{t('video.choose')}</option>{currentAvailability?.templates.map(entry => <option key={entry.path} value={entry.path}>{entry.label}</option>)}</select></label>
      <label>{t('video.promptLabel')}<textarea value={positivePrompt} onChange={event => setPositivePrompt(event.target.value)} /></label>
      <VideoReferenceInputs project={project} roles={template?.referenceRoles ?? []} selected={selectedReferences} authorized={authorizedReferences} disabled={locked || detecting} onSelect={(role, id) => { setSelectedReferences(previous => ({ ...previous, [role]: id })); setAuthorizedReferences(previous => ({ ...previous, [role]: false })) }} onAuthorize={(role, authorized) => setAuthorizedReferences(previous => ({ ...previous, [role]: authorized }))} />
      <label>{t('video.negativeLabel')}<textarea value={negativePrompt} onChange={event => setNegativePrompt(event.target.value)} /></label>
      {template && !template.supportsNegativePrompt && <small>{t('video.unsupported')}</small>}
      <div className="formRow">
        <label>{t('video.seedLabel')}<input value={seed} onChange={event => setSeed(event.target.value)} inputMode="numeric" /></label><button className="secondaryButton" onClick={() => setSeed(randomSeed())}>{t('video.randomize')}</button>
        {template?.supportsWidth && <label>{t('video.width')}<input value={width} onChange={event => setWidth(event.target.value)} inputMode="numeric" /></label>}
        {template?.supportsHeight && <label>{t('video.height')}<input value={height} onChange={event => setHeight(event.target.value)} inputMode="numeric" /></label>}
      </div>
      {review.issue && <p>{t(`video.${review.issue}`)}</p>}
      <button className="primary" disabled={!connected || !currentAvailability?.comfyui.available || !review.parameters || locked || detecting} onClick={generate}>{t('video.generate')}</button>
      {currentFeedback && <VideoJobStatus feedback={currentFeedback} submitted={submitted} onRetry={() => void session.current?.run()} onCancel={() => void session.current?.cancel()} onDetach={() => { session.current?.detach(); setFeedback({ phase: 'detached' }) }} />}
      {error && <div className="errorBox" role="alert">{t('video.error')}<details><summary>{t('common.details')}</summary>{resolveUiMessage(language, error)}</details></div>}
    </div>
    {generated.length > 0 && <div className="card generatedImages"><div className="eyebrow">{t('video.assets')}</div><p className="cardBody">{t('video.assetHelp')}</p>{generated.map(asset => <div key={asset.id}><span><strong>{String(asset.metadata.name)}</strong><small>{t('video.generated')} · {t('video.seedLabel')} {String(asset.metadata.seed)} · {String(asset.metadata.templateId)}</small><button className="secondaryButton" disabled={locked || detecting || !currentAvailability?.templates.some(entry => entry.path === asset.metadata.templatePath)} onClick={() => reuseSettings(asset.metadata)}>{t('video.reuse')}</button>{!currentAvailability?.templates.some(entry => entry.path === asset.metadata.templatePath) && <small>{t('video.reuseUnavailable')}</small>}</span><div className="stackControls"><SceneFulfillmentControl project={project} history={history} asset={asset} onProjectChange={onProjectChange} onError={setError} /><AssetPlacementControl project={project} asset={asset} onProjectChange={onProjectChange} /></div></div>)}</div>}
  </section>
}
