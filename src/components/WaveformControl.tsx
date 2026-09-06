import { useState } from 'react'
import { attachWaveform } from '../core/previewAssets'
import type { KinaouAsset, KinaouProject } from '../core/project'
import { WorkerClient } from '../core/workerClient'
import { WaveformImage } from './WaveformImage'

export function WaveformControl({ project, asset, workerUrl, workerToken, workerConnected, workerCapabilities, onProjectChange }: { project: KinaouProject; asset: KinaouAsset; workerUrl: string; workerToken: string; workerConnected: boolean; workerCapabilities: string[]; onProjectChange: (project: KinaouProject) => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const path = typeof asset.metadata.waveformPath === 'string' ? asset.metadata.waveformPath : ''
  if (!['audio', 'video'].includes(asset.kind) || !asset.managed || !asset.uri.startsWith('KINAOU/Assets/')) return null
  async function generate() {
    setBusy(true); setError('')
    try { const result = await new WorkerClient({ baseUrl: workerUrl, token: workerToken }).generateWaveform(asset.uri); onProjectChange(attachWaveform(project, asset.id, result.path)) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Waveform generation failed') }
    finally { setBusy(false) }
  }
  return <div className="waveformControl">{path && <WaveformImage path={path} workerUrl={workerUrl} workerToken={workerToken} workerConnected={workerConnected} alt={`${String(asset.metadata.name ?? asset.id)} waveform`} />}<button className="secondaryButton" disabled={busy || !workerConnected || !workerCapabilities.includes('media-waveform')} onClick={generate}>{busy ? 'Generating waveform…' : path ? 'Regenerate waveform' : 'Generate waveform'}</button>{error && <small className="inlineError">{error}</small>}</div>
}
