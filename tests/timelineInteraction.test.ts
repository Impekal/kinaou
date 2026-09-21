import { describe, expect, it } from 'vitest'
import { clipSchema, trackSchema } from '../src/core/project'
import {
  TIMELINE_EDGE_SNAP_TOLERANCE_MS,
  TIMELINE_GRID_MS,
  timelineExtentMs,
  timelineMsToPx,
  timelinePxToMs,
  snapClipStart,
  snapClipGroupDelta,
  snapTimelinePoint,
  trimClipEdge,
  TIMELINE_MIN_CLIP_MS
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

  it('snaps a playhead point to clip boundaries and otherwise to the regular grid', () => {
    expect(snapTimelinePoint([video, voice], '', '', 3920)).toBe(4000)
    expect(snapTimelinePoint([video, voice], '', '', 1236)).toBe(1200)
    expect(snapTimelinePoint([video, voice], '', '', 1236, false)).toBe(1236)
  })
})


describe('direct trim geometry', () => {
  const source = {
    id: 'asset',
    kind: 'video' as const,
    uri: 'KINAOU/Assets/source.mp4',
    managed: true,
    offline: false,
    metadata: { durationMs: 10000 }
  }

  const trimmed = clipSchema.parse({
    id: 'trimmed',
    assetId: source.id,
    startMs: 1000,
    durationMs: 2000,
    sourceOffsetMs: 1000,
    speed: 1
  })

  const trimTrack = trackSchema.parse({
    id: 'trim-track',
    type: 'video',
    name: 'Trim',
    clips: [
      trimmed,
      clipSchema.parse({
        id: 'next',
        assetId: source.id,
        startMs: 5000,
        durationMs: 1000
      })
    ]
  })

  it('moves the left edge while preserving the timeline end and source continuity', () => {
    expect(trimClipEdge([trimTrack], trimTrack.id, trimmed, source, 'start', 1500, false)).toEqual({
      startMs: 1500,
      durationMs: 1500,
      sourceOffsetMs: 1500
    })

    expect(trimClipEdge([trimTrack], trimTrack.id, trimmed, source, 'start', 500, false)).toEqual({
      startMs: 500,
      durationMs: 2500,
      sourceOffsetMs: 500
    })
  })

  it('never extends the left edge before available source media', () => {
    expect(trimClipEdge([trimTrack], trimTrack.id, trimmed, source, 'start', -5000, false)).toEqual({
      startMs: 0,
      durationMs: 3000,
      sourceOffsetMs: 0
    })
  })

  it('bounds the right edge by the available source duration', () => {
    expect(trimClipEdge([trimTrack], trimTrack.id, trimmed, source, 'end', 12000, false)).toEqual({
      startMs: 1000,
      durationMs: 9000,
      sourceOffsetMs: 1000
    })
  })

  it('honours the minimum, fades and transitions when shortening either edge', () => {
    expect(TIMELINE_MIN_CLIP_MS).toBe(250)

    const constrained = {
      ...trimmed,
      fades: { inMs: 400, outMs: 300 },
      transitionIn: { type: 'dissolve' as const, durationMs: 500 }
    }

    expect(trimClipEdge([trimTrack], trimTrack.id, constrained, source, 'end', 1100, false).durationMs).toBe(700)
    expect(trimClipEdge([trimTrack], trimTrack.id, constrained, source, 'start', 2900, false).durationMs).toBe(700)
  })

  it('snaps trim edges to other clip boundaries unless snapping is disabled', () => {
    expect(trimClipEdge([trimTrack], trimTrack.id, trimmed, source, 'end', 4910, true).durationMs).toBe(4000)
    expect(trimClipEdge([trimTrack], trimTrack.id, trimmed, source, 'end', 4911, false).durationMs).toBe(3911)
  })

  it('does not invent source offsets for still images', () => {
    const image = { ...source, kind: 'image' as const, metadata: {} }

    expect(trimClipEdge([trimTrack], trimTrack.id, trimmed, image, 'start', 500, false)).toEqual({
      startMs: 500,
      durationMs: 2500,
      sourceOffsetMs: 1000
    })
  })
})


describe('multi-clip movement snapping', () => {
  const members = [
    { trackId: 'video', clipId: 'moving', startMs: 1000, durationMs: 1000 },
    { trackId: 'voice', clipId: 'voice-clip', startMs: 8000, durationMs: 1000 }
  ]

  it('preserves relative spacing while snapping the anchor to an unselected edge', () => {
    const delta = snapClipGroupDelta(
      [video, voice],
      members,
      'video',
      'moving',
      2910,
      true
    )

    expect(delta).toBe(3000)
    expect(members.map((member) => member.startMs + delta)).toEqual([4000, 11000])
  })

  it('does not snap the group anchor against another selected clip', () => {
    expect(snapClipGroupDelta(
      [video, voice],
      members,
      'video',
      'moving',
      6910,
      true
    )).toBe(6900)
  })

  it('clamps the whole group at zero and supports free movement', () => {
    expect(snapClipGroupDelta(
      [video, voice],
      members,
      'video',
      'moving',
      -5000,
      false
    )).toBe(-1000)

    expect(snapClipGroupDelta(
      [video, voice],
      members,
      'video',
      'moving',
      123,
      false
    )).toBe(123)
  })
})
