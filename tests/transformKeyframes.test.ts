import { describe, expect, it } from 'vitest'

import { buildCompositeFilter } from '../src/core/localWorker'
import { assetSchema, clipSchema, createProject, trackSchema } from '../src/core/project'
import { createRenderPlan, formatProfiles } from '../src/core/render'
import { applyTimelineOperation, interpolateTransformKeyframes } from '../src/core/timeline'

function project() {
  const asset = assetSchema.parse({
    id: 'asset',
    kind: 'video',
    uri: 'KINAOU/Assets/source.mp4',
    managed: true,
    offline: false,
    metadata: { durationMs: 8000, width: 1280, height: 720 }
  })

  const clip = clipSchema.parse({
    id: 'clip',
    assetId: asset.id,
    startMs: 1000,
    durationMs: 4000,
    sourceOffsetMs: 0,
    speed: 1,
    transform: {
      x: 0,
      y: 0,
      scale: 1,
      cropLeft: 0,
      cropTop: 0,
      cropRight: 0,
      cropBottom: 0
    }
  })

  const track = trackSchema.parse({
    id: 'video',
    type: 'video',
    name: 'Video',
    clips: [clip]
  })

  return {
    project: { ...createProject('Keyframes'), assets: [asset], tracks: [track] },
    track,
    clip
  }
}

const keyframes = {
  start: { x: -100, y: 50, scale: 1 },
  end: { x: 200, y: -50, scale: 1.5 }
}

describe('transform keyframes', () => {
  it('stores and removes validated start/end keyframes', () => {
    const fixture = project()

    const animated = applyTimelineOperation(fixture.project, {
      type: 'set-clip-transform-keyframes',
      trackId: fixture.track.id,
      clipId: fixture.clip.id,
      keyframes
    })

    expect(animated.tracks[0].clips[0].transformKeyframes).toEqual(keyframes)

    const cleared = applyTimelineOperation(animated, {
      type: 'set-clip-transform-keyframes',
      trackId: fixture.track.id,
      clipId: fixture.clip.id
    })

    expect(cleared.tracks[0].clips[0].transformKeyframes).toBeUndefined()
  })

  it('rejects invalid scale and locked-track changes', () => {
    const fixture = project()

    expect(() => applyTimelineOperation(fixture.project, {
      type: 'set-clip-transform-keyframes',
      trackId: fixture.track.id,
      clipId: fixture.clip.id,
      keyframes: {
        start: { x: 0, y: 0, scale: 0 },
        end: { x: 0, y: 0, scale: 1 }
      }
    })).toThrow(/scale/)

    const locked = {
      ...fixture.project,
      tracks: fixture.project.tracks.map((track) => ({ ...track, locked: true }))
    }

    expect(() => applyTimelineOperation(locked, {
      type: 'set-clip-transform-keyframes',
      trackId: fixture.track.id,
      clipId: fixture.clip.id,
      keyframes
    })).toThrow(/locked/)
  })

  it('interpolates exactly between the two transform points', () => {
    expect(interpolateTransformKeyframes(keyframes, 0)).toEqual(keyframes.start)
    expect(interpolateTransformKeyframes(keyframes, 1)).toEqual(keyframes.end)
    expect(interpolateTransformKeyframes(keyframes, 0.5)).toEqual({
      x: 50,
      y: 0,
      scale: 1.25
    })
  })

  it('splits an animation without restarting it in the second half', () => {
    const fixture = project()

    const animated = applyTimelineOperation(fixture.project, {
      type: 'set-clip-transform-keyframes',
      trackId: fixture.track.id,
      clipId: fixture.clip.id,
      keyframes
    })

    const split = applyTimelineOperation(animated, {
      type: 'split-clip',
      trackId: fixture.track.id,
      clipId: fixture.clip.id,
      splitMs: 2000,
      rightClipId: 'right'
    })

    const middle = interpolateTransformKeyframes(keyframes, 0.25)

    expect(split.tracks[0].clips[0].transformKeyframes).toEqual({
      start: keyframes.start,
      end: middle
    })

    expect(split.tracks[0].clips[1].transformKeyframes).toEqual({
      start: middle,
      end: keyframes.end
    })
  })

  it('transports keyframes into the render plan unchanged', () => {
    const fixture = project()

    const animated = applyTimelineOperation(fixture.project, {
      type: 'set-clip-transform-keyframes',
      trackId: fixture.track.id,
      clipId: fixture.clip.id,
      keyframes
    })

    const plan = createRenderPlan(
      animated,
      formatProfiles.landscape.export,
      'KINAOU/Renders/keyframes.mp4'
    )

    expect(plan.clips[0].transformKeyframes).toEqual(keyframes)
  })

  it('compiles position and scale keyframes into frame-evaluated FFmpeg expressions', () => {
    const fixture = project()

    const animated = applyTimelineOperation(fixture.project, {
      type: 'set-clip-transform-keyframes',
      trackId: fixture.track.id,
      clipId: fixture.clip.id,
      keyframes
    })

    const plan = createRenderPlan(
      animated,
      { ...formatProfiles.landscape.export, width: 640, height: 360 },
      'KINAOU/Renders/keyframes.mp4'
    )

    const graph = buildCompositeFilter(plan).graph

    expect(graph).toContain("eval=frame")
    expect(graph).toContain("min(1,max(0,t/4.000))")
    expect(graph).toContain("min(1,max(0,(t-1.000)/4.000))")
    expect(graph).toContain("(-100+(200--100)")
    expect(graph).toContain("(50+(-50-50)")
    expect(graph).toContain("(1+(1.5-1)")
  })

  it('keeps the existing static transform path when no keyframes exist', () => {
    const fixture = project()

    const plan = createRenderPlan(
      fixture.project,
      { ...formatProfiles.landscape.export, width: 640, height: 360 },
      'KINAOU/Renders/static.mp4'
    )

    const graph = buildCompositeFilter(plan).graph

    expect(graph).not.toContain('eval=frame')
    expect(graph).toContain('scale=iw*1:ih*1')
  })
})
