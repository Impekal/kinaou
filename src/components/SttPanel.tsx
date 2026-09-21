import { useEffect, useMemo, useRef, useState } from 'react'
import type { KinaouProject } from '../core/project'
import { SttModelDiscovery, SttSession, type SttDiscoveryFeedback, type SttFeedback } from '../core/sttSession'
import type { PersistentVersionHistory } from '../core/versioning'
import { WorkerClient } from '../core/workerClient'
import { useUiLanguage } from './UiLanguageProvider'

interface Props { project: KinaouProject; history: PersistentVersionHistory; workerUrl: string; workerToken: string; workerConnected: boolean; workerCapabilities: string[]; onProjectChange: (project: KinaouProject) => void }

export function SttStatus({ feedback }: { feedback: SttFeedback }) {
  const { t, language } = useUiLanguage(), job = feedback.job
  return <div className="sttJob" role="status"><strong>{t(`stt.${feedback.phase}`)}</strong>
    <p>{feedback.sourceName} · {feedback.draft.model.split('/').at(-1)} · {feedback.draft.language}</p>
    {job && <><code>{job.id}</code><p>{Math.round(job.progress * 100).toLocaleString(language)}%</p><div className="progressTrack"><div className="progressFill" style={{ width: `${job.progress * 100}%` }} /></div></>}
    {job?.transcript && <><p>{job.transcript.text}</p><small>{t('stt.summary', { count: job.transcript.segments.length.toLocaleString(language), language: job.transcript.language })}</small></>}
    {feedback.detail && <details><summary>{t('common.details')}</summary>{feedback.detail}</details>}
  </div>
}

export function SttPanel({ project, history, workerUrl, workerToken, workerConnected, workerCapabilities, onProjectChange }: Props) {
  const { t } = useUiLanguage()
  const sources = useMemo(() => project.assets.filter(asset => asset.managed && !asset.offline && ['audio', 'video'].includes(asset.kind)), [project.assets])
  const [sourceId, setSourceId] = useState(sources[0]?.id ?? ''), [model, setModel] = useState(''), [language, setLanguage] = useState('auto')
  const [feedback, setFeedback] = useState<SttFeedback | null>(null), [found, setFound] = useState<SttDiscoveryFeedback | null>(null)
  const session = useRef<SttSession | null>(null), discovery = useRef<SttModelDiscovery | null>(null), mounted = useRef(true)
  const available = workerConnected && !!workerToken.trim() && workerCapabilities.includes('speech-to-text')
  const connection = JSON.stringify([workerUrl, workerToken, workerConnected, available]), environment = useRef({ project, connection })
  environment.current = { project, connection }; session.current?.observe(project, connection); discovery.current?.observe(project, connection)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; session.current?.detach(); discovery.current?.detach() } }, [])
  useEffect(() => {
    const task = session.current
    if (!task?.shouldPoll) return
    const timer = window.setTimeout(() => { void task.check() }, 750)
    return () => window.clearTimeout(timer)
  }, [feedback, connection, project])

  const models = discovery.current?.wasDetached ? [] : found?.models ?? []
  const blocked = Boolean(session.current?.blocksStart), detecting = Boolean(discovery.current?.running)
  async function detect() {
    if (!available || session.current?.blocksStart || discovery.current?.running) return
    discovery.current?.detach()
    const task = new SttModelDiscovery(project, connection, {
      client: new WorkerClient({ baseUrl: workerUrl, token: workerToken }), environment: () => environment.current,
      publish: value => { if (mounted.current && discovery.current === task) { setFound(value); if (value.phase === 'modelsReady') setModel(previous => value.models.includes(previous) ? previous : value.models[0]) } }
    })
    discovery.current = task; await task.detect()
  }
  async function start() {
    if (!available || session.current?.blocksStart || discovery.current?.running || !models.includes(model)) return
    session.current?.detach()
    const task = new SttSession(project, connection, { sourceId, model, language: language.trim().toLowerCase() }, {
      client: new WorkerClient({ baseUrl: workerUrl, token: workerToken }), environment: () => environment.current,
      snapshot: value => { history.snapshot(value, 'Before saving transcript', 'system') },
      persist: value => { onProjectChange(value); environment.current = { project: value, connection } },
      publish: value => { if (mounted.current && session.current === task) setFeedback(value) }
    })
    session.current = task; await task.start()
  }
  function detach() {
    session.current?.detach(); session.current = null
    setFeedback(previous => previous ? { ...previous, phase: 'detached' } : previous)
  }
  const shown = feedback && session.current?.wasDetached ? { ...feedback, phase: 'detached' as const } : feedback
  const recovery = shown && ['statusFailed', 'cancelFailed'].includes(shown.phase)
  return <div className="card sttPanel"><div className="sectionLead"><div><div className="eyebrow">{t('stt.eyebrow')}</div><h3>{t('stt.heading')}</h3><p>{t('stt.help')}</p></div><span className={available ? 'status online' : 'status'}>{t(available ? 'stt.available' : 'stt.unavailable')}</span></div>
    <p className="note">{t('stt.boundary')}</p>{!available && <p>{t('stt.requirements')}</p>}{!sources.length && <p>{t('stt.noSources')}</p>}
    <div className="sttControls"><label>{t('stt.source')}<select value={sourceId} disabled={blocked} onChange={event => setSourceId(event.target.value)}><option value="">{t('stt.selectSource')}</option>{sources.map(asset => <option key={asset.id} value={asset.id}>{String(asset.metadata.name ?? asset.id)}</option>)}</select></label>
      <label>{t('stt.model')}<select value={model} disabled={blocked || detecting} onChange={event => setModel(event.target.value)}><option value="">{t('stt.selectModel')}</option>{models.map(path => <option key={path} value={path}>{path.split('/').at(-1)}</option>)}</select></label>
      <label>{t('stt.language')}<input value={language} disabled={blocked} onChange={event => setLanguage(event.target.value)} placeholder="auto, de, en, fr" /></label></div><p>{t('stt.languageHelp')}</p>
    <div className="directorActions"><button className="secondaryButton" disabled={!available || blocked || detecting} onClick={detect}>{t(detecting ? 'stt.detecting' : 'stt.detect')}</button><button className="primary" disabled={!available || !sources.some(asset => asset.id === sourceId) || !models.includes(model) || blocked || detecting} onClick={start}>{t('stt.start')}</button>
      {session.current?.canCheck && <button className="dangerButton" onClick={() => session.current?.cancel()}>{t('stt.cancel')}</button>}
      {recovery && session.current?.canCheck && <button className="secondaryButton" onClick={() => session.current?.check()}>{t('stt.retryStatus')}</button>}
      {session.current?.canSave && <button className="primary" onClick={() => session.current?.save()}>{t('stt.retrySave')}</button>}
    </div>
    {found && !discovery.current?.wasDetached && <div role="status"><p>{t(`stt.${found.phase}`)}</p>{found.detail && <details><summary>{t('common.details')}</summary>{found.detail}</details>}</div>}
    {shown && <SttStatus feedback={shown} />}
    {blocked && <div><button className="secondaryButton" onClick={detach}>{t('stt.detach')}</button><small>{t('stt.detachHelp')}</small></div>}
  </div>
}
