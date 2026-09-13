import { useEffect, useMemo, useState } from 'react'
import { projectExportHistory } from '../core/exportHistory'
import { buildPublishPackageRequest, publishTargetLabels, type PublishPackageResult, type PublishTarget } from '../core/publishPackage'
import type { KinaouProject } from '../core/project'
import { WorkerClient } from '../core/workerClient'

interface PublishPanelProps {
  project: KinaouProject
  workerUrl: string
  workerToken: string
  workerConnected: boolean
  workerCapabilities: string[]
}

export function PublishPanel({ project, workerUrl, workerToken, workerConnected, workerCapabilities }: PublishPanelProps) {
  const receipts = useMemo(() => projectExportHistory(project), [project])
  const [selectedJobId, setSelectedJobId] = useState(() => receipts[0]?.jobId ?? '')
  const [platform, setPlatform] = useState<PublishTarget>('youtube')
  const [title, setTitle] = useState(project.title)
  const [description, setDescription] = useState('')
  const [tags, setTags] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<PublishPackageResult | null>(null)
  const [error, setError] = useState('')
  const selected = receipts.find((receipt) => receipt.jobId === selectedJobId) ?? receipts[0]
  const packageSupported = workerCapabilities.includes('publish-package')

  useEffect(() => {
    setSelectedJobId(receipts[0]?.jobId ?? '')
    setTitle(project.title)
    setDescription('')
    setTags('')
    setResult(null)
    setError('')
  }, [project.id])

  async function createPackage() {
    if (!selected || !workerConnected || !packageSupported || busy) return
    setBusy(true)
    setError('')
    setResult(null)
    try {
      const request = buildPublishPackageRequest(project, selected, { platform, title, description, tags })
      setResult(await new WorkerClient({ baseUrl: workerUrl, token: workerToken }).createPublishPackage(request))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create publish package')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="stack">
      <div className="sectionLead"><div><div className="eyebrow">LOCAL PUBLISH HANDOFF</div><h2>Prepare a finished export</h2></div><span className={packageSupported ? 'status online' : 'status'}>{packageSupported ? 'PACKAGE READY' : workerConnected ? 'RESTART WORKER' : 'WORKER OFFLINE'}</span></div>
      <div className="card settingsPanel">
        <div>
          <h3>MP4 plus attributable metadata</h3>
          <p>Select a successful KINAOU export and write a new JSON sidecar next to it in <code>KINAOU/Renders</code>. The worker checks that the MP4 really exists and is not empty. It never uploads, publishes, changes or deletes the video.</p>
          {selected && <div className="note"><strong>{selected.label}</strong><br />{selected.format} · {(selected.durationMs / 1000).toFixed(1)} s<br /><code>{selected.outputRelativePath}</code></div>}
        </div>
        <div className="formStack">
          <label>Successful export<select value={selected?.jobId ?? ''} disabled={!receipts.length || busy} onChange={(event) => { setSelectedJobId(event.target.value); setResult(null) }}>
            {!receipts.length && <option value="">No successful exports recorded</option>}
            {receipts.map((receipt) => <option key={receipt.jobId} value={receipt.jobId}>{receipt.label} · {receipt.format} · {new Date(receipt.completedAt).toLocaleString()}</option>)}
          </select></label>
          <label>Destination profile<select value={platform} disabled={busy} onChange={(event) => { setPlatform(event.target.value as PublishTarget); setResult(null) }}>
            {(Object.keys(publishTargetLabels) as PublishTarget[]).map((target) => <option key={target} value={target}>{publishTargetLabels[target]}</option>)}
          </select></label>
          <label>Title<input maxLength={200} value={title} disabled={busy} onChange={(event) => { setTitle(event.target.value); setResult(null) }} /></label>
          <label>Description<textarea maxLength={5000} value={description} disabled={busy} onChange={(event) => { setDescription(event.target.value); setResult(null) }} /></label>
          <label>Tags, comma or line separated<input value={tags} disabled={busy} placeholder="tutorial, local AI, editing" onChange={(event) => { setTags(event.target.value); setResult(null) }} /></label>
          <button className="primary" disabled={!selected || !workerConnected || !packageSupported || !workerToken.trim() || !title.trim() || busy} onClick={createPackage}>{busy ? 'Checking export and writing…' : 'Create local publish package'}</button>
          {!workerConnected && <small>Connect the local worker in Settings first.</small>}
          {workerConnected && !packageSupported && <small>Restart the local worker from this KINAOU build, reconnect, then try again.</small>}
          {!receipts.length && <small>Complete a render export first; previews are intentionally not publishable.</small>}
        </div>
      </div>
      {result && <div className="card availabilityPanel"><div className="eyebrow">PACKAGE CREATED</div><h3>{publishTargetLabels[result.platform]} handoff is ready</h3><p>The MP4 is unchanged. This new sidecar captures the reviewed export identity, exact range, scenes, format, title, description, tags and creation time.</p><code>{result.path}</code><small>{result.sizeBytes} bytes · {new Date(result.createdAt).toLocaleString()}</small></div>}
      {error && <div className="card errorBox">{error}</div>}
    </section>
  )
}
