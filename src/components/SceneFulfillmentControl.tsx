import { useState } from 'react'
import type { KinaouAsset, KinaouProject } from '../core/project'
import { assignAssetToScene } from '../core/storyboardFulfillment'
import type { PersistentVersionHistory } from '../core/versioning'

interface Props { project: KinaouProject; history: PersistentVersionHistory; asset: KinaouAsset; onProjectChange: (project: KinaouProject) => void; onError: (message: string) => void }

export function SceneFulfillmentControl({ project, history, asset, onProjectChange, onError }: Props) {
  const [sceneId, setSceneId] = useState('')
  if (!project.storyboard.length) return <span className="assetPlacementHint">No storyboard scenes yet</span>
  const scene = project.storyboard.find((entry) => entry.id === sceneId) ?? null
  const occupied = Boolean(scene?.assetId && scene.assetId !== asset.id)
  const fulfilled = scene?.assetId === asset.id

  function apply() {
    if (!scene) return
    try {
      if (occupied) history.snapshot(project, `Before scene visual replace: ${scene.title}`, 'system')
      onProjectChange(assignAssetToScene(project, scene.id, asset.id, { replace: occupied }))
    } catch (cause) { onError(cause instanceof Error ? cause.message : 'Scene fulfillment failed') }
  }

  return <div className="assetPlacement">
    <select aria-label={`Storyboard scene for ${String(asset.metadata.name ?? asset.id)}`} value={sceneId} onChange={(event) => setSceneId(event.target.value)}>
      <option value="">Choose scene…</option>
      {project.storyboard.map((entry) => <option key={entry.id} value={entry.id}>{entry.title}{entry.assetId ? ' · fulfilled' : ''}</option>)}
    </select>
    <button className="secondaryButton" disabled={!scene || fulfilled} onClick={apply}>{fulfilled ? 'Scene fulfilled' : occupied ? 'Replace scene visual' : 'Fulfill scene'}</button>
  </div>
}
