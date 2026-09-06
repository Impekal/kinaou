import { useEffect, useState } from 'react'
import { attachVideoThumbnail } from '../core/previewAssets'
import type { KinaouAsset, KinaouProject } from '../core/project'
import { WorkerClient } from '../core/workerClient'

export function VideoThumbnailControl({ project, asset, workerUrl, workerToken, workerConnected, workerCapabilities, onProjectChange }: { project: KinaouProject; asset: KinaouAsset; workerUrl: string; workerToken: string; workerConnected: boolean; workerCapabilities: string[]; onProjectChange: (project: KinaouProject) => void }) {
  const [busy, setBusy] = useState(false)
  const [objectUrl, setObjectUrl] = useState('')
  const [error, setError] = useState('')
  const path = typeof asset.metadata.thumbnailPath === 'string' ? asset.metadata.thumbnailPath : ''
  useEffect(() => { if (!path || !workerConnected) return; let cancelled = false; new WorkerClient({ baseUrl: workerUrl, token: workerToken }).loadVideoThumbnail(path).then((blob) => { if (!cancelled) setObjectUrl(URL.createObjectURL(blob)) }).catch(() => {}); return () => { cancelled = true } }, [path, workerConnected, workerToken, workerUrl])
  useEffect(() => () => { if (objectUrl) URL.revokeObjectURL(objectUrl) }, [objectUrl])
  if (asset.kind !== 'video' || !asset.managed || !asset.uri.startsWith('KINAOU/Assets/')) return null
  async function generate() {
    setBusy(true); setError('')
    try { const result = await new WorkerClient({ baseUrl: workerUrl, token: workerToken }).generateVideoThumbnail(asset.uri); onProjectChange(attachVideoThumbnail(project, asset.id, result.path)) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Thumbnail generation failed') }
    finally { setBusy(false) }
  }
  return <div className="thumbnailControl">{objectUrl && <img src={objectUrl} alt={`${String(asset.metadata.name ?? asset.id)} thumbnail`} />}<button className="secondaryButton" disabled={busy || !workerConnected || !workerCapabilities.includes('media-thumbnail')} onClick={generate}>{busy ? 'Generating thumbnail…' : path ? 'Regenerate thumbnail' : 'Generate thumbnail'}</button>{error && <small className="inlineError">{error}</small>}</div>
}
