import { describe, expect, it } from 'vitest'
import { assetSchema, clipSchema, createProject, trackSchema, type KinaouProject } from '../src/core/project'
import { applyTimelineOperation } from '../src/core/timeline'
import { createRenderPlan, formatProfiles } from '../src/core/render'
import { buildCompositeFilter } from '../src/core/localWorker'

function project(assetOverrides: Record<string, unknown> = {}, clipOverrides: Record<string, unknown> = {}): KinaouProject {
  const asset = assetSchema.parse({ id: 'a1', kind: 'image', uri: 'KINAOU/Assets/still.png', managed: true, offline: false, metadata: { width: 1280, height: 720, ...assetOverrides } })
  const clip = clipSchema.parse({ id: 'c1', assetId: 'a1', startMs: 0, durationMs: 3000, ...clipOverrides })
  return { ...createProject('Motion'), assets: [asset], tracks: [trackSchema.parse({ id: 't1', type: 'video', name: 'Main Video', clips: [clip] })] }
}

function graphFor(input: KinaouProject, preset = formatProfiles.landscape.export) {
  return buildCompositeFilter(createRenderPlan(input, preset, 'KINAOU/Renders/out.mp4')).graph
}

describe('clip motion', () => {
  it('is set, toggled off and rejected on locked tracks', () => {
    const base = project()
    const zoomed = applyTimelineOperation(base, { type: 'set-clip-motion', trackId: 't1', clipId: 'c1', motion: 'zoom-in' })
    expect(zoomed.tracks[0].clips[0].motion).toBe('zoom-in')

    const cleared = applyTimelineOperation(zoomed, { type: 'set-clip-motion', trackId: 't1', clipId: 'c1' })
    expect(cleared.tracks[0].clips[0].motion).toBeUndefined()

    const locked = { ...base, tracks: base.tracks.map((track) => ({ ...track, locked: true })) }
    expect(() => applyTimelineOperation(locked, { type: 'set-clip-motion', trackId: 't1', clipId: 'c1', motion: 'zoom-in' })).toThrow(/locked/)
  })

  it('survives the project schema round trip', () => {
    const zoomed = applyTimelineOperation(project(), { type: 'set-clip-motion', trackId: 't1', clipId: 'c1', motion: 'zoom-out' })
    expect(JSON.parse(JSON.stringify(zoomed)).tracks[0].clips[0].motion).toBe('zoom-out')
  })

  it('is refused on anything but a still image', () => {
    const video = project({}, { motion: 'zoom-in' })
    const asVideo = { ...video, assets: [{ ...video.assets[0], kind: 'video' as const, metadata: { ...video.assets[0].metadata, durationMs: 9000 } }] }
    expect(() => createRenderPlan(asVideo, formatProfiles.landscape.export, 'KINAOU/Renders/out.mp4')).toThrow(/still images/)
  })

  it('leaves the filter graph untouched when no motion is set', () => {
    expect(graphFor(project())).not.toContain('zoompan')
  })

  it('renders into the letterboxed size so the still is not stretched', () => {
    const graph = graphFor(project({}, { motion: 'zoom-in' }), { ...formatProfiles.landscape.export, width: 640, height: 640 })
    // 1280x720 inside a 640x640 canvas fits to 640x360.
    expect(graph).toContain('scale=640:360,zoompan=')
    // The canvas itself stays 640x640; only the zoom target follows the still.
    expect(graph).toContain(':d=90:s=640x360:fps=30')
    expect(graph).not.toContain('zoompan=z=\'min(1+0.18*on/90,1.18)\':x=\'iw/2-(iw/zoom/2)\':y=\'ih/2-(ih/zoom/2)\':d=90:s=640x640')
  })

  it('uses the whole canvas when the format crops to cover', () => {
    const graph = graphFor(project({}, { motion: 'zoom-in' }), { ...formatProfiles.landscape.export, width: 640, height: 640, fit: 'cover' })
    expect(graph).toContain('force_original_aspect_ratio=increase,crop=640:640,zoompan=')
    expect(graph).toContain(':d=90:s=640x640:fps=30')
  })

  it('falls back to a motionless still when the source pixels are unknown', () => {
    const unknown = project({ width: undefined, height: undefined }, { motion: 'zoom-in' })
    expect(graphFor(unknown)).not.toContain('zoompan')
  })

  it('ramps the zoom in the direction it promises', () => {
    expect(graphFor(project({}, { motion: 'zoom-in' }))).toContain("z='min(1+0.18*on/90,1.18)'")
    expect(graphFor(project({}, { motion: 'zoom-out' }))).toContain("z='max(1.18-0.18*on/90,1)'")
  })
})
