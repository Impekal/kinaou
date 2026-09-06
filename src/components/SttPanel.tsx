import { useEffect, useMemo, useRef, useState } from 'react'
import type { KinaouProject } from '../core/project'
import type { SttJobRecord } from '../core/sttJobs'
import { registerTranscriptAsset } from '../core/transcripts'
import { WorkerClient } from '../core/workerClient'

interface Props { project: KinaouProject; workerUrl: string; workerToken: string; workerConnected: boolean; workerCapabilities: string[]; onProjectChange: (project: KinaouProject) => void }
const terminal = new Set(['succeeded', 'failed', 'cancelled'])

export function SttPanel({ project, workerUrl, workerToken, workerConnected, workerCapabilities, onProjectChange }: Props) {
  const sources = useMemo(() => project.assets.filter((asset) => asset.managed && !asset.offline && ['audio', 'video'].includes(asset.kind)), [project.assets])
  const [sourceId, setSourceId] = useState(sources[0]?.id ?? '')
  const [models, setModels] = useState<string[]>([])
  const [model, setModel] = useState('')
  const [language, setLanguage] = useState('auto')
  const [job, setJob] = useState<SttJobRecord | null>(null)
  const [error, setError] = useState('')
  const registered = useRef(new Set<string>())
  const client = () => new WorkerClient({ baseUrl: workerUrl, token: workerToken })

  useEffect(() => {
    if (!job || terminal.has(job.state)) return
    const timer = window.setTimeout(async () => {
      try { setJob(await client().sttStatus(job.id)) } catch (cause) { setError(cause instanceof Error ? cause.message : 'STT status failed') }
    }, 750)
    return () => window.clearTimeout(timer)
  }, [job, workerUrl, workerToken])

  useEffect(() => {
    if (job?.state !== 'succeeded' || registered.current.has(job.id)) return
    registered.current.add(job.id)
    try { onProjectChange(registerTranscriptAsset(project, sourceId, job)) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Transcript registration failed') }
  }, [job, project, sourceId, onProjectChange])

  async function detect() {
    setError('')
    try { const next = await client().listSttModels(); setModels(next); setModel(next[0] ?? ''); if (!next.length) setError('No managed whisper.cpp GGML model was found.') } catch (cause) { setError(cause instanceof Error ? cause.message : 'Model discovery failed') }
  }
  async function start() {
    const source = sources.find((asset) => asset.id === sourceId)
    if (!source) return
    setError('')
    try { setJob(await client().startStt(source.uri, model, language)) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Transcription failed to start') }
  }
  async function cancel() { if (job) setJob(await client().cancelStt(job.id)) }

  const available = workerConnected && workerCapabilities.includes('speech-to-text')
  return <div className="card sttPanel"><div className="sectionLead"><div><div className="eyebrow">LOCAL SPEECH TO TEXT</div><h3>Transcribe managed media</h3><p>whisper.cpp runs locally; completed JSON is registered as a project asset.</p></div><span className={available ? 'status online' : 'status'}>{available ? 'AVAILABLE' : 'NOT CONFIGURED'}</span></div>
    <div className="sttControls"><label>Source<select value={sourceId} onChange={(event) => setSourceId(event.target.value)}><option value="">Select managed audio or video</option>{sources.map((asset) => <option key={asset.id} value={asset.id}>{String(asset.metadata.name ?? asset.id)}</option>)}</select></label><label>Model<select value={model} onChange={(event) => setModel(event.target.value)}><option value="">Detect a model first</option>{models.map((path) => <option key={path} value={path}>{path.split('/').pop()}</option>)}</select></label><label>Language<input value={language} onChange={(event) => setLanguage(event.target.value.toLowerCase())} placeholder="auto, de, en…" /></label></div>
    <div className="directorActions"><button className="secondaryButton" disabled={!available || Boolean(job && !terminal.has(job.state))} onClick={detect}>Detect models</button><button className="primary" disabled={!available || !sourceId || !model || Boolean(job && !terminal.has(job.state))} onClick={start}>Start transcription</button>{job && !terminal.has(job.state) && <button className="dangerButton" onClick={cancel}>Cancel</button>}</div>
    {job && <div className="sttJob"><div><strong>{job.state}</strong><span>{Math.round(job.progress * 100)}%</span></div><div className="progressTrack"><div className="progressFill" style={{ width: `${job.progress * 100}%` }} /></div>{job.transcript && <><p>{job.transcript.text}</p><small>{job.transcript.segments.length} segments · {job.transcript.language} · saved as project asset</small></>}</div>}
    {error && <div className="errorBox">{error}</div>}
  </div>
}
