import { assertSafeManagedPath } from './storage'
import type { RenderClipStep, RenderPlan } from './render'

export interface RenderRange {
  inMs: number
  outMs: number
}

export interface RenderRangeCheck {
  valid: boolean
  reason?: string
}

export function validateRenderRange(range: RenderRange, timelineDurationMs: number): RenderRangeCheck {
  if (!Number.isInteger(range.inMs) || !Number.isInteger(range.outMs)) return { valid: false, reason: 'In and Out must resolve to whole milliseconds.' }
  if (range.inMs < 0) return { valid: false, reason: 'In cannot be before the start of the timeline.' }
  if (range.outMs <= range.inMs) return { valid: false, reason: 'Out must be later than In.' }
  if (range.outMs > timelineDurationMs) return { valid: false, reason: 'Out cannot be later than the end of the timeline.' }
  return { valid: true }
}

function trimClip(clip: RenderClipStep, range: RenderRange): RenderClipStep | null {
  const clipEndMs = clip.startMs + clip.durationMs
  if (clipEndMs <= range.inMs || clip.startMs >= range.outMs) return null

  const leftTrimMs = Math.max(0, range.inMs - clip.startMs)
  const rightTrimMs = Math.max(0, clipEndMs - range.outMs)
  const durationMs = clip.durationMs - leftTrimMs - rightTrimMs
  const fades = {
    inMs: leftTrimMs > 0 ? 0 : Math.min(clip.fades.inMs, durationMs),
    outMs: rightTrimMs > 0 ? 0 : Math.min(clip.fades.outMs, durationMs)
  }

  return {
    ...clip,
    startMs: Math.max(clip.startMs, range.inMs) - range.inMs,
    durationMs,
    sourceOffsetMs: clip.sourceOffsetMs + leftTrimMs * clip.speed,
    ...(leftTrimMs > 0 ? { transitionIn: undefined } : {}),
    fades
  }
}

export function createRangeRenderPlan(plan: RenderPlan, range: RenderRange, outputRelativePath: string): RenderPlan {
  const check = validateRenderRange(range, plan.durationMs)
  if (!check.valid) throw new Error(check.reason)
  const output = assertSafeManagedPath(outputRelativePath)
  const expectedArea = plan.purpose === 'preview' ? 'KINAOU/Cache/Previews/' : 'KINAOU/Renders/'
  if (!output.startsWith(expectedArea)) throw new Error(`Range ${plan.purpose} must stay inside ${expectedArea.slice(0, -1)}`)
  const clips = plan.clips.map((clip) => trimClip(clip, range)).filter((clip): clip is RenderClipStep => clip !== null)
  if (!clips.length) throw new Error('The selected range contains no renderable clips.')
  return { ...plan, outputRelativePath: output, durationMs: range.outMs - range.inMs, clips }
}
