import { describe, expect, it } from 'vitest'
import { createRangeRenderPlan, validateRenderRange } from '../src/core/renderRange'
import { buildCompositeFilter } from '../src/core/localWorker'
import type { RenderClipStep, RenderPlan } from '../src/core/render'

const preset = { name: 'Test', container: 'mp4' as const, width: 640, height: 360, fps: 30, videoCodec: 'h264' as const, audioCodec: 'aac' as const }
const asset = { id: 'a1', kind: 'video' as const, uri: 'KINAOU/Assets/source.mp4', managed: true, offline: false, metadata: { durationMs: 20_000 } }
const baseClip: RenderClipStep = { trackId: 't1', trackType: 'video', trackIndex: 0, clipId: 'c1', asset, startMs: 1000, durationMs: 6000, sourceOffsetMs: 500, gain: 1, speed: 1, transform: { x: 0, y: 0, scale: 1, cropLeft: 0, cropTop: 0, cropRight: 0, cropBottom: 0 }, transitionIn: { type: 'dissolve', durationMs: 500 }, fades: { inMs: 400, outMs: 600 } }

function plan(clips: RenderClipStep[] = [baseClip]): RenderPlan {
  return { purpose: 'export', projectId: 'p1', outputRelativePath: 'KINAOU/Renders/full.mp4', preset, durationMs: 10_000, requiredCapabilities: ['filesystem', 'ffmpeg'], clips }
}

describe('range render plan', () => {
  it('rejects every invalid range with a visible reason', () => {
    expect(validateRenderRange({ inMs: 2000, outMs: 2000 }, 10_000).reason).toMatch(/later than In/)
    expect(validateRenderRange({ inMs: 0, outMs: 10_001 }, 10_000).reason).toMatch(/end of the timeline/)
    expect(validateRenderRange({ inMs: -1, outMs: 1000 }, 10_000).reason).toMatch(/before the start/)
  })

  it('drops outside clips and trims overlap relative to the range', () => {
    const before = { ...baseClip, clipId: 'before', startMs: 0, durationMs: 1000 }
    const after = { ...baseClip, clipId: 'after', startMs: 8000, durationMs: 1000 }
    const result = createRangeRenderPlan(plan([before, baseClip, after]), { inMs: 2000, outMs: 6000 }, 'KINAOU/Renders/range.mp4')
    expect(result.durationMs).toBe(4000)
    expect(result.clips.map((clip) => clip.clipId)).toEqual(['c1'])
    expect(result.clips[0]).toMatchObject({ startMs: 0, durationMs: 4000, sourceOffsetMs: 1500, fades: { inMs: 0, outMs: 0 } })
    expect(result.clips[0].transitionIn).toBeUndefined()
  })

  it('advances retimed source by cut timeline time times speed', () => {
    const result = createRangeRenderPlan(plan([{ ...baseClip, speed: 2 }]), { inMs: 2500, outMs: 5000 }, 'KINAOU/Renders/range.mp4')
    expect(result.clips[0].sourceOffsetMs).toBe(3500)
  })

  it('keeps edge fades and dissolve when the range starts exactly on the clip boundary', () => {
    const result = createRangeRenderPlan(plan(), { inMs: 1000, outMs: 5000 }, 'KINAOU/Renders/range.mp4')
    expect(result.clips[0].transitionIn).toEqual({ type: 'dissolve', durationMs: 500 })
    expect(result.clips[0].fades).toEqual({ inMs: 400, outMs: 0 })
  })

  it('recomputes zoompan frames from the trimmed still duration', () => {
    const still = { ...baseClip, asset: { ...asset, kind: 'image' as const, metadata: { width: 1280, height: 720 } }, startMs: 0, durationMs: 6000, motion: 'zoom-in' as const, transitionIn: undefined }
    const ranged = createRangeRenderPlan(plan([still]), { inMs: 0, outMs: 2000 }, 'KINAOU/Renders/range.mp4')
    expect(buildCompositeFilter(ranged).graph).toContain(':d=60:s=640x360:fps=30')
  })
})
