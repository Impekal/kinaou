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
import { useUiLanguage } from './UiLanguageProvider'
import { resolveUiMessage } from '../core/uiMessages'

interface Props { project: KinaouProject; history: PersistentVersionHistory; workerUrl: string; workerToken: string; workerConnected: boolean; workerCapabilities: string[]; onProjectChange: (project: KinaouProject) => void }
const terminal = new Set(['succeeded', 'failed', 'cancelled'])

export const captureStateKeys = {
  queued: 'capture.state.queued',
  running: 'capture.state.running',
  succeeded: 'capture.state.succeeded',
  failed: 'capture.state.failed',
  cancelled: 'capture.state.cancelled',
} as const

interface WebCardProps { project: KinaouProject; workerConnected: boolean; workerCapabilities: string[]; client: () => WorkerClient; onProjectChange: (project: KinaouProject) => void }

function WebCaptureCard({ project, workerConnected, workerCapabilities, client, onProjectChange }: WebCardProps) {
  const { t, language } = useUiLanguage()
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
    const timer = window.setTimeout(async () => {
      try { setJob(await client().webCaptureStatus(job.id)) }
      catch (cause) { setError(cause instanceof Error ? cause.message : t('capture.web.error.status')); setJob((previous) => previous ? { ...previous } : previous) }
    }, 750)
    return () => window.clearTimeout(timer)
  }, [job])

  useEffect(() => {
    if (job?.state !== 'succeeded' || registered.current.has(job.id)) return
    registered.current.add(job.id)
    try { onProjectChange(registerWebCapture(project, job)) }
    catch (cause) { setError(cause instanceof Error ? cause.message : t('capture.web.error.registration')) }
  }, [job, project, onProjectChange])

  async function detect() {
    setError('')
    try {
      const next = await client().listWebCaptureBrowsers()
      setBrowsers(next)
      setBrowserId(next[0]?.id ?? '')
      if (!next.length) setError(t('capture.web.error.none'))
    } catch (cause) { setError(cause instanceof Error ? cause.message : t('capture.web.error.detect')) }
  }

  const widthValue = Number(width)
  const heightValue = Number(height)
  const dimensionsValid = [widthValue, heightValue].every((dimension) => Number.isInteger(dimension) && dimension >= 320 && dimension <= 4096)
  const available = workerConnected && workerCapabilities.includes('web-capture')
  const running = Boolean(job && !terminal.has(job.state))
  const canStart = available && Boolean(browserId) && /^https?:\/\//.test(url.trim()) && dimensionsValid && !running

  async function start() {
    setError('')
    try { setJob(await client().startWebCapture({ browserId, url: url.trim(), width: widthValue, height: heightValue })) }
    catch (cause) { setError(cause instanceof Error ? cause.message : t('capture.web.error.start')) }
  }

  async function cancel() {
    if (!job) return
    try { setJob(await client().cancelWebCapture(job.id)) }
    catch (cause) { setError(cause instanceof Error ? cause.message : t('capture.web.error.cancel')) }
  }

  return <div className="card imageStudio">
    <div><div className="eyebrow">{t('capture.web.eyebrow')}</div><h3>{t('capture.web.heading')}</h3><p className="cardBody">{t('capture.web.help')}</p></div>
    <div className="directorActions"><button className="secondaryButton" disabled={!workerConnected || running} onClick={detect}>{t('capture.web.detect')}</button>{browsers.length > 0 && <small>{t(browsers.length === 1 ? 'capture.web.foundOne' : 'capture.web.foundMany', { count: browsers.length })}</small>}</div>
    <label>{t('capture.web.browser')}<select value={browserId} onChange={(event) => setBrowserId(event.target.value)}><option value="">{t('capture.web.detectFirst')}</option>{browsers.map((browser) => <option key={browser.id} value={browser.id}>{browser.label}{browser.version ? ` · ${browser.version}` : ''}</option>)}</select></label>
    <label>{t('capture.web.url')}<input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.org/docs" /></label>
    <div className="formRow">
      <label>{t('capture.web.width')}<input value={width} onChange={(event) => setWidth(event.target.value)} inputMode="numeric" /></label>
      <label>{t('capture.web.height')}<input value={height} onChange={(event) => setHeight(event.target.value)} inputMode="numeric" /></label>
    </div>
    <div className="directorActions"><button className="primary" disabled={!canStart} onClick={start}>{t('capture.web.start')}</button>{running && <button className="dangerButton" onClick={cancel}>{t('capture.web.cancel')}</button>}</div>
    {job && <div className="sttJob"><div><strong>{t(captureStateKeys[job.state])}</strong><span>{Math.round(job.progress * 100)}%</span></div><div className="progressTrack"><div className="progressFill" style={{ width: `${job.progress * 100}%` }} /></div>{job.imagePath && <small>{job.imagePath} · {job.provenance.url}</small>}{job.state === 'failed' && job.error && <small>{job.error}</small>}</div>}
    {error && <div className="errorBox">{resolveUiMessage(language, error)}</div>}
  </div>
}

