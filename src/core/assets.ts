import { touchProject, type KinaouAsset, type KinaouProject } from './project'

export interface AssetRegistration {
  kind: KinaouAsset['kind']
  uri: string
  name: string
  mimeType?: string
  sizeBytes?: number
  durationMs?: number
  managed?: boolean
}

export function registerAsset(project: KinaouProject, input: AssetRegistration): KinaouProject {
  const uri = input.uri.trim()
  if (!uri) throw new Error('Asset URI is required')
  if (input.sizeBytes !== undefined && input.sizeBytes < 0) throw new Error('Asset size must be non-negative')
  if (input.durationMs !== undefined && input.durationMs <= 0) throw new Error('Asset duration must be positive')

  const asset: KinaouAsset = {
    id: crypto.randomUUID(),
    kind: input.kind,
    uri,
    managed: input.managed ?? false,
    offline: false,
    metadata: {
      name: input.name.trim() || 'Untitled asset',
      ...(input.mimeType ? { mimeType: input.mimeType } : {}),
      ...(input.sizeBytes !== undefined ? { sizeBytes: input.sizeBytes } : {}),
      ...(input.durationMs !== undefined ? { durationMs: input.durationMs } : {})
    }
  }

  return touchProject({ ...project, assets: [...project.assets, asset] })
}

export function markAssetAvailability(project: KinaouProject, assetId: string, offline: boolean): KinaouProject {
  let found = false
  const assets = project.assets.map((asset) => {
    if (asset.id !== assetId) return asset
    found = true
    return { ...asset, offline }
  })
  if (!found) throw new Error(`Asset not found: ${assetId}`)
  return touchProject({ ...project, assets })
}
