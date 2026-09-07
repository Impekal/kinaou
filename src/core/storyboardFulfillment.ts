import { parseProject, touchProject, type KinaouProject } from './project'

const VISUAL_KINDS = new Set(['image', 'video'])

function requireScene(project: KinaouProject, sceneId: string) {
  const scene = project.storyboard.find((entry) => entry.id === sceneId)
  if (!scene) throw new Error(`Storyboard scene not found: ${sceneId}`)
  return scene
}

export function assignAssetToScene(project: KinaouProject, sceneId: string, assetId: string, options: { replace?: boolean } = {}): KinaouProject {
  const scene = requireScene(project, sceneId)
  const asset = project.assets.find((entry) => entry.id === assetId)
  if (!asset) throw new Error(`Asset not found: ${assetId}`)
  if (!VISUAL_KINDS.has(asset.kind)) throw new Error('Only image or video assets can fulfil a storyboard scene')
  if (asset.offline) throw new Error('An offline asset cannot fulfil a storyboard scene')
  if (scene.assetId === assetId) return project
  if (scene.assetId && !options.replace) throw new Error('Scene is already fulfilled; replace it explicitly or keep the asset as an alternative')
  return parseProject(touchProject({ ...project, storyboard: project.storyboard.map((entry) => entry.id === sceneId ? { ...entry, assetId } : entry) }))
}

export function clearSceneAssignment(project: KinaouProject, sceneId: string): KinaouProject {
  const scene = requireScene(project, sceneId)
  if (!scene.assetId) return project
  return parseProject(touchProject({ ...project, storyboard: project.storyboard.map((entry) => entry.id === sceneId ? { id: entry.id, title: entry.title, description: entry.description, durationMs: entry.durationMs } : entry) }))
}