export function CapturePanel({ project, history, workerUrl, workerToken, workerConnected, workerCapabilities, onProjectChange }: Props) {
  const { t, language } = useUiLanguage()
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
    const timer = window.setTimeout(async () => {
      try { setJob(await client().captureStatus(job.id)) }
      catch (cause) { setError(cause instanceof Error ? cause.message : t('capture.error.status')); setJob((previous) => previous ? { ...previous } : previous) }
    }, 750)
    return () => window.clearTimeout(timer)
  }, [job, workerUrl, workerToken])

  useEffect(() => {
    if (job?.state !== 'succeeded' || registered.current.has(job.id)) return
    registered.current.add(job.id)
    try { onProjectChange(registerCapturedMedia(project, job)) }
    catch (cause) { setError(cause instanceof Error ? cause.message : t('capture.error.registration')) }
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
    try { setJob(await client().startCapture(request)) }
    catch (cause) { setError(cause instanceof Error ? cause.message : t('capture.error.start')) }
  }

  async function stop() {
    if (!job) return
    try { setJob(await client().stopCapture(job.id)) }
    catch (cause) { setError(cause instanceof Error ? cause.message : t('capture.error.stop')) }
  }

  async function cancel() {
    if (!job) return
    try { setJob(await client().cancelCapture(job.id)) }
    catch (cause) { setError(cause instanceof Error ? cause.message : t('capture.error.cancel')) }
  }

  const captured = project.assets.filter((asset) => asset.metadata.captured === true)

  return <section className="stack">
    <div className="sectionLead"><div><div className="eyebrow">{t('capture.eyebrow')}</div><h2>{t('capture.heading')}</h2><p>{t('capture.help')}</p></div><span className={available ? 'status online' : 'status'}>{t(available ? 'capture.available' : 'capture.unavailable')}</span></div>
    <div className="card imageStudio">
      {!available && <p className="cardBody">{t(workerConnected ? 'capture.unavailableCapability' : 'capture.unavailableDisconnected')}</p>}
      <div className="formRow">
        <label>{t('capture.type')}<select value={kind} onChange={(event) => { const next = event.target.value as 'screenshot' | 'recording'; setKind(next); if (next === 'recording' && selection === 'interactive') setSelection('display') }}><option value="screenshot">{t('capture.type.screenshot')}</option><option value="recording">{t('capture.type.recording')}</option></select></label>
        <label>{t('capture.target')}<select value={selection} onChange={(event) => setSelection(event.target.value as 'display' | 'interactive' | 'app')}><option value="display">{t('capture.target.display')}</option>{kind === 'screenshot' && <option value="interactive">{t('capture.target.interactive')}</option>}<option value="app">{t('capture.target.app')}</option></select></label>
        {appTarget && <label>{t('capture.appName')}<input value={appName} onChange={(event) => setAppName(event.target.value)} placeholder={t('capture.appPlaceholder')} /></label>}
        {!interactive && !appTarget && <label>{t('capture.display')}<input value={displayId} onChange={(event) => setDisplayId(event.target.value)} inputMode="numeric" /></label>}
        {kind === 'screenshot' && !interactive && !appTarget && <label>{t('capture.delay')}<input value={delaySeconds} onChange={(event) => setDelaySeconds(event.target.value)} inputMode="numeric" /></label>}
        {kind === 'recording' && <label>{t('capture.maxDuration')}<input value={durationSeconds} onChange={(event) => setDurationSeconds(event.target.value)} inputMode="numeric" /></label>}
      </div>
      <p className="cardBody">{t(interactive ? 'capture.help.interactive' : appTarget ? 'capture.help.app' : kind === 'screenshot' ? 'capture.help.screenshot' : 'capture.help.recording')}</p>
      <div className="directorActions">
        <button className="primary" disabled={!canStart} onClick={start}>{t(interactive ? 'capture.startInteractive' : kind === 'screenshot' ? 'capture.startScreenshot' : 'capture.startRecording')}</button>
        {running && job?.kind === 'recording' && <button className="secondaryButton" onClick={stop}>{t('capture.stopKeep')}</button>}
        {running && <button className="dangerButton" onClick={cancel}>{t('capture.discard')}</button>}
      </div>
      {job && <div className="sttJob"><div><strong>{t(captureStateKeys[job.state])}</strong><span>{Math.round(job.progress * 100)}%</span></div><div className="progressTrack"><div className="progressFill" style={{ width: `${job.progress * 100}%` }} /></div>{job.capturePath && <small>{job.capturePath}{job.durationMs ? ` · ${t('capture.library.duration', { seconds: (job.durationMs / 1000).toFixed(2) })}` : ''}</small>}{job.state === 'failed' && job.error && <small>{job.error}</small>}</div>}
      {error && <div className="errorBox">{resolveUiMessage(language, error)}</div>}
    </div>
    <WebCaptureCard project={project} workerConnected={workerConnected} workerCapabilities={workerCapabilities} client={client} onProjectChange={onProjectChange} />
    {captured.length > 0 && <div className="card generatedImages"><div className="eyebrow">{t('capture.library.eyebrow')}</div><p className="cardBody">{t('capture.library.help')}</p>{captured.map((asset) => <div key={asset.id}><span><strong>{String(asset.metadata.name)}</strong><small>{t('capture.library.real')} · {asset.metadata.captureMethod === 'headless-browser' ? t('capture.library.web', { url: String(asset.metadata.url) }) : asset.metadata.appName ? t('capture.library.app', { name: String(asset.metadata.appName) }) : t('capture.library.display', { id: String(asset.metadata.displayId) })}{asset.metadata.durationMs ? ` · ${t('capture.library.duration', { seconds: (Number(asset.metadata.durationMs) / 1000).toFixed(2) })}` : ''}</small></span><div className="stackControls"><SceneFulfillmentControl project={project} history={history} asset={asset} onProjectChange={onProjectChange} onError={setError} /><AssetPlacementControl project={project} asset={asset} onProjectChange={onProjectChange} /></div></div>)}</div>}
  </section>
}
