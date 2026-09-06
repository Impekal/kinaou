import { useState } from 'react'
import { attachVideoProxy } from '../core/previewAssets'
import type { KinaouAsset, KinaouProject } from '../core/project'
import { WorkerClient } from '../core/workerClient'

export function VideoProxyControl({ project, asset, workerUrl, workerToken, workerConnected, workerCapabilities, onProjectChange }: { project: KinaouProject; asset: KinaouAsset; workerUrl: string; workerToken: string; workerConnected: boolean; workerCapabilities: string[]; onProjectChange: (project: KinaouProject) => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (asset.kind !== 'video' || !asset.managed || !asset.uri.startsWith('KINAOU/Assets/')) return null
  const existing = typeof asset.metadata.proxyPath === 'string' ? asset.metadata.proxyPath : ''
  async function generate() {
    setBusy(true); setError('')
    try {
      const result = await new WorkerClient({ baseUrl: workerUrl, token: workerToken }).generateVideoProxy(asset.uri)
      onProjectChange(attachVideoProxy(project, asset.id, result.path))
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Proxy generation failed') }
    finally { setBusy(false) }
  }
  return <div className="proxyControl">
    {existing ? <><span className="badge">PROXY READY</span><code>{existing}</code></> : <button className="secondaryButton" disabled={busy || !workerConnected || !workerCapabilities.includes('media-proxy')} onClick={generate}>{busy ? 'Generating proxy…' : 'Generate proxy'}</button>}
    {error && <small className="inlineError">{error}</small>}
  </div>
}
