import type { KinaouProject } from './project'
import { assignAssetToScene, clearSceneAssignment } from './storyboardFulfillment'
import type { PersistentVersionHistory } from './versioning'
export function commitSceneAssignment(project: KinaouProject, sceneId: string, assetId: string | undefined, history: Pick<PersistentVersionHistory, 'snapshot'>, persist: (project: KinaouProject) => void) {
  const next = assetId === undefined ? clearSceneAssignment(project, sceneId) : assignAssetToScene(project, sceneId, assetId, { replace: true })
  if (next === project) return
  history.snapshot(project, `Before scene visual change: ${project.storyboard.find(scene => scene.id === sceneId)!.title}`, 'system')
  persist(next)
}
