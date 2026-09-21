import { useEffect, useRef, useState } from 'react'
import { ContentProfilePanel } from './ContentProfilePanel'
import { SceneSpeechReview } from './SceneSpeechReview'
import { localizedDirectorBrief, projectContentProfile } from '../core/contentProfile'
import type { DirectorPlan } from '../core/director'
import { commitDirectorReview, reviewDirectorPlan, type DirectorReview } from '../core/directorReview'
import { AiEditorRequestScope as RequestScope } from '../core/aiEditorReview'
import type { KinaouProject } from '../core/project'
import type { PersistentVersionHistory } from '../core/versioning'
import { WorkerClient } from '../core/workerClient'
import { useUiLanguage } from './UiLanguageProvider'

interface Props { project: KinaouProject; history: PersistentVersionHistory; workerUrl: string; workerToken: string; workerConnected: boolean; workerCapabilities: string[]; onProjectChange: (project: KinaouProject) => void }

export function DirectorPlanReview({ plan }: { plan: DirectorPlan }) {
  const { language, t } = useUiLanguage()
  const seconds = (ms: number) => (ms / 1000).toLocaleString(language, { maximumFractionDigits: 3 })
  return <div className="directorReview">
    <strong>{plan.title}</strong><small>{t('director.summary', { count: plan.scenes.length, seconds: seconds(plan.scenes.reduce((total, scene) => total + scene.durationMs, 0)) })} · {t(`director.${plan.provenance.kind}`)}</small>
    {plan.provenance.modelId && <small>{plan.provenance.adapterId} · {plan.provenance.modelId}</small>}
    <p>{plan.objective}</p><details><summary>{t('director.script')}</summary><p style={{ whiteSpace: 'pre-wrap' }}>{plan.script}</p></details>
    <ol>{plan.scenes.map(scene => <li key={scene.id}><strong>{scene.title}</strong><span>{t('director.visual')}: {scene.description}</span>{scene.visualBrief && <span>{t('director.visualBrief')}: {scene.visualBrief}</span>}<SceneSpeechReview scene={scene} /><small>{seconds(scene.durationMs)} s · {scene.requiredMedia.map(kind => t(`director.${kind}`)).join(', ') || t('director.noMedia')}</small></li>)}</ol>
  </div>
}

