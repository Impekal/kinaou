import { addCaption } from './captions'
import type { KinaouProject, TimelineClip, TimelineTrack } from './project'

const MAX_CAPTION_CHARS = 90
const MIN_CAPTION_MS = 700

export interface CaptionedScene {
  sceneId: string
  title: string
  captions: number
  startMs: number
  durationMs: number
}

export interface SkippedCaptionScene {
  sceneId: string
  title: string
  reason: string
}

export interface ScriptCaptionResult {
  project: KinaouProject
  captioned: CaptionedScene[]
  skipped: SkippedCaptionScene[]
}

/**
 * Splits scene prose into caption-sized chunks along sentence boundaries, falling
 * back to word boundaries for a sentence that is too long to read at once.
 */
export function splitCaptionText(text: string, maxChars = MAX_CAPTION_CHARS): string[] {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (!normalized) return []

  const sentences = normalized.match(/[^.!?…]+[.!?…]*\s*/g)?.map((part) => part.trim()).filter(Boolean) ?? [normalized]
  const chunks: string[] = []

  for (const sentence of sentences) {
    if (sentence.length <= maxChars) {
      const previous = chunks[chunks.length - 1]
      if (previous && `${previous} ${sentence}`.length <= maxChars) chunks[chunks.length - 1] = `${previous} ${sentence}`
      else chunks.push(sentence)
      continue
    }
    let current = ''
    for (const word of sentence.split(' ')) {
      const candidate = current ? `${current} ${word}` : word
      if (candidate.length > maxChars && current) {
        chunks.push(current)
        current = word
      } else {
        current = candidate
      }
    }
    if (current) chunks.push(current)
  }

  return chunks
}

/** Distributes a clip's duration over its caption chunks, weighted by text length. */
export function distributeCaptionTimings(chunks: string[], startMs: number, durationMs: number): Array<{ text: string; startMs: number; durationMs: number }> {
  if (!chunks.length) return []
  // A short clip cannot carry many captions without flashing them past unreadably.
  // The overflow is merged into the last caption rather than dropped: denser text
  // is acceptable, silently losing part of the script is not.
  const capacity = Math.max(1, Math.floor(durationMs / MIN_CAPTION_MS))
  const perChunk = chunks.length > capacity
    ? [...chunks.slice(0, capacity - 1), chunks.slice(capacity - 1).join(' ')]
    : chunks
  const totalChars = perChunk.reduce((sum, chunk) => sum + chunk.length, 0) || 1

  const timings: Array<{ text: string; startMs: number; durationMs: number }> = []
  let cursor = startMs
  perChunk.forEach((text, index) => {
    const last = index === perChunk.length - 1
    const share = last ? startMs + durationMs - cursor : Math.max(1, Math.round((text.length / totalChars) * durationMs))
    const bounded = Math.max(1, Math.min(share, startMs + durationMs - cursor))
    timings.push({ text, startMs: cursor, durationMs: bounded })
    cursor += bounded
  })
  return timings.filter((entry) => entry.durationMs > 0)
}

function captionedSceneIds(project: KinaouProject): Set<string> {
  return new Set(project.assets
    .filter((asset) => asset.kind === 'caption' && typeof asset.metadata.sceneId === 'string')
    .map((asset) => String(asset.metadata.sceneId)))
}

function clipForScene(track: TimelineTrack, assetId: string): TimelineClip | undefined {
  return track.clips.find((clip) => clip.assetId === assetId)
}

/**
 * Turns each storyboard scene's own description into timed captions, aligned to
 * where that scene's visual actually sits on the given track — so captions follow
 * the assembled timeline rather than the storyboard's planned durations.
 */
export function captionsFromStoryboard(project: KinaouProject, trackId: string): ScriptCaptionResult {
  const track = project.tracks.find((entry) => entry.id === trackId)
  if (!track) throw new Error(`Timeline track not found: ${trackId}`)
  if (!project.storyboard.length) throw new Error('This project has no storyboard scenes yet')
  const captionTrack = project.tracks.find((entry) => entry.type === 'caption')
  if (!captionTrack) throw new Error('Project has no caption track')
  if (captionTrack.locked) throw new Error('Caption track is locked. Unlock it before writing captions.')

  const alreadyCaptioned = captionedSceneIds(project)
  const captioned: CaptionedScene[] = []
  const skipped: SkippedCaptionScene[] = []
  let next = project

  for (const scene of project.storyboard) {
    if (alreadyCaptioned.has(scene.id)) {
      skipped.push({ sceneId: scene.id, title: scene.title, reason: 'This scene already has captions' })
      continue
    }
    if (!scene.assetId) {
      skipped.push({ sceneId: scene.id, title: scene.title, reason: 'Scene has no visual on the timeline yet' })
      continue
    }
    const clip = clipForScene(track, scene.assetId)
    if (!clip) {
      skipped.push({ sceneId: scene.id, title: scene.title, reason: `Its visual is not on "${track.name}" — assemble the timeline first` })
      continue
    }
    const chunks = splitCaptionText(scene.description)
    if (!chunks.length) {
      skipped.push({ sceneId: scene.id, title: scene.title, reason: 'Scene has no description to read out' })
      continue
    }

    const timings = distributeCaptionTimings(chunks, clip.startMs, clip.durationMs)
    for (const timing of timings) {
      next = addCaption(next, timing)
      const created = next.assets[next.assets.length - 1]
      next = { ...next, assets: next.assets.map((asset) => asset.id === created.id ? { ...asset, metadata: { ...asset.metadata, sceneId: scene.id, source: 'storyboard-description' } } : asset) }
    }
    captioned.push({ sceneId: scene.id, title: scene.title, captions: timings.length, startMs: clip.startMs, durationMs: clip.durationMs })
  }

  return { project: next, captioned, skipped }
}
