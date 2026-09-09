import { useState } from 'react'
import { applyAssetAvailability, managedAssetPaths } from '../core/assetAvailability'
import type { KinaouProject } from '../core/project'
import { WorkerClient } from '../core/workerClient'

interface Props {
  project: KinaouProject
  workerUrl: string
  workerToken: string
  workerConnected: boolean
  onProjectChange: (project: KinaouProject) => void
}

export function AssetAvailabilityControl({ project, workerUrl, workerToken, workerConnected, onProjectChange }: Props) {
  const [busy, setBusy] = useState(false)
  const [summary, setSummary] = useState('')
  const [error, setError] = useState('')
  const paths = managedAssetPaths(project)

  async function check() {
    if (!workerConnected || busy || !paths.length) return
    setBusy(true)
    setError('')
    setSummary('')
    try {
      const client = new WorkerClient({ baseUrl: workerUrl, token: workerToken })
      const results = await client.assetAvailability(paths)
      const outcome = applyAssetAvailability(project, results)
      if (outcome.wentOffline || outcome.cameOnline) onProjectChange(outcome.project)
      const offlineTotal = outcome.project.assets.filter((asset) => asset.offline).length
      setSummary(`${outcome.checked} managed asset${outcome.checked === 1 ? '' : 's'} checked · ${outcome.wentOffline} went offline · ${outcome.cameOnline} came back online · ${offlineTotal} offline in total`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Availability check failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card availabilityPanel">
      <div>
        <div className="eyebrow">MEDIA AVAILABILITY</div>
        <h3>Check that managed media is still on the drive</h3>
        <p>Verifies every managed asset file under the KINAOU root — for example after unplugging or reconnecting the external drive. Missing media is marked OFFLINE (and blocked from rendering) until it is found again; nothing is deleted or modified.</p>
      </div>
      <div className="directorActions">
        <button className="secondaryButton" disabled={!workerConnected || busy || !paths.length} onClick={check}>{busy ? 'Checking…' : 'Check media availability'}</button>
        {!paths.length && <small>No managed assets to check yet.</small>}
        {summary && <small>{summary}</small>}
      </div>
      {error && <div className="errorBox">{error}</div>}
    </div>
  )
}
