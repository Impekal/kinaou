import { useMemo, useState } from 'react'
import type { KinaouAsset, KinaouProject } from '../core/project'
import { compatibleTracks, placeAssetOnTrack } from '../core/timelinePlacement'

interface AssetPlacementControlProps {
  project: KinaouProject
  asset: KinaouAsset
  onProjectChange: (project: KinaouProject) => void
}

export function AssetPlacementControl({ project, asset, onProjectChange }: AssetPlacementControlProps) {
  const tracks = useMemo(() => compatibleTracks(project, asset), [project, asset])
  const [targetId, setTargetId] = useState(() => tracks[0]?.id ?? '')
  const [error, setError] = useState('')
  const effectiveTarget = tracks.some((track) => track.id === targetId) ? targetId : tracks[0]?.id ?? ''
  const selectedTrack = tracks.find((track) => track.id === effectiveTarget)

  if (!tracks.length) return <span className="assetPlacementHint">No compatible timeline track</span>

  const disabledReason = asset.offline
    ? 'This asset is offline. Reconnect its media before placing it.'
    : !asset.managed
      ? 'Only managed KINAOU assets can be placed on the timeline.'
      : !selectedTrack
        ? 'Pick a timeline track first.'
        : selectedTrack.locked
          ? `"${selectedTrack.name}" is locked. Unlock it in the Studio timeline or pick another track.`
          : ''

  function place() {
    setError('')
    try {
      onProjectChange(placeAssetOnTrack(project, asset.id, effectiveTarget))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Timeline placement failed')
    }
  }

  return (
    <div className="assetPlacement">
      <select aria-label={`Timeline track for ${String(asset.metadata.name ?? asset.id)}`} value={effectiveTarget} onChange={(event) => { setTargetId(event.target.value); setError('') }}>
        {tracks.map((track) => <option key={track.id} value={track.id}>{track.name}{track.locked ? ' · locked' : ''}</option>)}
      </select>
      <button className="secondaryButton" disabled={Boolean(disabledReason)} onClick={place}>Add to timeline</button>
      {disabledReason && <small className="assetPlacementHint assetPlacementError">{disabledReason}</small>}
      {!disabledReason && error && <small className="inlineError assetPlacementError">{error}</small>}
    </div>
  )
}
