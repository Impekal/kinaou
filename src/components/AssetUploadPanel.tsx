import { useState } from 'react'
import { importProbedMedia, type ImportableMediaKind } from '../core/mediaImport'
import type { KinaouProject } from '../core/project'
import { WorkerClient } from '../core/workerClient'

interface AssetUploadPanelProps {
  project: KinaouProject
  workerUrl: string
  workerToken: string
  workerConnected: boolean
  workerCapabilities: string[]
  onProjectChange: (project: KinaouProject) => void
}

function inferKind(file: File): ImportableMediaKind | null {
  if (file.type.startsWith('video/')) return 'video'
  if (file.type.startsWith('audio/')) return 'audio'
  if (file.type.startsWith('image/')) return 'image'
  return null
}

export function AssetUploadPanel({ project, workerUrl, workerToken, workerConnected, workerCapabilities, onProjectChange }: AssetUploadPanelProps) {
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [lastImported, setLastImported] = useState('')
  const kind = file ? inferKind(file) : null
  const uploadAvailable = workerCapabilities.includes('asset-upload')

  async function importSelectedFile() {
    if (!file || !kind || !workerConnected || !uploadAvailable || busy) return
    setBusy(true)
    setError('')
    setLastImported('')
    try {
      const client = new WorkerClient({ baseUrl: workerUrl, token: workerToken })
      const uploaded = await client.importAsset(file, file.name)
      const probe = await client.probe(uploaded.managedPath)
      const next = importProbedMedia(project, {
        kind,
        managedPath: uploaded.managedPath,
        name: uploaded.name,
        probe: { ...probe, sizeBytes: probe.sizeBytes ?? uploaded.sizeBytes, mimeType: file.type || undefined }
      })
      onProjectChange(next)
      setLastImported(uploaded.name)
      setFile(null)
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Asset import failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card uploadPanel">
      <div>
        <div className="eyebrow">EXPLICIT FILE IMPORT</div>
        <h3>Choose a file from this device</h3>
        <p>The browser reads only the file you select. The worker never receives its original filesystem path and writes the bytes only into <code>KINAOU/Assets</code>.</p>
      </div>
      <div className="formStack">
        <label>Media file<input type="file" accept="video/*,audio/*,image/*" disabled={!workerConnected || !uploadAvailable || busy} onChange={(event) => { setFile(event.target.files?.[0] ?? null); setError(''); setLastImported('') }} /></label>
        {file && <div className="fileSelection"><strong>{file.name}</strong><span>{kind ?? 'unsupported'} · {(file.size / 1024 / 1024).toFixed(1)} MB</span></div>}
        {!workerConnected && <div className="warning">Connect the local worker in Settings first.</div>}
        {workerConnected && !uploadAvailable && <div className="warning">This worker version does not advertise secure asset upload yet.</div>}
        {file && !kind && <div className="warning">Only video, audio and image files are accepted by this importer.</div>}
        {error && <div className="errorBox">{error}</div>}
        {lastImported && <div className="successBox">Imported and probed: {lastImported}</div>}
        <button className="primary" disabled={!file || !kind || !workerConnected || !uploadAvailable || busy} onClick={importSelectedFile}>{busy ? 'Uploading and probing…' : 'Import into KINAOU'}</button>
      </div>
    </section>
  )
}
