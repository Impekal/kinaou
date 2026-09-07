import { useEffect, useRef, useState } from 'react'
import { AssetPlacementControl } from './AssetPlacementControl'
import { SceneFulfillmentControl } from './SceneFulfillmentControl'
import { registerCapturedMedia } from '../core/capturedMedia'
import type { CaptureJobRecord, CaptureRequest } from '../core/captureJobs'
import type { KinaouProject } from '../core/project'
import type { PersistentVersionHistory } from '../core/versioning'
import { WorkerClient } from '../core/workerClient'

interface Props { project: KinaouProject; history: PersistentVersionHistory; workerUrl: string; workerToken: string; workerConnected: boolean; workerCapabilities: string[]; onProjectChange: (project: KinaouProject) => void }
const terminal = new Set(['succeeded', 'failed', 'cancelled'])

export function CapturePanel({ project, history, workerUrl, workerToken, workerConnected, workerCapabilities, onProjectChange }: Props) {
  const [kind, setKind] = useState<'screenshot' | 'recording'>('screenshot')
  const [selection, setSelection] = useState<'display' | 'interactive'>('display')
  const [displayId, setDisplayId] = useState('1')
  const [delaySeconds, setDelaySeconds] = useState('3')
  const [durationSeconds, setDurationSeconds] = useState('60')
  const [job, setJob] = useState<CaptureJobRecord | null>(null)
  const [error, setError] = useState('')
  const registered = useRef(new Set<string>())
  const client = () => new WorkerClient({ baseUrl: workerUrl, token: workerToken })

  useEffect(() => {
    if (!job || terminal.has(job.state)) return
    const timer = window.setTimeout(async () => { try { setJob(await client().captureStatus(job.id)) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Capture status failed') } }, 750)
    return () => window.clearTimeout(timer)
  }, [job, workerUrl, workerToken])

  useEffect(() => {
    if (job?.state !== 'succeeded' || registered.current.has(job.id)) return
    registered.current.add(job.id)
    try { onProjectChange(registerCapturedMedia(project, job)) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Capture registration failed') }
  }, [job, project, onProjectChange])

  const displayValue = Number(displayId)
  const delayValue = Number(delaySeconds)
  const durationValue = Number(durationSeconds)
  const displayValid = Number.isInteger(displayValue) && displayValue >= 1 && displayValue <= 16
  const delayValid = Number.isInteger(delayValue) && delayValue >= 0 && delayValue <= 10
  const durationValid = Number.isInteger(durationValue) && durationValue >= 1 && durationValue <= 600
  const interactive = kind === 'screenshot' && selection === 'interactive'
  const available = workerConnected && workerCapabilities.includes('screen-capture')
  const running = Boolean(job && !terminal.has(job.state))
  const canStart = available && !running && (interactive || (displayValid && (kind === 'screenshot' ? delayValid : durationValid)))

  async function start() {
    setError('')
    const request: CaptureRequest = interactive
      ? { kind: 'screenshot', interactive: true }
      : kind === 'screenshot'
        ? { kind, displayId: displayValue, delaySeconds: delayValue }
        : { kind, displayId: displayValue, durationMs: durationValue * 1000 }
    try { setJob(await client().startCapture(request)) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Capture failed to start') }
  }

  async function stop() { if (job) try { setJob(await client().stopCapture(job.id)) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Capture stop failed') } }
  async function cancel() { if (job) try { setJob(await client().cancelCapture(job.id)) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Capture cancellation failed') } }

  const captured = project.assets.filter((asset) => asset.metadata.captured === true && asset.metadata.captureMethod === 'macos-screencapture')

  return <section className="stack">
    <div className="sectionLead"><div><div className="eyebrow">REAL SCREEN CAPTURE</div><h2>Capture</h2><p>Records your actual screen — nothing is generated. Every capture starts only when you explicitly click, and macOS asks once for Screen Recording permission for the process running the worker.</p></div><span className={available ? 'status online' : 'status'}>{available ? 'CAPTURE AVAILABLE' : 'NOT AVAILABLE'}</span></div>
    <div className="card imageStudio">
      {!available && <p className="cardBody">Screen capture requires a connected worker on macOS with the built-in screencapture tool. {workerConnected ? 'The connected worker does not advertise screen-capture.' : 'Connect the worker in Settings first.'}</p>}
      <div className="formRow">
        <label>Type<select value={kind} onChange={(event) => setKind(event.target.value as 'screenshot' | 'recording')}><option value="screenshot">Screenshot</option><option value="recording">Screen recording</option></select></label>
        {kind === 'screenshot' && <label>Target<select value={selection} onChange={(event) => setSelection(event.target.value as 'display' | 'interactive')}><option value="display">Entire display</option><option value="interactive">Pick window or area on screen</option></select></label>}
        {!interactive && <label>Display<input value={displayId} onChange={(event) => setDisplayId(event.target.value)} inputMode="numeric" /></label>}
        {kind === 'screenshot' && !interactive && <label>Delay (s)<input value={delaySeconds} onChange={(event) => setDelaySeconds(event.target.value)} inputMode="numeric" /></label>}
        {kind === 'recording' && <label>Max duration (s)<input value={durationSeconds} onChange={(event) => setDurationSeconds(event.target.value)} inputMode="numeric" /></label>}
      </div>
      <p className="cardBody">{interactive ? 'Your Mac cursor becomes a crosshair: drag an area, or press Space and click a window. Escape cancels without capturing.' : kind === 'screenshot' ? 'The delay gives you time to bring the window you want to capture to the front.' : 'The recording stops automatically at the maximum duration; Stop keeps what was recorded so far, Discard deletes it.'}</p>
      <div className="directorActions">
        <button className="primary" disabled={!canStart} onClick={start}>{interactive ? 'Select on screen & capture' : kind === 'screenshot' ? 'Capture screenshot' : 'Start recording'}</button>
        {running && job?.kind === 'recording' && <button className="secondaryButton" onClick={stop}>Stop &amp; keep</button>}
        {running && <button className="dangerButton" onClick={cancel}>Discard</button>}
      </div>
      {job && <div className="sttJob"><div><strong>{job.state}</strong><span>{Math.round(job.progress * 100)}%</span></div><div className="progressTrack"><div className="progressFill" style={{ width: `${job.progress * 100}%` }} /></div>{job.capturePath && <small>{job.capturePath}{job.durationMs ? ` · ${(job.durationMs / 1000).toFixed(2)}s` : ''}</small>}{job.state === 'failed' && job.error && <small>{job.error}</small>}</div>}
      {error && <div className="errorBox">{error}</div>}
    </div>
    {captured.length > 0 && <div className="card generatedImages"><div className="eyebrow">CAPTURED MEDIA</div><p className="cardBody">These are real captures of your screen with capture provenance — kept strictly apart from generated visuals.</p>{captured.map((asset) => <div key={asset.id}><span><strong>{String(asset.metadata.name)}</strong><small>REAL CAPTURE · display {String(asset.metadata.displayId)}{asset.metadata.durationMs ? ` · ${(Number(asset.metadata.durationMs) / 1000).toFixed(2)}s` : ''}</small></span><div className="stackControls"><SceneFulfillmentControl project={project} history={history} asset={asset} onProjectChange={onProjectChange} onError={setError} /><AssetPlacementControl project={project} asset={asset} onProjectChange={onProjectChange} /></div></div>)}</div>}
  </section>
}
