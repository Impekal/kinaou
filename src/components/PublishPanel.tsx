import { useEffect, useMemo, useState } from 'react'
import { projectExportHistory } from '../core/exportHistory'
import { buildPublishPackageRequest, clearProjectPublishDefaults, projectPublishDefaults, publishPreflightMatchesReceipt, publishTargetLabels, saveProjectPublishDefaults, type PublishPackageEntry, type PublishPackageResult, type PublishPreflightResult, type PublishTarget } from '../core/publishPackage'
import type { KinaouProject } from '../core/project'
import { WorkerClient } from '../core/workerClient'

interface PublishPanelProps {
  project: KinaouProject
  workerUrl: string
  workerToken: string
  workerConnected: boolean
  workerCapabilities: string[]
  onProjectChange: (project: KinaouProject) => void
}

export function PublishPanel({ project, workerUrl, workerToken, workerConnected, workerCapabilities, onProjectChange }: PublishPanelProps) {
  const receipts = useMemo(() => projectExportHistory(project), [project])
  const savedDefaults = projectPublishDefaults(project)
  const [selectedJobId, setSelectedJobId] = useState(() => receipts[0]?.jobId ?? '')
  const [platform, setPlatform] = useState<PublishTarget>(() => savedDefaults?.platform ?? 'youtube')
  const [title, setTitle] = useState(() => savedDefaults?.title ?? project.title)
  const [description, setDescription] = useState(() => savedDefaults?.description ?? '')
  const [tags, setTags] = useState(() => savedDefaults?.tags.join(', ') ?? '')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<PublishPackageResult | null>(null)
  const [preflight, setPreflight] = useState<PublishPreflightResult | null>(null)
  const [preflightBusy, setPreflightBusy] = useState(false)
  const [error, setError] = useState('')
  const [packages, setPackages] = useState<PublishPackageEntry[] | null>(null)
  const [listBusy, setListBusy] = useState(false)
  const [listError, setListError] = useState('')
  const [libraryMessage, setLibraryMessage] = useState('')
  const [defaultsMessage, setDefaultsMessage] = useState('')
  const selected = receipts.find((receipt) => receipt.jobId === selectedJobId) ?? receipts[0]
  const packageSupported = workerCapabilities.includes('publish-package')
  const preflightSupported = workerCapabilities.includes('publish-preflight')
  const librarySupported = workerCapabilities.includes('publish-package-library')
  const currentPreflight = publishPreflightMatchesReceipt(preflight, selected) ? preflight : null
  const operationBusy = busy || preflightBusy

  useEffect(() => {
    const defaults = projectPublishDefaults(project)
    setSelectedJobId(receipts[0]?.jobId ?? '')
    setPlatform(defaults?.platform ?? 'youtube')
    setTitle(defaults?.title ?? project.title)
    setDescription(defaults?.description ?? '')
    setTags(defaults?.tags.join(', ') ?? '')
    setResult(null)
    setPreflight(null)
    setPreflightBusy(false)
    setError('')
    setPackages(null)
    setListError('')
    setLibraryMessage('')
    setDefaultsMessage('')
  }, [project.id])

  useEffect(() => {
    setPreflight(null)
    setResult(null)
    setError('')
  }, [selected?.jobId, selected?.outputRelativePath])

  function useSavedDefaults() {
    if (!savedDefaults) return
    setPlatform(savedDefaults.platform)
    setTitle(savedDefaults.title)
    setDescription(savedDefaults.description)
    setTags(savedDefaults.tags.join(', '))
    setResult(null)
    setError('')
    setDefaultsMessage('Saved project defaults loaded into the form.')
  }

  function saveDefaults() {
    try {
      const next = saveProjectPublishDefaults(project, { platform, title, description, tags })
      onProjectChange(next)
      setError('')
      setDefaultsMessage(next === project ? 'These values are already the saved project defaults.' : 'Current publish metadata saved with this project.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save publish defaults')
    }
  }

  function clearDefaults() {
    const next = clearProjectPublishDefaults(project)
    onProjectChange(next)
    setDefaultsMessage('Saved project defaults cleared. The current form was kept.')
  }

  async function refreshPackages(client = new WorkerClient({ baseUrl: workerUrl, token: workerToken })) {
    if (!workerConnected || !librarySupported || !workerToken.trim() || listBusy) return
    setListBusy(true)
    setListError('')
    try {
      setPackages(await client.listPublishPackages(project.id))
    } catch (cause) {
      setListError(cause instanceof Error ? cause.message : 'Could not load local publish packages')
    } finally {
      setListBusy(false)
    }
  }

  async function createPackage() {
    if (!selected || !workerConnected || !packageSupported || !preflightSupported || !currentPreflight?.ready || operationBusy) return
    setBusy(true)
    setError('')
    setResult(null)
    try {
      const request = buildPublishPackageRequest(project, selected, { platform, title, description, tags })
      const client = new WorkerClient({ baseUrl: workerUrl, token: workerToken })
      setResult(await client.createPublishPackage(request))
      await refreshPackages(client)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create publish package')
    } finally {
      setBusy(false)
    }
  }

  async function checkPreflight() {
    if (!selected || !workerConnected || !preflightSupported || !workerToken.trim() || operationBusy) return
    setPreflightBusy(true)
    setPreflight(null)
    setResult(null)
    setError('')
    try {
      setPreflight(await new WorkerClient({ baseUrl: workerUrl, token: workerToken }).preflightPublishExport(selected))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not inspect export media')
    } finally {
      setPreflightBusy(false)
    }
  }

  function openPackage(entry: PublishPackageEntry) {
    const document = entry.document
    const matchingReceipt = receipts.find((receipt) => receipt.jobId === document.media.jobId && receipt.outputRelativePath === document.media.outputRelativePath)
    if (matchingReceipt) setSelectedJobId(matchingReceipt.jobId)
    setPlatform(document.platform)
    setTitle(document.title)
    setDescription(document.description)
    setTags(document.tags.join(', '))
    setResult(null)
    setError('')
    setLibraryMessage(matchingReceipt
      ? `Opened ${entry.path}. Its recorded export and metadata are selected above.`
      : `Opened metadata from ${entry.path}. Its original export is no longer in this project's recorded history, so the current export selection was kept.`)
  }

  return (
    <section className="stack">
      <div className="sectionLead"><div><div className="eyebrow">LOCAL PUBLISH HANDOFF</div><h2>Prepare a finished export</h2></div><span className={packageSupported && preflightSupported ? 'status online' : 'status'}>{packageSupported && preflightSupported ? 'PREFLIGHT READY' : workerConnected ? 'FFPROBE / RESTART NEEDED' : 'WORKER OFFLINE'}</span></div>
      <div className="card settingsPanel">
        <div>
          <h3>MP4 plus attributable metadata</h3>
          <p>Select a successful KINAOU export. The worker reads the MP4 with ffprobe and checks its size, video stream, output dimensions and duration before it can write a JSON sidecar beside it in <code>KINAOU/Renders</code>. It never uploads, publishes, changes or deletes the video.</p>
          {selected && <div className="note"><strong>{selected.label}</strong><br />{selected.format} · {(selected.durationMs / 1000).toFixed(1)} s<br /><code>{selected.outputRelativePath}</code></div>}
        </div>
        <div className="formStack">
          <label>Successful export<select value={selected?.jobId ?? ''} disabled={!receipts.length || operationBusy} onChange={(event) => { setSelectedJobId(event.target.value); setResult(null); setPreflight(null) }}>
            {!receipts.length && <option value="">No successful exports recorded</option>}
            {receipts.map((receipt) => <option key={receipt.jobId} value={receipt.jobId}>{receipt.label} · {receipt.format} · {new Date(receipt.completedAt).toLocaleString()}</option>)}
          </select></label>
          <label>Destination profile<select value={platform} disabled={operationBusy} onChange={(event) => { setPlatform(event.target.value as PublishTarget); setResult(null) }}>
            {(Object.keys(publishTargetLabels) as PublishTarget[]).map((target) => <option key={target} value={target}>{publishTargetLabels[target]}</option>)}
          </select></label>
          <label>Title<input maxLength={200} value={title} disabled={operationBusy} onChange={(event) => { setTitle(event.target.value); setResult(null) }} /></label>
          <label>Description<textarea maxLength={5000} value={description} disabled={operationBusy} onChange={(event) => { setDescription(event.target.value); setResult(null) }} /></label>
          <label>Tags, comma or line separated<input value={tags} disabled={operationBusy} placeholder="tutorial, local AI, editing" onChange={(event) => { setTags(event.target.value); setResult(null) }} /></label>
          <div className="publishDefaultActions"><button className="secondaryButton" disabled={operationBusy || !title.trim()} onClick={saveDefaults}>Save as project defaults</button>{savedDefaults && <><button className="secondaryButton" disabled={operationBusy} onClick={useSavedDefaults}>Use saved defaults</button><button className="secondaryButton" disabled={operationBusy} onClick={clearDefaults}>Clear saved defaults</button></>}</div>
          {savedDefaults && <small>Saved for this project · {publishTargetLabels[savedDefaults.platform]} · updated {new Date(savedDefaults.updatedAt).toLocaleString()}</small>}
          {defaultsMessage && <div className="note">{defaultsMessage}</div>}
          <button className="secondaryButton" disabled={!selected || !workerConnected || !preflightSupported || !workerToken.trim() || operationBusy} onClick={checkPreflight}>{preflightBusy ? 'Inspecting MP4…' : currentPreflight ? 'Refresh export preflight' : 'Check export file'}</button>
          <button className="primary" disabled={!selected || !workerConnected || !packageSupported || !preflightSupported || !currentPreflight?.ready || !workerToken.trim() || !title.trim() || operationBusy} onClick={createPackage}>{busy ? 'Rechecking and writing…' : 'Create local publish package'}</button>
          {!workerConnected && <small>Connect the local worker in Settings first.</small>}
          {workerConnected && (!packageSupported || !preflightSupported) && <small>Publish preflight needs ffprobe and the worker from this KINAOU build. Install ffprobe if missing, restart the worker and reconnect.</small>}
          {!receipts.length && <small>Complete a render export first; previews are intentionally not publishable.</small>}
        </div>
      </div>
      {currentPreflight && <div className="card availabilityPanel">
        <div className="sectionLead"><div><div className="eyebrow">EXPORT PREFLIGHT</div><h3>{currentPreflight.ready ? 'MP4 matches its export receipt' : 'MP4 does not match its export receipt'}</h3></div><span className={currentPreflight.ready ? 'status online' : 'status missing'}>{currentPreflight.ready ? 'READY FOR HANDOFF' : 'HANDOFF BLOCKED'}</span></div>
        <p>Expected {currentPreflight.expected.width}×{currentPreflight.expected.height} · {(currentPreflight.expected.durationMs / 1000).toFixed(3)} s. Found {currentPreflight.actual.width && currentPreflight.actual.height ? `${currentPreflight.actual.width}×${currentPreflight.actual.height}` : 'no usable video dimensions'} · {currentPreflight.actual.durationMs === undefined ? 'unknown duration' : `${(currentPreflight.actual.durationMs / 1000).toFixed(3)} s`} · {currentPreflight.actual.videoCodec ?? 'no video stream'} · {currentPreflight.actual.audioCodec ? `${currentPreflight.actual.audioCodec} audio` : 'no audio stream (allowed)'}.</p>
        <div className="publishPreflightChecks">
          {([['size', 'File size'], ['videoStream', 'Video stream'], ['dimensions', 'Output dimensions'], ['duration', `Duration (±${currentPreflight.durationToleranceMs} ms)`]] as const).map(([id, label]) => <span className={currentPreflight.checks[id] ? 'badge' : 'badge offline'} key={id}>{currentPreflight.checks[id] ? 'PASS' : 'FAIL'} · {label}</span>)}
        </div>
        <small>Checked {new Date(currentPreflight.checkedAt).toLocaleString()} · {(currentPreflight.actual.sizeBytes / 1024 / 1024).toFixed(1)} MB · the worker checks again immediately before writing a package.</small>
      </div>}
      {result && <div className="card availabilityPanel"><div className="eyebrow">PACKAGE CREATED</div><h3>{publishTargetLabels[result.platform]} handoff is ready</h3><p>The MP4 is unchanged. This new sidecar captures the reviewed export identity, exact range, scenes, format, title, description, tags and creation time.</p><code>{result.path}</code><small>{result.sizeBytes} bytes · {new Date(result.createdAt).toLocaleString()}</small></div>}
      {error && <div className="card errorBox">{error}</div>}
      <div className="card publishLibrary">
        <div className="sectionLead"><div><div className="eyebrow">LOCAL PACKAGE LIBRARY</div><h3>Reopen earlier handoffs</h3></div><button className="secondaryButton" disabled={!workerConnected || !librarySupported || !workerToken.trim() || listBusy} onClick={() => void refreshPackages()}>{listBusy ? 'Checking drive…' : 'Refresh packages'}</button></div>
        <p>This reads only validated <code>*.publish.json</code> files for this project from <code>KINAOU/Renders</code>. Opening one restores its reviewed metadata; it never uploads or changes the package or MP4.</p>
        {workerConnected && !librarySupported && <small>Restart the local worker from this KINAOU build and reconnect to enable the package library.</small>}
        {libraryMessage && <div className="note">{libraryMessage}</div>}
        {packages === null && !listError && <small>Refresh to read the current package library from the connected KINAOU drive.</small>}
        {packages?.length === 0 && <small>No valid publish packages were found for this project.</small>}
        {packages && packages.length > 0 && <div className="publishPackageList">{packages.map((entry) => <div className="publishPackageRow" key={entry.path}>
          <div><strong>{entry.document.title}</strong><small>{publishTargetLabels[entry.document.platform]} · {entry.document.media.format} · {new Date(entry.document.createdAt).toLocaleString()}</small><code>{entry.path}</code></div>
          <div className="publishPackageActions"><span className={entry.sourceAvailable ? 'badge' : 'badge offline'}>{entry.sourceAvailable ? 'MP4 AVAILABLE' : 'MP4 MISSING'}</span><button className="secondaryButton" disabled={busy || listBusy} onClick={() => openPackage(entry)}>Open metadata</button></div>
        </div>)}</div>}
        {listError && <div className="errorBox">{listError}</div>}
      </div>
    </section>
  )
}
