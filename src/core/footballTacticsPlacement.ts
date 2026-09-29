import { parseProject, type KinaouProject } from './project'
import { parseFootballTactics } from './footballTactics'
import { applyTimelineOperation } from './timeline'
import { placeAssetOnTrack } from './timelinePlacement'
export function placeTacticsOnNewTrack(project: KinaouProject, assetId: string, trackName: string): KinaouProject {
  const asset = project.assets.find(a => a.id === assetId)
  if (!asset || asset.kind !== 'image' || asset.metadata.sourceKind !== 'authored-football-tactics-v1' || !trackName.trim() || trackName.length > 200) throw Error('A saved authored tactics image and track name are required')
  parseFootballTactics(asset.metadata.board)
  const id = crypto.randomUUID()
  const withTrack = applyTimelineOperation(project, { type: 'add-track', track: { id, name: trackName, type: 'image', muted: false, locked: false, clips: [] } })
  return parseProject(placeAssetOnTrack(withTrack, assetId, id))
}
