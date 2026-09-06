import { useEffect, useMemo, useState } from 'react'
import type { KinaouProject } from '../core/project'
import { WorkerClient } from '../core/workerClient'

export function StudioProxyPreview({ project, workerUrl, workerToken, workerConnected }: { project: KinaouProject; workerUrl: string; workerToken: string; workerConnected: boolean }) {
  const proxyAssets = useMemo(() => project.assets.filter((asset) => asset.kind === 'video' && typeof asset.metadata.proxyPath === 'string'), [project])
  const [assetId, setAssetId] = useState(proxyAssets[0]?.id ?? '')
  const [objectUrl, setObjectUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const selected = proxyAssets.find((asset) => asset.id === assetId) ?? proxyAssets[0]

  useEffect(() => () => { if (objectUrl) URL.revokeObjectURL(objectUrl) }, [objectUrl])
  if (!proxyAssets.length) return <div className="card previewPanel"><div><div className="eyebrow">SOURCE PREVIEW</div><h3>No proxy available</h3><p>Generate a video proxy in Assets to preview it here. Final renders always use the original.</p></div></div>

  async function load() {
    if (!selected) return
    setBusy(true); setError('')
    try {
      const blob = await new WorkerClient({ baseUrl: workerUrl, token: workerToken }).loadVideoProxy(String(selected.metadata.proxyPath))
      setObjectUrl((previous) => { if (previous) URL.revokeObjectURL(previous); return URL.createObjectURL(blob) })
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Proxy preview failed') }
    finally { setBusy(false) }
  }

  return <div className="card previewPanel">
    <div className="sectionLead"><div><div className="eyebrow">SOURCE PREVIEW</div><h3>Managed proxy playback</h3><p>This previews a selected source proxy, not the composed timeline render.</p></div><span className="badge">FULL-QUALITY EXPORT</span></div>
    <div className="previewControls"><select aria-label="Proxy asset" value={selected?.id ?? ''} onChange={(event) => { setAssetId(event.target.value); setObjectUrl('') }}>{proxyAssets.map((asset) => <option key={asset.id} value={asset.id}>{String(asset.metadata.name ?? asset.id)}</option>)}</select><button className="secondaryButton" disabled={busy || !workerConnected} onClick={load}>{busy ? 'Loading…' : 'Load proxy'}</button></div>
    {objectUrl && <video className="proxyVideo" src={objectUrl} controls preload="metadata" />}
    {error && <div className="errorBox">{error}</div>}
  </div>
}
