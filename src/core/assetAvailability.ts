import { touchProject, type KinaouProject } from './project'

export interface AssetAvailabilityResult {
  path: string
  available: boolean
}

export interface AvailabilityReconciliation {
  project: KinaouProject
  checked: number
  wentOffline: number
  cameOnline: number
}

export function managedAssetPaths(project: KinaouProject): string[] {
  const paths = project.assets
    .filter((asset) => asset.managed && asset.uri.startsWith('KINAOU/'))
    .map((asset) => asset.uri)
  return [...new Set(paths)]
}

export function applyAssetAvailability(project: KinaouProject, results: AssetAvailabilityResult[]): AvailabilityReconciliation {
  const availabilityByPath = new Map(results.map((result) => [result.path, result.available]))
  let checked = 0
  let wentOffline = 0
  let cameOnline = 0
  const assets = project.assets.map((asset) => {
    if (!asset.managed || !asset.uri.startsWith('KINAOU/')) return asset
    const available = availabilityByPath.get(asset.uri)
    if (available === undefined) return asset
    checked += 1
    const offline = !available
    if (asset.offline === offline) return asset
    if (offline) wentOffline += 1
    else cameOnline += 1
    return { ...asset, offline }
  })
  if (!wentOffline && !cameOnline) return { project, checked, wentOffline, cameOnline }
  return { project: touchProject({ ...project, assets }), checked, wentOffline, cameOnline }
}
