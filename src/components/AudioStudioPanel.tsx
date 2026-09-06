import { useEffect, useRef, useState } from 'react'
import { AssetPlacementControl } from './AssetPlacementControl'
import { registerGeneratedVoice } from '../core/generatedVoice'
import type { KinaouProject } from '../core/project'
import type { TtsJobRecord } from '../core/ttsJobs'
import { WorkerClient } from '../core/workerClient'

interface Props { project: KinaouProject; workerUrl: string; workerToken: string; workerConnected: boolean; workerCapabilities: string[]; onProjectChange: (project: KinaouProject) => void }
const terminal = new Set(['succeeded', 'failed', 'cancelled'])

export function AudioStudioPanel({ project, workerUrl, workerToken, workerConnected, workerCapabilities, onProjectChange }: Props) {
  const [text, setText] = useState(project.script)
  const [voices, setVoices] = useState<string[]>([])
  const [voice, setVoice] = useState('')
  const [job, setJob] = useState<TtsJobRecord | null>(null)
  const [submittedText, setSubmittedText] = useState('')
  const [error, setError] = useState('')
  const registered = useRef(new Set<string>())
  const client = () => new WorkerClient({ baseUrl: workerUrl, token: workerToken })

  useEffect(() => {
    if (!job || terminal.has(job.state)) return
    const timer = window.setTimeout(async () => { try { setJob(await client().ttsStatus(job.id)) } catch (cause) { setError(cause instanceof Error ? cause.message : 'TTS status failed') } }, 750)
    return () => window.clearTimeout(timer)
  }, [job, workerUrl, workerToken])

  useEffect(() => {
    if (job?.state !== 'succeeded' || registered.current.has(job.id)) return
    registered.current.add(job.id)
    try { onProjectChange(registerGeneratedVoice(project, job, submittedText)) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Voice registration failed') }
  }, [job, project, submittedText, onProjectChange])

  async function detect() { setError(''); try { const next = await client().listTtsVoices(); setVoices(next); setVoice(next[0] ?? ''); if (!next.length) setError('No configured Piper ONNX voice was found.') } catch (cause) { setError(cause instanceof Error ? cause.message : 'Voice discovery failed') } }
  async function generate() { setError(''); setSubmittedText(text.trim()); try { setJob(await client().startTts(text, voice)) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Voice generation failed to start') } }
  async function cancel() { if (job) setJob(await client().cancelTts(job.id)) }

  const available = workerConnected && workerCapabilities.includes('text-to-speech')
  const generated = project.assets.filter((asset) => asset.kind === 'audio' && asset.metadata.adapterId === 'piper')
  return <section className="stack"><div className="sectionLead"><div><div className="eyebrow">LOCAL VOICE STUDIO</div><h2>Audio</h2><p>Generate attributable voice locally with Piper, then place it explicitly on the timeline.</p></div><span className={available ? 'status online' : 'status'}>{available ? 'PIPER AVAILABLE' : 'NOT CONFIGURED'}</span></div>
    <div className="card audioStudio"><label>Voice text<textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="Enter narration…" /></label><label>Managed Piper voice<select value={voice} onChange={(event) => setVoice(event.target.value)}><option value="">Detect a voice first</option>{voices.map((path) => <option key={path} value={path}>{path.split('/').pop()}</option>)}</select></label><div className="directorActions"><button className="secondaryButton" disabled={!available || Boolean(job && !terminal.has(job.state))} onClick={detect}>Detect voices</button><button className="primary" disabled={!available || !voice || !text.trim() || Boolean(job && !terminal.has(job.state))} onClick={generate}>Generate locally</button>{job && !terminal.has(job.state) && <button className="dangerButton" onClick={cancel}>Cancel</button>}</div>{job && <div className="sttJob"><div><strong>{job.state}</strong><span>{Math.round(job.progress * 100)}%</span></div><div className="progressTrack"><div className="progressFill" style={{ width: `${job.progress * 100}%` }} /></div>{job.audioPath && <small>{(job.durationMs! / 1000).toFixed(2)}s · {job.audioPath}</small>}</div>}{error && <div className="errorBox">{error}</div>}</div>
    {generated.length > 0 && <div className="card generatedVoices"><div className="eyebrow">GENERATED VOICE ASSETS</div>{generated.map((asset) => <div key={asset.id}><span><strong>{String(asset.metadata.name)}</strong><small>{(Number(asset.metadata.durationMs) / 1000).toFixed(2)}s · {String(asset.metadata.voicePath).split('/').pop()}</small></span><AssetPlacementControl project={project} asset={asset} onProjectChange={onProjectChange} /></div>)}</div>}
  </section>
}
