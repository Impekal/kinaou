import { describe, expect, it } from 'vitest'
import { createProject, assetSchema, clipSchema, trackSchema } from '../src/core/project'
import { applyTimelineOperation } from '../src/core/timeline'
import { compatibleTracks, placeAssetOnTrack } from '../src/core/timelinePlacement'

describe('timeline media placement', () => {
  it('places managed video at the end of a compatible visual track', () => {
    const base = createProject('Placement')
    const asset = assetSchema.parse({ id: 'a1', kind: 'video', uri: 'KINAOU/Assets/video.mp4', managed: true, offline: false, metadata: { durationMs: 4000 } })
    const existing = clipSchema.parse({ id: 'old', assetId: asset.id, startMs: 1000, durationMs: 3000 })
    const track = trackSchema.parse({ id: 'v1', type: 'video', name: 'Main video', clips: [existing] })
    const project = { ...base, assets: [asset], tracks: [track] }
    expect(compatibleTracks(project, asset).map((item) => item.id)).toEqual(['v1'])
    const placed = placeAssetOnTrack(project, asset.id, track.id)
    expect(placed.tracks[0].clips).toHaveLength(2)
    expect(placed.tracks[0].clips[1].startMs).toBe(4000)
    expect(placed.tracks[0].clips[1].durationMs).toBe(4000)
  })

  it('uses five seconds as the initial duration for still images', () => {
    const base = createProject('Image')
    const asset = assetSchema.parse({ id: 'img', kind: 'image', uri: 'KINAOU/Assets/map.png', managed: true, offline: false, metadata: {} })
    const track = trackSchema.parse({ id: 'v1', type: 'video', name: 'Main video', clips: [] })
    const placed = placeAssetOnTrack({ ...base, assets: [asset], tracks: [track] }, asset.id, track.id)
    expect(placed.tracks[0].clips[0].durationMs).toBe(5000)
  })

  it('refuses incompatible and offline media', () => {
    const base = createProject('Safety')
    const audio = assetSchema.parse({ id: 'audio', kind: 'audio', uri: 'KINAOU/Assets/voice.wav', managed: true, offline: false, metadata: { durationMs: 1000 } })
    const videoTrack = trackSchema.parse({ id: 'v', type: 'video', name: 'Video', clips: [] })
    const project = { ...base, assets: [audio], tracks: [videoTrack] }
    expect(() => placeAssetOnTrack(project, audio.id, videoTrack.id)).toThrow(/incompatible/)
    expect(() => placeAssetOnTrack({ ...project, assets: [{ ...audio, offline: true }] }, audio.id, videoTrack.id)).toThrow(/Offline/)
  })
})

describe('timeline editing controls', () => {
  it('locks edits, supports mute state and bounds clip gain', () => {
    const base = createProject('Controls')
    const clip = clipSchema.parse({ id: 'c1', assetId: 'a1', startMs: 0, durationMs: 1000 })
    const track = trackSchema.parse({ id: 'a1', type: 'voice', name: 'Voice', clips: [clip] })
    const project = { ...base, tracks: [track] }
    const muted = applyTimelineOperation(project, { type: 'set-track-state', trackId: track.id, muted: true })
    expect(muted.tracks[0].muted).toBe(true)
    const gained = applyTimelineOperation(project, { type: 'set-clip-gain', trackId: track.id, clipId: clip.id, gain: 0.7 })
    expect(gained.tracks[0].clips[0].gain).toBe(0.7)
    const locked = applyTimelineOperation(project, { type: 'set-track-state', trackId: track.id, locked: true })
    expect(() => applyTimelineOperation(locked, { type: 'move-clip', trackId: track.id, clipId: clip.id, startMs: 500 })).toThrow(/locked/)
    expect(() => applyTimelineOperation(project, { type: 'set-clip-gain', trackId: track.id, clipId: clip.id, gain: 5 })).toThrow(/between 0 and 4/)
  })
})
