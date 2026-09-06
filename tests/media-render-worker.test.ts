import { describe, expect, it } from 'vitest'
import { registerAsset, markAssetAvailability } from '../src/core/assets'
import { createProjectFromInput } from '../src/core/create'
import { createRenderPlan, createTimelinePreviewPlan, preview1080pPreset } from '../src/core/render'
import { applyTimelineOperation } from '../src/core/timeline'
import { WorkerRegistry } from '../src/core/workers'
import { clipSchema, trackSchema } from '../src/core/project'

describe('asset registry', () => {
  it('registers an external media reference without copying or claiming ownership', () => {
    const project = createProjectFromInput({ title: 'Media', kind: 'idea', content: '' })
    const next = registerAsset(project, { kind: 'video', uri: 'file:///Volumes/Media/source.mov', name: 'Source', sizeBytes: 1200 })
    expect(next.assets).toHaveLength(1)
    expect(next.assets[0].managed).toBe(false)
    expect(next.assets[0].uri).toBe('file:///Volumes/Media/source.mov')
  })

  it('marks disconnected media offline without removing its project reference', () => {
    const project = registerAsset(createProjectFromInput({ title: 'Offline', kind: 'idea', content: '' }), { kind: 'audio', uri: 'file:///Volumes/SSD/audio.wav', name: 'Audio' })
    const next = markAssetAvailability(project, project.assets[0].id, true)
    expect(next.assets[0].offline).toBe(true)
    expect(next.assets).toHaveLength(1)
  })
})

describe('worker scheduling', () => {
  it('chooses the least-loaded online worker with every required capability', () => {
    const workers = new WorkerRegistry()
    workers.register({ id: 'mac', name: 'MacBook', platform: 'macOS', online: true, load: 0.6, capabilities: ['filesystem', 'ffmpeg'], memoryGb: 16 })
    workers.register({ id: 'pc', name: 'NVIDIA worker', platform: 'Windows', online: true, load: 0.2, capabilities: ['filesystem', 'ffmpeg', 'video-generation'], gpu: 'NVIDIA' })
    expect(workers.choose(['filesystem', 'ffmpeg'])?.id).toBe('pc')
    expect(workers.choose(['avatar'])).toBeNull()
  })
})

describe('render planning', () => {
  it('compiles timeline metadata into a deterministic worker-ready render plan', () => {
    let project = createProjectFromInput({ title: 'Render', kind: 'idea', content: '' })
    project = registerAsset(project, { kind: 'video', uri: 'file:///Volumes/SSD/clip.mov', name: 'Clip', durationMs: 5000 })
    project = applyTimelineOperation(project, {
      type: 'add-clip',
      trackId: project.tracks[0].id,
      clip: { id: 'clip-1', assetId: project.assets[0].id, startMs: 1000, durationMs: 5000, sourceOffsetMs: 0, gain: 1, speed: 1 }
    })
    const plan = createRenderPlan(project, preview1080pPreset, 'KINAOU/Renders/render.mp4')
    expect(plan.clips).toHaveLength(1)
    expect(plan.durationMs).toBe(6000)
    expect(plan.purpose).toBe('export')
    expect(plan.requiredCapabilities).toEqual(['filesystem', 'ffmpeg'])
  })

  it('creates a low-resolution composed preview plan only inside managed cache', () => {
    let project = createProjectFromInput({ title: 'Preview', kind: 'idea', content: '' })
    project = registerAsset(project, { kind: 'video', uri: 'KINAOU/Assets/clip.mov', name: 'Clip', durationMs: 5000, managed: true })
    project = applyTimelineOperation(project, { type: 'add-clip', trackId: project.tracks[0].id, clip: { id: 'clip-preview', assetId: project.assets[0].id, startMs: 0, durationMs: 5000, sourceOffsetMs: 0, gain: 1, speed: 1 } })
    const plan = createTimelinePreviewPlan(project)
    expect(plan.purpose).toBe('preview')
    expect(plan.outputRelativePath).toMatch(/^KINAOU\/Cache\/Previews\/.+\.mp4$/)
    expect(plan.preset).toMatchObject({ width: 960, height: 540 })
  })

  it('refuses render output outside the managed render directory', () => {
    const project = createProjectFromInput({ title: 'Unsafe', kind: 'idea', content: '' })
    expect(() => createRenderPlan(project, preview1080pPreset, 'Documents/render.mp4')).toThrow()
    expect(() => createRenderPlan(project, preview1080pPreset, 'KINAOU/Projects/render.mp4')).toThrow(/KINAOU\/Renders/)
  })

  it('blocks rendering when a referenced asset is offline', () => {
    let project = createProjectFromInput({ title: 'Offline render', kind: 'idea', content: '' })
    project = registerAsset(project, { kind: 'video', uri: 'file:///Volumes/SSD/missing.mov', name: 'Missing' })
    project = applyTimelineOperation(project, { type: 'add-clip', trackId: project.tracks[0].id, clip: { id: 'clip-x', assetId: project.assets[0].id, startMs: 0, durationMs: 1000, sourceOffsetMs: 0, gain: 1, speed: 1 } })
    project = markAssetAvailability(project, project.assets[0].id, true)
    expect(() => createRenderPlan(project, preview1080pPreset, 'KINAOU/Renders/offline.mp4')).toThrow(/offline/)
  })

  it('rejects retiming that reads beyond known source duration', () => {
    let project = createProjectFromInput({ title: 'Retiming bounds', kind: 'idea', content: '' })
    project = registerAsset(project, { kind: 'video', uri: 'KINAOU/Assets/short.mp4', name: 'Short', durationMs: 5000, managed: true })
    const track = trackSchema.parse({ id: 'video', type: 'video', name: 'Video', clips: [clipSchema.parse({ id: 'clip', assetId: project.assets[0].id, startMs: 0, durationMs: 4000, sourceOffsetMs: 0, speed: 2 })] })
    expect(() => createRenderPlan({ ...project, tracks: [track] }, preview1080pPreset, 'KINAOU/Renders/too-long.mp4')).toThrow(/source range/)
  })
})
