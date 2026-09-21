import { useState } from 'react'
import type { KinaouAsset, KinaouProject } from '../core/project'
import { commitSceneAssignment } from '../core/sceneAssignmentCommit'
import type { PersistentVersionHistory } from '../core/versioning'
import { useUiLanguage } from './UiLanguageProvider'

interface Props { project: KinaouProject; history: PersistentVersionHistory; asset: KinaouAsset; onProjectChange: (project: KinaouProject) => void; onError: (message: string) => void }

export function SceneFulfillmentControl({ project, history, asset, onProjectChange, onError }: Props) {
  const { t } = useUiLanguage()
  const [sceneId, setSceneId] = useState('')
  if (!project.storyboard.length) return <span className="assetPlacementHint">{t('fulfillment.none')}</span>
  const scene = project.storyboard.find((entry) => entry.id === sceneId) ?? null
  const occupied = Boolean(scene?.assetId && scene.assetId !== asset.id)
  const fulfilled = scene?.assetId === asset.id

  function apply() {
    if (!scene) return
    try {
      commitSceneAssignment(project, scene.id, asset.id, history, onProjectChange)
    } catch (cause) { onError(cause instanceof Error ? cause.message : t('recovery.fulfillment')) }
  }

  return <div className="assetPlacement">
    <select aria-label={t('fulfillment.scene', { name: String(asset.metadata.name ?? asset.id) })} value={sceneId} onChange={(event) => setSceneId(event.target.value)}>
      <option value="">{t('fulfillment.choose')}</option>
      {project.storyboard.map((entry) => <option key={entry.id} value={entry.id}>{entry.title}{entry.assetId ? ` · ${t('fulfillment.occupied')}` : ''}</option>)}
    </select>
    <button className="secondaryButton" disabled={!scene || fulfilled || asset.offline} onClick={apply}>{t(fulfilled ? 'fulfillment.fulfilled' : occupied ? 'fulfillment.replace' : 'fulfillment.assign')}</button>
  </div>
}
