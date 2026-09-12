import type { RenderClipStep } from './render'

export interface AudioDuckingSettings {
  enabled: boolean
  reductionDb: number
  attackMs: number
  releaseMs: number
}

export const defaultAudioDucking: AudioDuckingSettings = { enabled: true, reductionDb: 12, attackMs: 150, releaseMs: 400 }

export function validateAudioDucking(value: AudioDuckingSettings): AudioDuckingSettings {
  if (typeof value.enabled !== 'boolean') throw new Error('Music ducking enabled must be boolean')
  if (!Number.isFinite(value.reductionDb) || value.reductionDb < 0 || value.reductionDb > 40) throw new Error('Music ducking reduction must be between 0 and 40 dB')
  if (!Number.isInteger(value.attackMs) || value.attackMs < 0 || value.attackMs > 5000) throw new Error('Music ducking attack must be between 0 and 5000 ms')
  if (!Number.isInteger(value.releaseMs) || value.releaseMs < 0 || value.releaseMs > 5000) throw new Error('Music ducking release must be between 0 and 5000 ms')
  return value
}

export interface TimeInterval { startMs: number; endMs: number }

export function speechIntervals(clips: RenderClipStep[], settings: AudioDuckingSettings): TimeInterval[] {
  if (!settings.enabled || settings.reductionDb === 0) return []
  const expanded = clips
    .filter((clip) => clip.trackType === 'voice' || clip.trackType === 'dialog')
    .map((clip) => ({ startMs: Math.max(0, clip.startMs - settings.attackMs), endMs: clip.startMs + clip.durationMs + settings.releaseMs }))
    .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs)
  const merged: TimeInterval[] = []
  for (const interval of expanded) {
    const previous = merged.at(-1)
    if (previous && interval.startMs <= previous.endMs) previous.endMs = Math.max(previous.endMs, interval.endMs)
    else merged.push({ ...interval })
  }
  return merged
}