export function DirectorPanel({ project, history, workerUrl, workerToken, workerConnected, workerCapabilities, onProjectChange }: Props) {
  const { t } = useUiLanguage()
  const [source, setSource] = useState('')
  const [reviewed, setReviewed] = useState<DirectorReview | null>(null)
  const [message, setMessage] = useState<'valid' | 'saved' | 'models' | 'noModels' | null>(null)
  const [error, setError] = useState('')
  const [models, setModels] = useState<{ connection: string; items: Array<{ id: string; sizeBytes: number }> } | null>(null)
  const [model, setModel] = useState('')
  const [brief, setBrief] = useState(String((project.metadata.sourceInput as { content?: unknown } | undefined)?.content ?? ''))
  const scope = useRef(new RequestScope())
  const inFlight = useRef<(() => boolean) | null>(null)
  const [pending, setPending] = useState<{ current: () => boolean } | null>(null)
  const projectKey = JSON.stringify(project)
  const connection = JSON.stringify([workerUrl, workerToken, workerConnected, workerCapabilities.includes('local-llm')])
  scope.current.update(JSON.stringify([projectKey, connection]))
  useEffect(() => { scope.current.attach(); return () => scope.current.detach() }, [])
  useEffect(() => {
    setSource(''); setReviewed(null); setMessage(null); setError('')
    setBrief(String((project.metadata.sourceInput as { content?: unknown } | undefined)?.content ?? ''))
  }, [project.id])
  const busy = Boolean(pending?.current())
  const installed = models?.connection === connection ? models.items : []
  const canGenerate = workerConnected && Boolean(workerToken.trim()) && workerCapabilities.includes('local-llm')
  const stale = Boolean(reviewed && reviewed.projectKey !== projectKey)
  function accept(input: unknown) {
    const next = reviewDirectorPlan(project, input)
    setReviewed(next); setSource(JSON.stringify(next.plan, null, 2)); setMessage('valid'); setError('')
  }
  async function request(kind: 'models' | 'plan') {
    if (busy || inFlight.current?.() || !canGenerate) return
    if (kind === 'plan' && (!installed.some(item => item.id === model) || !brief.trim())) return
    const current = scope.current.begin()
    inFlight.current = current; setPending({ current }); setMessage(null); setError('')
    if (kind === 'plan') setReviewed(null)
    try {
      const client = new WorkerClient({ baseUrl: workerUrl, token: workerToken })
      if (kind === 'models') {
        const items = await client.listLocalModels()
        if (current()) { setModels({ connection, items }); setModel(items[0]?.id ?? ''); setMessage(items.length ? 'models' : 'noModels') }
      } else {
        const plan = await client.generateDirectorPlan(model, localizedDirectorBrief(projectContentProfile(project), brief))
        if (current()) accept(plan)
      }
    } catch (cause) { if (current()) setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { if (current()) { inFlight.current = null; setPending(null) } }
  }
  function review() {
    if (busy) return
    setError(''); setMessage(null)
    try { accept(JSON.parse(source)) }
    catch (cause) { setReviewed(null); setError(cause instanceof Error ? cause.message : String(cause)) }
  }
  function apply() {
    if (!reviewed || stale || busy) return
    setError(''); setMessage(null)
    try {
      commitDirectorReview(project, reviewed, history, onProjectChange)
      setMessage('saved'); setReviewed(null); setSource('')
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
  }
  const current = project.metadata.directorPlan
  return <section className="stack">
    <div className="sectionLead"><div><h2>{t('director.heading')}</h2><p>{t('director.help')}</p></div></div>
    <ContentProfilePanel project={project} onProjectChange={onProjectChange} />
    <div className="card directorPanel">
      <p>{t('editor.scopeHelp')}</p>
      <div className="localDirector"><label>{t('director.brief')}<textarea disabled={busy} value={brief} onChange={event => setBrief(event.target.value)} /></label><label>{t('editor.model')}<select disabled={busy} value={installed.some(item => item.id === model) ? model : ''} onChange={event => setModel(event.target.value)}><option value="">{t('editor.chooseModel')}</option>{installed.map(item => <option key={item.id} value={item.id}>{item.id}</option>)}</select></label><div className="directorActions"><button className="secondaryButton" disabled={busy || !canGenerate} onClick={() => void request('models')}>{t('editor.detect')}</button><button className="primary" disabled={busy || !canGenerate || !installed.some(item => item.id === model) || !brief.trim()} onClick={() => void request('plan')}>{t(busy ? 'editor.busy' : 'editor.generate')}</button></div></div>
      <label>{t('director.source')}<textarea value={source} onChange={event => { scope.current.invalidate(); setPending(null); setSource(event.target.value); setReviewed(null); setMessage(null); setError('') }} placeholder='{"schemaVersion":1,"title":"…","objective":"…","script":"…","scenes":[…],"provenance":{"kind":"manual"}}' /></label>
      <div className="directorActions"><button className="secondaryButton" disabled={busy || !source.trim()} onClick={review}>{t('editor.review')}</button>{reviewed && <button className="primary" disabled={busy || stale} onClick={apply}>{t('director.apply')}</button>}</div>
      {stale && <div className="warning" role="status">{t('editor.stale')}</div>}
      {message && !stale && <div className="note" role="status">{t(message === 'models' || message === 'noModels' ? `editor.${message}` : `director.${message}`)}</div>}
      {error && <div className="errorBox" role="alert">{t('editor.failed')}<details><summary>{t('common.details')}</summary>{error}</details></div>}
      {reviewed && !stale && <DirectorPlanReview plan={reviewed.plan} />}
    </div>
    {Boolean(current) && <div className="card directorCurrent"><div className="eyebrow">{t('director.accepted')}</div><strong>{String((current as { title?: unknown }).title ?? '')}</strong><p>{t('director.acceptedHelp')}</p></div>}
    <div className="card note">{t('director.boundary')}</div>
  </section>
}
