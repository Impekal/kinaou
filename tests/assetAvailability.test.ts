import { describe, expect, it } from 'vitest'
import { applyAssetAvailability, managedAssetPaths } from '../src/core/assetAvailability'
import { assetSchema, createProject } from '../src/core/project'

function projectWithAssets() {
  const base = createProject('Availability')
  const managedVideo = assetSchema.parse({ id: 'a1', kind: 'video', uri: 'KINAOU/Assets/clip.mp4', managed: true, offline: false, metadata: { durationMs: 1000 } })
  const managedImage = assetSchema.parse({ id: 'a2', kind: 'image', uri: 'KINAOU/Assets/WebCaptures/shot.png', managed: true, offline: false, metadata: {} })
  const planning = assetSchema.parse({ id: 'a3', kind: 'other', uri: 'kinaou://planning/a3', managed: false, offline: false, metadata: {} })
  return { ...base, assets: [managedVideo, managedImage, planning] }
}

describe('asset availability reconciliation', () => {
  it('collects only managed KINAOU paths, deduplicated', () => {
    const project = projectWithAssets()
    const duplicated = { ...project, assets: [...project.assets, { ...project.assets[0], id: 'a4' }] }
    expect(managedAssetPaths(duplicated)).toEqual(['KINAOU/Assets/clip.mp4', 'KINAOU/Assets/WebCaptures/shot.png'])
  })

  it('marks missing media offline and found media online again', () => {
    const project = projectWithAssets()
    const offlineOutcome = applyAssetAvailability(project, [
      { path: 'KINAOU/Assets/clip.mp4', available: false },
      { path: 'KINAOU/Assets/WebCaptures/shot.png', available: true }
    ])
    expect(offlineOutcome.checked).toBe(2)
    expect(offlineOutcome.wentOffline).toBe(1)
    expect(offlineOutcome.cameOnline).toBe(0)
    expect(offlineOutcome.project.assets.find((asset) => asset.id === 'a1')?.offline).toBe(true)
    expect(offlineOutcome.project.assets.find((asset) => asset.id === 'a2')?.offline).toBe(false)

    const reconnectOutcome = applyAssetAvailability(offlineOutcome.project, [
      { path: 'KINAOU/Assets/clip.mp4', available: true }
    ])
    expect(reconnectOutcome.cameOnline).toBe(1)
    expect(reconnectOutcome.project.assets.find((asset) => asset.id === 'a1')?.offline).toBe(false)
  })

  it('never touches unmanaged assets or paths that were not checked', () => {
    const project = projectWithAssets()
    const outcome = applyAssetAvailability(project, [{ path: 'kinaou://planning/a3', available: false }])
    expect(outcome.checked).toBe(0)
    expect(outcome.project).toBe(project)
    expect(outcome.project.assets.find((asset) => asset.id === 'a3')?.offline).toBe(false)
  })

  it('returns the same project instance when nothing changed', () => {
    const project = projectWithAssets()
    const outcome = applyAssetAvailability(project, [{ path: 'KINAOU/Assets/clip.mp4', available: true }])
    expect(outcome.project).toBe(project)
    expect(outcome.checked).toBe(1)
  })
})
