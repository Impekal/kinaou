import { touchProject, type KinaouProject } from './project'
import { assertSafeManagedPath } from './storage'

export type MediaPreviewKind = 'thumbnail' | 'waveform' | 'proxy'
export const mediaPreviewDefinitions = {
  thumbnail: { folder: 'Thumbnails', suffix: '_poster.jpg', extension: '.jpg', field: 'thumbnailPath', capability: 'media-thumbnail' },
  waveform: { folder: 'Waveforms', suffix: '_waveform.png', extension: '.png', field: 'waveformPath', capability: 'media-waveform' },
  proxy: { folder: 'Proxies', suffix: '_960p.mp4', extension: '.mp4', field: 'proxyPath', capability: 'media-proxy' }
} as const

export function assertCanonicalPreviewPath(value: string): string {
  if (typeof value !== 'string' || assertSafeManagedPath(value) !== value || /[\\\x00-\x1f\x7f]/.test(value) || value.split('/').some(part => !part || part === '.' || part === '..')) throw Error('Invalid canonical managed preview path')
  return value
}
export function assertMediaPreviewPath(kind: MediaPreviewKind, value: string): string {
  const definition = mediaPreviewDefinitions[kind]
  try { assertCanonicalPreviewPath(value) } catch { throw Error(`Invalid managed ${kind} path`) }
  const prefix = `KINAOU/Cache/${definition.folder}/`
  if (!value.startsWith(prefix) || !value.endsWith(definition.extension) || value.slice(prefix.length).length <= definition.extension.length) throw Error(`Invalid managed ${kind} path`)
  return value
}
export function requirePreviewSource(project: KinaouProject, assetId: string, kind: MediaPreviewKind) {
  const asset = project.assets.find(value => value.id === assetId)
  if (!asset || !asset.managed || asset.offline || !(kind === 'waveform' ? ['audio', 'video'] : ['video']).includes(asset.kind)) throw Error('Select an available managed source of the required media kind')
  assertCanonicalPreviewPath(asset.uri)
  if (!asset.uri.startsWith('KINAOU/Assets/') || asset.uri === 'KINAOU/Assets/') throw Error('Preview source must be inside KINAOU/Assets')
  return asset
}
export async function expectedMediaPreviewPath(kind: MediaPreviewKind, sourcePath: string): Promise<string> {
  assertCanonicalPreviewPath(sourcePath)
  if (!sourcePath.startsWith('KINAOU/Assets/')) throw Error('Preview source must be inside KINAOU/Assets')
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sourcePath))
  const id = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 24)
  const definition = mediaPreviewDefinitions[kind]
  return `KINAOU/Cache/${definition.folder}/${id}${definition.suffix}`
}
export function attachMediaPreview(project: KinaouProject, assetId: string, kind: MediaPreviewKind, path: string): KinaouProject {
  const safePath = assertMediaPreviewPath(kind, path)
  requirePreviewSource(project, assetId, kind)
  const field = mediaPreviewDefinitions[kind].field
  return touchProject({ ...project, assets: project.assets.map(asset => asset.id === assetId ? { ...asset, metadata: { ...asset.metadata, [field]: safePath } } : asset) })
}
export function attachVideoProxy(project: KinaouProject, assetId: string, path: string) { return attachMediaPreview(project, assetId, 'proxy', path) }
export function attachVideoThumbnail(project: KinaouProject, assetId: string, path: string) { return attachMediaPreview(project, assetId, 'thumbnail', path) }
export function attachWaveform(project: KinaouProject, assetId: string, path: string) { return attachMediaPreview(project, assetId, 'waveform', path) }
