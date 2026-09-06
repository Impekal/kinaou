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
  const effectiveTarget = tracks.some((track) => track.id === targetId) ? targetId : tracks[0]?.id ?? ''
  const blocked = asset.offline || !asset.managed || !tracks.length

  if (!tracks.length) return <span className="assetPlacementHint">No compatible timeline track</span>

  return (
    <div className="assetPlacement">
      <select aria-label={`Timeline track for ${String(asset.metadata.name ?? asset.id)}`} value={effectiveTarget} onChange={(event) => setTargetId(event.target.value)}>
        {tracks.map((track) => <option key={track.id} value={track.id}>{track.name}{track.locked ? ' · locked' : ''}</option>)}
      </select>
      <button className="secondaryButton" disabled={blocked || !effectiveTarget || Boolean(tracks.find((track) => track.id === effectiveTarget)?.locked)} onClick={() => onProjectChange(placeAssetOnTrack(project, asset.id, effectiveTarget))}>Add to timeline</button>
    </div>
  )
}
