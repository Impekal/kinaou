import { touchProject, type KinaouProject } from './project'
import { assertSafeManagedPath } from './storage'

export function attachVideoProxy(project: KinaouProject, assetId: string, proxyPath: string): KinaouProject {
  const safePath = assertSafeManagedPath(proxyPath)
  if (!safePath.startsWith('KINAOU/Cache/Proxies/') || !safePath.endsWith('.mp4')) throw new Error('Invalid managed proxy path')
  let found = false
  const assets = project.assets.map((asset) => {
    if (asset.id !== assetId) return asset
    if (asset.kind !== 'video' || !asset.managed || !asset.uri.startsWith('KINAOU/Assets/')) throw new Error('Only managed video assets can receive proxies')
    found = true
    return { ...asset, metadata: { ...asset.metadata, proxyPath: safePath } }
  })
  if (!found) throw new Error(`Asset not found: ${assetId}`)
  return touchProject({ ...project, assets })
}

export function attachVideoThumbnail(project: KinaouProject, assetId: string, thumbnailPath: string): KinaouProject {
  const safePath = assertSafeManagedPath(thumbnailPath)
  if (!safePath.startsWith('KINAOU/Cache/Thumbnails/') || !safePath.endsWith('.jpg')) throw new Error('Invalid managed thumbnail path')
  let found = false
  const assets = project.assets.map((asset) => {
    if (asset.id !== assetId) return asset
    if (asset.kind !== 'video' || !asset.managed || !asset.uri.startsWith('KINAOU/Assets/')) throw new Error('Only managed video assets can receive thumbnails')
    found = true
    return { ...asset, metadata: { ...asset.metadata, thumbnailPath: safePath } }
  })
  if (!found) throw new Error(`Asset not found: ${assetId}`)
  return touchProject({ ...project, assets })
}
