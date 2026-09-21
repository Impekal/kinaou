import { describe, expect, it } from 'vitest'
import { clipSchema, trackSchema } from '../src/core/project'
import {
  TIMELINE_EDGE_SNAP_TOLERANCE_MS,
  TIMELINE_GRID_MS,
  timelineExtentMs,
  timelineMsToPx,
  timelinePxToMs,
  snapClipStart
} from '../src/core/timelineInteraction'

const moving = clipSchema.parse({
  id: 'moving',
  assetId: 'asset',
  startMs: 1000,
  durationMs: 1000
})

const video = trackSchema.parse({
  id: 'video',
  type: 'video',
  name: 'Video',
  clips: [
    moving,
    clipSchema.parse({
      id: 'neighbor',
      assetId: 'asset',
      startMs: 4000,
      durationMs: 2000
    })
  ]
})

const voice = trackSchema.parse({
  id: 'voice',
  type: 'voice',
  name: 'Voice',
  clips: [
    clipSchema.parse({
      id: 'voice-clip',
      assetId: 'audio',
      startMs: 8000,
      durationMs: 1000
    })
  ]
})

describe('direct timeline interaction geometry', () => {
  it('uses one exact time scale in both directions', () => {
    expect(timelineMsToPx(1000)).toBe(40)
    expect(timelineMsToPx(2500)).toBe(100)
    expect(timelinePxToMs(40)).toBe(1000)
    expect(timelinePxToMs(-4)).toBe(-100)
  })

  it('derives the visible extent from the latest clip edge', () => {
    expect(timelineExtentMs([video, voice])).toBe(9000)
    expect(timelineExtentMs([])).toBe(0)
  })

  it('snaps free movement to the 100 ms grid', () => {
    expect(TIMELINE_GRID_MS).toBe(100)
    expect(snapClipStart([video, voice], video.id, moving, 1236)).toBe(1200)
  })

  it('prefers nearby clip edges across tracks over the regular grid', () => {
    expect(TIMELINE_EDGE_SNAP_TOLERANCE_MS).toBe(150)

    // Moving clip start approaches the next visual clip start.
    expect(snapClipStart([video, voice], video.id, moving, 3910)).toBe(4000)

    // Moving clip end approaches the next visual clip start.
    expect(snapClipStart([video, voice], video.id, moving, 2910)).toBe(3000)

    // Cross-track alignment works too.
    expect(snapClipStart([video, voice], video.id, moving, 7920)).toBe(8000)
  })

  it('ignores the moving clip itself and clamps before zero', () => {
    expect(snapClipStart([video], video.id, moving, 1040)).toBe(1000)
    expect(snapClipStart([video], video.id, moving, -500)).toBe(0)
  })

  it('supports explicit free positioning when snapping is disabled', () => {
    expect(snapClipStart([video, voice], video.id, moving, 3911, false)).toBe(3911)
  })
})
