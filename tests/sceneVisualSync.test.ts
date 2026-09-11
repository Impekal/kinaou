import { describe, expect, it } from 'vitest'
import { assetSchema, clipSchema, createProject, trackSchema, type KinaouProject } from '../src/core/project'
import { assembleTimelineFromStoryboard } from '../src/core/storyboardAssembly'
import { planSceneVisualSync, syncSceneVisuals } from '../src/core/sceneVisualSync'
import { assignAssetToScene } from '../src/core/storyboardFulfillment'

function image(id: string) {
  return assetSchema.parse({ id, kind: 'image', uri: `KINAOU/Assets/${id}.png`, managed: true, metadata: { width: 1280, height: 720 } })
}

function video(id: string, durationMs?: number) {
  return assetSchema.parse({ id, kind: 'video', uri: `KINAOU/Assets/${id}.mp4`, managed: true, metadata: durationMs === undefined ? {} : { durationMs } })
}

/** Two fulfilled scenes, assembled with motion and a cross-dissolve. */
function assembled(): KinaouProject {
  const base: KinaouProject = {
    ...createProject('Sync'),
    assets: [image('first'), image('second'), image('replacement'), video('footage', 1500)],
    tracks: [trackSchema.parse({ id: 'video-1', type: 'video', name: 'Main Video', clips: [] })],
    storyboard: [
      { id: 's1', title: 'Opening', description: 'One.', durationMs: 4000, assetId: 'first' },
      { id: 's2', title: 'Closing', description: 'Two.', durationMs: 4000, assetId: 'second' }
    ]
  }
  return assembleTimelineFromStoryboard(base, 'video-1', { motion: true, crossfade: true }).project
}

const clipsOf = (project: KinaouProject) => project.tracks.find((track) => track.id === 'video-1')!.clips

describe('assembling remembers which scene a clip belongs to', () => {
  it('stamps every placed clip with its scene', () => {
    expect(clipsOf(assembled()).map((clip) => [clip.sceneId, clip.assetId])).toEqual([['s1', 'first'], ['s2', 'second']])
  })

  it('does not append a second copy when a scene visual was replaced', () => {
    const replaced = assignAssetToScene(assembled(), 's1', 'replacement', { replace: true })
    const again = assembleTimelineFromStoryboard(replaced, 'video-1', {})
    expect(clipsOf(again.project)).toHaveLength(2)
    expect(again.skipped.map((entry) => entry.reason)).toEqual([
      'Its visual is already on "Main Video"',
      'Its visual is already on "Main Video"'
    ])
  })

  it('adopts clips placed before scenes were recorded, so an older project stays precise', () => {
    const legacy: KinaouProject = {
      ...createProject('Legacy'),
      assets: [image('first'), image('replacement')],
      tracks: [trackSchema.parse({
        id: 'video-1',
        type: 'video',
        name: 'Main Video',
        clips: [clipSchema.parse({ id: 'old', assetId: 'first', startMs: 0, durationMs: 4000 })]
      })],
      storyboard: [{ id: 's1', title: 'Opening', description: 'One.', durationMs: 4000, assetId: 'first' }]
    }
    const adopted = assembleTimelineFromStoryboard(legacy, 'video-1', {}).project
    expect(clipsOf(adopted)).toEqual([expect.objectContaining({ id: 'old', sceneId: 's1' })])
  })
})

describe('planning the scene visual sync', () => {
  it('reports exactly the scenes whose clip shows the old media', () => {
    const replaced = assignAssetToScene(assembled(), 's1', 'replacement', { replace: true })
    const { outdated, skipped } = planSceneVisualSync(replaced, 'video-1')
    expect(skipped).toEqual([])
    expect(outdated).toEqual([expect.objectContaining({
      sceneId: 's1',
      title: 'Opening',
      currentAssetId: 'first',
      sceneAssetId: 'replacement',
      startMs: 0,
      durationMs: 4000,
      trimmedToSource: false
    })])
  })

  it('says nothing while the timeline matches the storyboard', () => {
    expect(planSceneVisualSync(assembled(), 'video-1').outdated).toEqual([])
  })

  it('explains the replacements it cannot place, instead of placing them', () => {
    const base = assembled()
    const offline: KinaouProject = {
      ...assignAssetToScene(base, 's1', 'replacement', { replace: true }),
      assets: base.assets.map((asset) => asset.id === 'replacement' ? { ...asset, offline: true } : asset)
    }
    expect(planSceneVisualSync(offline, 'video-1').skipped).toEqual([
      { sceneId: 's1', title: 'Opening', reason: 'Its visual is offline — reconnect the media first' }
    ])

    const cleared: KinaouProject = { ...base, storyboard: base.storyboard.map((scene) => scene.id === 's1' ? { id: scene.id, title: scene.title, description: scene.description, durationMs: scene.durationMs } : scene) }
    expect(planSceneVisualSync(cleared, 'video-1').skipped[0].reason).toMatch(/was cleared/)
  })
})

