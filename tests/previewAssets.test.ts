import { describe, expect, it } from 'vitest'
import { attachVideoProxy, attachVideoThumbnail } from '../src/core/previewAssets'
import { assetSchema, createProject } from '../src/core/project'

describe('preview assets', () => {
  it('attaches a managed cache proxy without replacing the full-quality source', () => {
    const base = createProject('Proxy')
    const asset = assetSchema.parse({ id: 'video', kind: 'video', uri: 'KINAOU/Assets/original.mov', managed: true, metadata: {} })
    const project = attachVideoProxy({ ...base, assets: [asset] }, asset.id, 'KINAOU/Cache/Proxies/abc_960p.mp4')
    expect(project.assets[0].uri).toBe('KINAOU/Assets/original.mov')
    expect(project.assets[0].metadata.proxyPath).toBe('KINAOU/Cache/Proxies/abc_960p.mp4')
    expect(() => attachVideoProxy({ ...base, assets: [asset] }, asset.id, 'KINAOU/Renders/not-a-proxy.mp4')).toThrow(/proxy path/)
  })

  it('attaches only managed cache thumbnails to managed video assets', () => {
    const base = createProject('Thumbnail')
    const asset = assetSchema.parse({ id: 'video', kind: 'video', uri: 'KINAOU/Assets/original.mov', managed: true, metadata: {} })
    const project = attachVideoThumbnail({ ...base, assets: [asset] }, asset.id, 'KINAOU/Cache/Thumbnails/abc_poster.jpg')
    expect(project.assets[0].metadata.thumbnailPath).toBe('KINAOU/Cache/Thumbnails/abc_poster.jpg')
    expect(() => attachVideoThumbnail({ ...base, assets: [asset] }, asset.id, '../poster.jpg')).toThrow()
  })
})
