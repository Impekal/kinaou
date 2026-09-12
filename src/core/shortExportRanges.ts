import type { KinaouProject } from './project'

export interface ShortExportCandidate {
  id: string
  sceneIds: string[]
  titles: string[]
  inMs: number
  outMs: number
  durationMs: number
}

export interface SkippedShortScene { sceneId: string; title: string; reason: string }
export interface ShortExportPlan { candidates: ShortExportCandidate[]; skipped: SkippedShortScene[] }

const visualTracks = new Set(['video', 'broll', 'image', 'avatar', 'overlay'])

export function shortExportVariant(candidate: ShortExportCandidate): string {
  const title = candidate.titles.join('-').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'scenes'
  return `short-${title}-${Math.round(candidate.inMs)}-${Math.round(candidate.outMs)}`
}

export function planShortExportRanges(project: KinaouProject, maxDurationMs = 60_000): ShortExportPlan {
  if (!Number.isInteger(maxDurationMs) || maxDurationMs < 1000 || maxDurationMs > 10 * 60_000) throw new Error('Short export maximum must be between 1 second and 10 minutes.')
  const clips = project.tracks.filter((track) => !track.muted && visualTracks.has(track.type)).flatMap((track) => track.clips)
  const skipped: SkippedShortScene[] = []
  const ranges = project.storyboard.flatMap((scene) => {
    const matches = clips.filter((clip) => clip.sceneId === scene.id)
    if (!matches.length) {
      skipped.push({ sceneId: scene.id, title: scene.title, reason: 'Scene is not anchored to an active visual timeline clip.' })
      return []
    }
    const inMs = Math.min(...matches.map((clip) => clip.startMs))
    const outMs = Math.max(...matches.map((clip) => clip.startMs + clip.durationMs))
    if (outMs - inMs > maxDurationMs) {
      skipped.push({ sceneId: scene.id, title: scene.title, reason: `Scene is longer than the ${(maxDurationMs / 1000).toFixed(0)} s candidate limit.` })
      return []
    }
    return [{ sceneId: scene.id, title: scene.title, inMs, outMs }]
  }).sort((a, b) => a.inMs - b.inMs || a.sceneId.localeCompare(b.sceneId))

  const candidates: ShortExportCandidate[] = []
  let current: typeof ranges = []
  const flush = () => {
    if (!current.length) return
    const inMs = current[0].inMs
    const outMs = Math.max(...current.map((item) => item.outMs))
    candidates.push({ id: current.map((item) => item.sceneId).join('--'), sceneIds: current.map((item) => item.sceneId), titles: current.map((item) => item.title), inMs, outMs, durationMs: outMs - inMs })
    current = []
  }
  for (const range of ranges) {
    if (!current.length) { current = [range]; continue }
    const currentEnd = Math.max(...current.map((item) => item.outMs))
    if (range.inMs <= currentEnd + 1 && Math.max(currentEnd, range.outMs) - current[0].inMs <= maxDurationMs) current.push(range)
    else { flush(); current = [range] }
  }
  flush()
  return { candidates, skipped }
}