describe('syncing the scene visuals', () => {
  it('swaps the media without moving the scene or changing its length', () => {
    const project = assembled()
    const before = clipsOf(project)
    const result = syncSceneVisuals(assignAssetToScene(project, 's1', 'replacement', { replace: true }), 'video-1')
    const after = clipsOf(result.project)

    expect(result.updated.map((entry) => entry.sceneId)).toEqual(['s1'])
    expect(after[0]).toMatchObject({ assetId: 'replacement', startMs: before[0].startMs, durationMs: before[0].durationMs, sourceOffsetMs: 0 })
    expect(after[1]).toEqual(before[1])
    // The scene that follows still dissolves into it across the same overlap.
    expect(after[1].transitionIn).toEqual({ type: 'dissolve', durationMs: 500 })
  })

  it('drops the still-image motion when the replacement is footage', () => {
    const replaced = assignAssetToScene(assembled(), 's1', 'footage', { replace: true })
    expect(clipsOf(replaced)[0].motion).toBe('zoom-in')
    const after = clipsOf(syncSceneVisuals(replaced, 'video-1').project)
    expect(after[0].motion).toBeUndefined()
    // 1.5s of footage cannot fill a 4s scene, so the clip shortens to the real length.
    expect(after[0].durationMs).toBe(1500)
  })

  it('reports the shortened scene rather than pretending the footage is longer', () => {
    const result = syncSceneVisuals(assignAssetToScene(assembled(), 's1', 'footage', { replace: true }), 'video-1')
    expect(result.updated[0]).toMatchObject({ durationMs: 1500, trimmedToSource: true })
  })

  it('keeps a scene that was stretched to its narration at that longer length', () => {
    const base = assembled()
    const stretched: KinaouProject = {
      ...base,
      tracks: base.tracks.map((track) => ({ ...track, clips: track.clips.map((clip) => clip.sceneId === 's1' ? { ...clip, durationMs: 7000 } : clip) }))
    }
    const after = clipsOf(syncSceneVisuals(assignAssetToScene(stretched, 's1', 'replacement', { replace: true }), 'video-1').project)
    expect(after[0].durationMs).toBe(7000)
  })

  it('shortens a dissolve that no longer fits the clip it opens', () => {
    const base = assembled()
    const shortSource: KinaouProject = {
      ...base,
      assets: base.assets.map((asset) => asset.id === 'footage' ? { ...asset, metadata: { durationMs: 300 } } : asset)
    }
    const after = clipsOf(syncSceneVisuals(assignAssetToScene(shortSource, 's2', 'footage', { replace: true }), 'video-1').project)
    expect(after[1]).toMatchObject({ assetId: 'footage', durationMs: 300, transitionIn: { type: 'dissolve', durationMs: 300 } })
  })

  it('refuses a locked track and an unknown one', () => {
    const replaced = assignAssetToScene(assembled(), 's1', 'replacement', { replace: true })
    const locked = { ...replaced, tracks: replaced.tracks.map((track) => ({ ...track, locked: true })) }
    expect(() => syncSceneVisuals(locked, 'video-1')).toThrow(/"Main Video" is locked/)
    expect(() => planSceneVisualSync(replaced, 'nope')).toThrow(/not found: nope/)
  })

  it('changes nothing when there is nothing to change', () => {
    const project = assembled()
    expect(syncSceneVisuals(project, 'video-1').project).toBe(project)
  })
})
