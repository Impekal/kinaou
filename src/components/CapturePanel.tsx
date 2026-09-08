import { useEffect, useRef, useState } from 'react'
import { AssetPlacementControl } from './AssetPlacementControl'
import { SceneFulfillmentControl } from './SceneFulfillmentControl'
import { registerCapturedMedia } from '../core/capturedMedia'
import type { CaptureJobRecord, CaptureRequest } from '../core/captureJobs'
import type { KinaouProject } from '../core/project'
import type { PersistentVersionHistory } from '../core/versioning'
import { registerWebCapture } from '../core/webCaptures'
import type { WebCaptureBrowser, WebCaptureJobRecord } from '../core/webCaptureJobs'
import { WorkerClient } from '../core/workerClient'

interface Props { project: KinaouProject; history: PersistentVersionHistory; workerUrl: string; workerToken: string; workerConnected: boolean; workerCapabilities: string[]; onProjectChange: (project: KinaouProject) => void }
const terminal = new Set(['succeeded', 'failed', 'cancelled'])

interface WebCardProps { project: KinaouProject; workerConnected: boolean; workerCapabilities: string[]; client: () => WorkerClient; onProjectChange: (project: KinaouProject) => void }

function WebCaptureCard({ project, workerConnected, workerCapabilities, client, onProjectChange }: WebCardProps) {
  const [browsers, setBrowsers] = useState<WebCaptureBrowser[]>([])
  const [browserId, setBrowserId] = useState('')
  const [url, setUrl] = useState('')
  const [width, setWidth] = useState('1280')
  const [height, setHeight] = useState('800')
  const [job, setJob] = useState<WebCaptureJobRecord | null>(null)
  const [error, setError] = useState('')
  const registered = useRef(new Set<string>())

  useEffect(() => {
    if (!job || terminal.has(job.state)) return
    const timer = window.setTimeout(async () => { try { setJob(await client().webCaptureStatus(job.id)) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Web capture status failed'); setJob((previous) => previous ? { ...previous } : previous) } }, 750)
    return () => window.clearTimeout(timer)
  }, [job])

  useEffect(() => {
    if (job?.state !== 'succeeded' || registered.current.has(job.id)) return
    registered.current.add(job.id)
    try { onProjectChange(registerWebCapture(project, job)) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Web capture registration failed') }
  }, [job, project, onProjectChange])

  async function detect() {
    setError('')
    try {
      const next = await client().listWebCaptureBrowsers()
      setBrowsers(next)
      setBrowserId(next[0]?.id ?? '')
      if (!next.length) setError('No supported local browser (Chrome, Chromium or Firefox) was found on the worker machine.')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Browser detection failed') }
  }

  const widthValue = Number(width)
  const heightValue = Number(height)
  const dimensionsValid = [widthValue, heightValue].every((dimension) => Number.isInteger(dimension) && dimension >= 320 && dimension <= 4096)
  const available = workerConnected && workerCapabilities.includes('web-capture')
  const running = Boolean(job && !terminal.has(job.state))
  const canStart = available && Boolean(browserId) && /^https?:\/\//.test(url.trim()) && dimensionsValid && !running

  async function start() {
    setError('')
    try { setJob(await client().startWebCapture({ browserId, url: url.trim(), width: widthValue, height: heightValue })) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Web capture failed to start') }
  }

  async function cancel() { if (job) try { setJob(await client().cancelWebCapture(job.id)) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Web capture cancellation failed') } }

  return <div className="card imageStudio">
    <div><div className="eyebrow">WEBSITE CAPTURE</div><h3>Real screenshot of a web page</h3><p className="cardBody">A locally installed browser renders exactly the URL you enter, headless, and KINAOU keeps the real screenshot with URL/browser provenance. The browser will fetch this page (and its own resources) from the network — nothing else. Reproducible: run it again anytime.</p></div>
    <div className="directorActions"><button className="secondaryButton" disabled={!workerConnected || running} onClick={detect}>Detect browsers</button>{browsers.length > 0 && <small>{browsers.length} local browser{browsers.length === 1 ? '' : 's'} found</small>}</div>
    <label>Browser<select value={browserId} onChange={(event) => setBrowserId(event.target.value)}><option value="">Detect browsers first</option>{browsers.map((browser) => <option key={browser.id} value={browser.id}>{browser.label}{browser.version ? ` · ${browser.version}` : ''}</option>)}</select></label>
    <label>Page URL<input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.org/docs" /></label>
    <div className="formRow">
      <label>Width<input value={width} onChange={(event) => setWidth(event.target.value)} inputMode="numeric" /></label>
      <label>Height<input value={height} onChange={(event) => setHeight(event.target.value)} inputMode="numeric" /></label>
    </div>
    <div className="directorActions"><button className="primary" disabled={!canStart} onClick={start}>Capture web page</button>{running && <button className="dangerButton" onClick={cancel}>Cancel</button>}</div>
    {job && <div className="sttJob"><div><strong>{job.state}</strong><span>{Math.round(job.progress * 100)}%</span></div><div className="progressTrack"><div className="progressFill" style={{ width: `${job.progress * 100}%` }} /></div>{job.imagePath && <small>{job.imagePath} · {job.provenance.url}</small>}{job.state === 'failed' && job.error && <small>{job.error}</small>}</div>}
    {error && <div className="errorBox">{error}</div>}
  </div>
}

export function CapturePanel({ project, history, workerUrl, workerToken, workerConnected, workerCapabilities, onProjectChange }: Props) {
  const [kind, setKind] = useState<'screenshot' | 'recording'>('screenshot')
  const [selection, setSelection] = useState<'display' | 'interactive' | 'app'>('display')
  const [appName, setAppName] = useState('')
  const [displayId, setDisplayId] = useState('1')
  const [delaySeconds, setDelaySeconds] = useState('3')
  const [durationSeconds, setDurationSeconds] = useState('60')
  const [job, setJob] = useState<CaptureJobRecord | null>(null)
  const [error, setError] = useState('')
  const registered = useRef(new Set<string>())
  const client = () => new WorkerClient({ baseUrl: workerUrl, token: workerToken })

  useEffect(() => {
    if (!job || terminal.has(job.state)) return
    const timer = window.setTimeout(async () => { try { setJob(await client().captureStatus(job.id)) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Capture status failed'); setJob((previous) => previous ? { ...previous } : previous) } }, 750)
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
  const appTarget = selection === 'app'
  const available = workerConnected && workerCapabilities.includes('screen-capture')
  const running = Boolean(job && !terminal.has(job.state))
  const durationOk = kind === 'screenshot' || durationValid
  const canStart = available && !running && (interactive || (appTarget ? Boolean(appName.trim()) && durationOk : displayValid && (kind === 'screenshot' ? delayValid : durationValid)))

  async function start() {
    setError('')
    const request: CaptureRequest = interactive
      ? { kind: 'screenshot', interactive: true }
      : appTarget
        ? { kind, appName: appName.trim(), ...(kind === 'recording' ? { durationMs: durationValue * 1000 } : {}) }
        : kind === 'screenshot'
          ? { kind, displayId: displayValue, delaySeconds: delayValue }
          : { kind, displayId: displayValue, durationMs: durationValue * 1000 }
    try { setJob(await client().startCapture(request)) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Capture failed to start') }
  }

  async function stop() { if (job) try { setJob(await client().stopCapture(job.id)) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Capture stop failed') } }
  async function cancel() { if (job) try { setJob(await client().cancelCapture(job.id)) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Capture cancellation failed') } }

  const captured = project.assets.filter((asset) => asset.metadata.captured === true)

  return <section className="stack">
    <div className="sectionLead"><div><div className="eyebrow">REAL SCREEN CAPTURE</div><h2>Capture</h2><p>Records your actual screen — nothing is generated. Every capture starts only when you explicitly click, and macOS asks once for Screen Recording permission for the process running the worker.</p></div><span className={available ? 'status online' : 'status'}>{available ? 'CAPTURE AVAILABLE' : 'NOT AVAILABLE'}</span></div>
    <div className="card imageStudio">
      {!available && <p className="cardBody">Screen capture requires a connected worker on macOS with the built-in screencapture tool. {workerConnected ? 'The connected worker does not advertise screen-capture.' : 'Connect the worker in Settings first.'}</p>}
      <div className="formRow">
        <label>Type<select value={kind} onChange={(event) => { const next = event.target.value as 'screenshot' | 'recording'; setKind(next); if (next === 'recording' && selection === 'interactive') setSelection('display') }}><option value="screenshot">Screenshot</option><option value="recording">Screen recording</option></select></label>
        <label>Target<select value={selection} onChange={(event) => setSelection(event.target.value as 'display' | 'interactive' | 'app')}><option value="display">Entire display</option>{kind === 'screenshot' && <option value="interactive">Pick window or area on screen</option>}<option value="app">App window by name</option></select></label>
        {appTarget && <label>App name<input value={appName} onChange={(event) => setAppName(event.target.value)} placeholder="e.g. Firefox" /></label>}
        {!interactive && !appTarget && <label>Display<input value={displayId} onChange={(event) => setDisplayId(event.target.value)} inputMode="numeric" /></label>}
        {kind === 'screenshot' && !interactive && !appTarget && <label>Delay (s)<input value={delaySeconds} onChange={(event) => setDelaySeconds(event.target.value)} inputMode="numeric" /></label>}
        {kind === 'recording' && <label>Max duration (s)<input value={durationSeconds} onChange={(event) => setDurationSeconds(event.target.value)} inputMode="numeric" /></label>}
      </div>
      <p className="cardBody">{interactive ? 'Your Mac cursor becomes a crosshair: drag an area, or press Space and click a window. Escape cancels without capturing.' : appTarget ? 'KINAOU brings the named app to the front (launching it if needed), reads its front window position via System Events, and captures exactly that window region. macOS asks once for Automation/Accessibility permission.' : kind === 'screenshot' ? 'The delay gives you time to bring the window you want to capture to the front.' : 'The recording stops automatically at the maximum duration; Stop keeps what was recorded so far, Discard deletes it.'}</p>
      <div className="directorActions">
        <button className="primary" disabled={!canStart} onClick={start}>{interactive ? 'Select on screen & capture' : kind === 'screenshot' ? 'Capture screenshot' : 'Start recording'}</button>
        {running && job?.kind === 'recording' && <button className="secondaryButton" onClick={stop}>Stop &amp; keep</button>}
        {running && <button className="dangerButton" onClick={cancel}>Discard</button>}
      </div>
      {job && <div className="sttJob"><div><strong>{job.state}</strong><span>{Math.round(job.progress * 100)}%</span></div><div className="progressTrack"><div className="progressFill" style={{ width: `${job.progress * 100}%` }} /></div>{job.capturePath && <small>{job.capturePath}{job.durationMs ? ` · ${(job.durationMs / 1000).toFixed(2)}s` : ''}</small>}{job.state === 'failed' && job.error && <small>{job.error}</small>}</div>}
      {error && <div className="errorBox">{error}</div>}
    </div>
    <WebCaptureCard project={project} workerConnected={workerConnected} workerCapabilities={workerCapabilities} client={client} onProjectChange={onProjectChange} />
    {captured.length > 0 && <div className="card generatedImages"><div className="eyebrow">CAPTURED MEDIA</div><p className="cardBody">These are real captures with capture provenance — kept strictly apart from generated visuals.</p>{captured.map((asset) => <div key={asset.id}><span><strong>{String(asset.metadata.name)}</strong><small>REAL CAPTURE · {asset.metadata.captureMethod === 'headless-browser' ? String(asset.metadata.url) : asset.metadata.appName ? `app ${String(asset.metadata.appName)}` : `display ${String(asset.metadata.displayId)}`}{asset.metadata.durationMs ? ` · ${(Number(asset.metadata.durationMs) / 1000).toFixed(2)}s` : ''}</small></span><div className="stackControls"><SceneFulfillmentControl project={project} history={history} asset={asset} onProjectChange={onProjectChange} onError={setError} /><AssetPlacementControl project={project} asset={asset} onProjectChange={onProjectChange} /></div></div>)}</div>}
  </section>
}
