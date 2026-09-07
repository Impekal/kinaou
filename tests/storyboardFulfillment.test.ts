import { describe, expect, it } from 'vitest'
import { createProjectFromInput } from '../src/core/create'
import { parseProject, type KinaouProject } from '../src/core/project'
import { assignAssetToScene, clearSceneAssignment } from '../src/core/storyboardFulfillment'

function projectWithSceneAndAssets(): KinaouProject {
  const base = createProjectFromInput({ title: 'Fulfillment', kind: 'idea', content: '' })
  return parseProject({
    ...base,
    storyboard: [{ id: 'scene-1', title: 'Opening', description: 'Intro', durationMs: 4000 }, { id: 'scene-2', title: 'Detail', description: 'Close-up', durationMs: 3000 }],
    assets: [
      { id: 'img-a', kind: 'image', uri: 'KINAOU/Assets/GeneratedImages/a.png', managed: true, offline: false, metadata: { generated: true } },
      { id: 'img-b', kind: 'image', uri: 'KINAOU/Assets/GeneratedImages/b.png', managed: true, offline: false, metadata: { generated: true } },
      { id: 'doc-1', kind: 'document', uri: 'KINAOU/Projects/Transcripts/t.json', managed: true, offline: false, metadata: {} },
      { id: 'img-off', kind: 'image', uri: 'KINAOU/Assets/off.png', managed: true, offline: true, metadata: {} }
    ]
  })
}

describe('storyboard fulfillment', () => {
  it('assigns a visual asset to an explicit scene and survives schema parsing', () => {
    const next = assignAssetToScene(projectWithSceneAndAssets(), 'scene-1', 'img-a')
    expect(next.storyboard[0].assetId).toBe('img-a')
    expect(next.storyboard[1].assetId).toBeUndefined()
    expect(parseProject(next).storyboard[0].assetId).toBe('img-a')
  })

  it('is idempotent for the same asset and requires explicit replacement for a fulfilled scene', () => {
    const assigned = assignAssetToScene(projectWithSceneAndAssets(), 'scene-1', 'img-a')
    expect(assignAssetToScene(assigned, 'scene-1', 'img-a')).toBe(assigned)
    expect(() => assignAssetToScene(assigned, 'scene-1', 'img-b')).toThrow(/already fulfilled/)
    const replaced = assignAssetToScene(assigned, 'scene-1', 'img-b', { replace: true })
    expect(replaced.storyboard[0].assetId).toBe('img-b')
    expect(replaced.assets.some((asset) => asset.id === 'img-a')).toBe(true)
  })

  it('rejects unknown scenes, unknown assets, non-visual assets and offline assets', () => {
    const project = projectWithSceneAndAssets()
    expect(() => assignAssetToScene(project, 'missing', 'img-a')).toThrow(/scene not found/i)
    expect(() => assignAssetToScene(project, 'scene-1', 'missing')).toThrow(/Asset not found/)
    expect(() => assignAssetToScene(project, 'scene-1', 'doc-1')).toThrow(/image or video/)
    expect(() => assignAssetToScene(project, 'scene-1', 'img-off')).toThrow(/offline/i)
  })

  it('clears an assignment without touching the asset itself', () => {
    const assigned = assignAssetToScene(projectWithSceneAndAssets(), 'scene-2', 'img-b')
    const cleared = clearSceneAssignment(assigned, 'scene-2')
    expect(cleared.storyboard[1].assetId).toBeUndefined()
    expect(cleared.assets.some((asset) => asset.id === 'img-b')).toBe(true)
    expect(clearSceneAssignment(cleared, 'scene-2')).toBe(cleared)
    expect(() => clearSceneAssignment(cleared, 'missing')).toThrow(/scene not found/i)
  })
})
