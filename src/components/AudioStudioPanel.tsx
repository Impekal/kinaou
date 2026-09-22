import { useEffect, useRef, useState } from 'react'
import { AssetPlacementControl } from './AssetPlacementControl'
import type { KinaouProject } from '../core/project'
import type { PersistentVersionHistory } from '../core/versioning'
import { WorkerClient } from '../core/workerClient'
import { projectContentProfile } from '../core/contentProfile'
import type { SpeechVoiceDescriptor } from '../core/speech'
import { SpeechVoiceSelect } from './SpeechVoiceSelect'
import { useUiLanguage } from './UiLanguageProvider'
import { AudioStudioSession, type AudioFeedback } from '../core/audioStudioSession'
import { AiEditorRequestScope } from '../core/aiEditorReview'
import { AudioJobStatus } from './AudioJobStatus'

interface Props { project: KinaouProject; history: PersistentVersionHistory; workerUrl: string; workerToken: string; workerConnected: boolean; workerCapabilities: string[]; onProjectChange: (project: KinaouProject) => void }

export function AudioStudioPanel({ project, history, workerUrl, workerToken, workerConnected, workerCapabilities, onProjectChange }: Props) {
  const { language, t } = useUiLanguage()
  const [text, setText] = useState(project.script)
  const [voices, setVoices] = useState<SpeechVoiceDescriptor[]>([])
  const [voice, setVoice] = useState('')
  const [feedback, setFeedback] = useState<AudioFeedback | null>(null)
  const [submittedText, setSubmittedText] = useState('')
  const [error, setError] = useState('')
  const [empty, setEmpty] = useState(false)
  const [discovering, setDiscovering] = useState(false)
  const session = useRef<AudioStudioSession | null>(null)
  const mounted = useRef(true)
  const environment = useRef({ project, connection: '' })
  const connection = JSON.stringify([workerUrl, workerToken, workerConnected, [...workerCapabilities].sort()])
  environment.current = { project, connection }
  session.current?.observe(project, connection)
  const scope = useRef(new AiEditorRequestScope())
  scope.current.update(JSON.stringify([project.id, connection]))
  const voicesScope = useRef('')
  const discoveryKey = JSON.stringify([project.id, connection])
  const [discoveryScope, setDiscoveryScope] = useState('')
  useEffect(() => { setVoices([]); setVoice(''); setDiscovering(false); setEmpty(false); setError('') }, [discoveryKey])
  useEffect(() => {
    mounted.current = true; scope.current.attach()
    return () => { mounted.current = false; scope.current.detach(); session.current?.detach() }
  }, [])
  useEffect(() => { setText(project.script); setFeedback(null); setSubmittedText(''); setError(''); setEmpty(false) }, [project.id])
  const available = workerConnected && Boolean(workerToken.trim()) && workerCapabilities.includes('text-to-speech')
  const installed = voicesScope.current === discoveryKey ? voices : []
  const selectedVoice = installed.find(entry => entry.id === voice)
  const locked = Boolean(session.current?.unresolved)
  const detecting = discovering && discoveryScope === discoveryKey
  const currentFeedback: AudioFeedback | null = session.current?.wasDetached ? { phase: 'detached' } : feedback
  const client = () => new WorkerClient({ baseUrl: workerUrl, token: workerToken })

  async function detect() {
    if (!available || locked || detecting) return
    const current = scope.current.begin()
    setDiscovering(true); setDiscoveryScope(discoveryKey); setError(''); setEmpty(false); setVoices([]); setVoice('')
    try {
      const next = await client().listSpeechVoices()
      if (!current()) return
      setVoices(next); voicesScope.current = discoveryKey; setEmpty(!next.length)
    } catch (cause) { if (current()) setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { if (current()) setDiscovering(false) }
  }
  async function generate() {
    if (!available || !selectedVoice || !text.trim() || session.current?.unresolved || detecting) return
    setError(''); setSubmittedText(text.trim())
    const task = new AudioStudioSession(project, connection, text, selectedVoice, {
      client: client(), environment: () => environment.current,
      snapshot: value => { history.snapshot(value, 'Before saving generated voice', 'system') },
      persist: value => { onProjectChange(value); environment.current = { project: value, connection } },
      publish: value => { if (mounted.current && session.current === task) setFeedback(value) }
    })
    session.current = task
    await task.run()
  }
  const generated = project.assets.filter(asset =>
    asset.kind === 'audio'
    && typeof asset.metadata.adapterId === 'string'
    && (
      typeof asset.metadata.speechJobId === 'string'
      || typeof asset.metadata.ttsJobId === 'string'
    )
  )
  const seconds = (ms: number) => new Intl.NumberFormat(language, { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(ms / 1000)
  return <section className="stack"><div className="sectionLead"><div><div className="eyebrow">{t('audio.eyebrow')}</div><h2>{t('audio.heading')}</h2><p>{t('audio.help')}</p></div><span className={available ? 'status online' : 'status'}>{t(available ? 'audio.available' : 'audio.unavailable')}</span></div>
    <div className="card audioStudio">
      <p>{t('audio.scope')}</p>
      <label>{t('audio.text')}<textarea value={text} onChange={event => setText(event.target.value)} placeholder={t('audio.placeholder')} /></label>
      <SpeechVoiceSelect voices={installed} value={selectedVoice?.id ?? ''} language={projectContentProfile(project).outputLanguage} uiLanguage={language} disabled={!available || locked || detecting} onChange={setVoice} />
      <div className="directorActions">
        <button className="secondaryButton" disabled={!available || locked || detecting} onClick={detect}>{t(detecting ? 'audio.detecting' : 'audio.detect')}</button>
        <button className="primary" disabled={!available || !selectedVoice || !text.trim() || locked || detecting} onClick={generate}>{t('audio.generate')}</button>
      </div>
      {currentFeedback && <AudioJobStatus feedback={currentFeedback} submittedText={submittedText} onRetry={() => void session.current?.run()} onCancel={() => void session.current?.cancel()} onDetach={() => { session.current?.detach(); setFeedback({ phase: 'detached' }) }} />}
      {empty && <div className="note" role="status">{t('audio.empty')}</div>}
      {error && <div className="errorBox" role="alert">{t('audio.error')}<details><summary>{t('common.details')}</summary>{error}</details></div>}
    </div>
    {generated.length > 0 && <div className="card generatedVoices"><div className="eyebrow">{t('audio.assets')}</div>{generated.map(asset => <div key={asset.id}><span><strong>{String(asset.metadata.name)}</strong><small>{seconds(Number(asset.metadata.durationMs))}s · {String(asset.metadata.voiceId ?? asset.metadata.voicePath ?? asset.metadata.adapterId)}</small></span><AssetPlacementControl project={project} asset={asset} onProjectChange={onProjectChange} /></div>)}</div>}
  </section>
}
