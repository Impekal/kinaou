import { touchProject, type KinaouProject } from './project'
import type { TargetFormat } from './render'
import { renderOutputPath } from './renderUi'

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
export interface ShortExportBatchItem {
  id: string
  title: string
  inMs: number
  outMs: number
  durationMs: number
  outputPath: string
}

const visualTracks = new Set(['video', 'broll', 'image', 'avatar', 'overlay'])
export const defaultShortExportMaximumMs = 60_000

export function shortExportMaximumError(maxDurationMs: number): string | undefined {
  return !Number.isInteger(maxDurationMs) || maxDurationMs < 1000 || maxDurationMs > 10 * 60_000
    ? 'Short export maximum must be between 1 second and 10 minutes.'
    : undefined
}

export function projectShortExportMaximum(project: KinaouProject): number {
  const stored = project.metadata.shortExportMaximumMs
  return typeof stored !== 'number' || shortExportMaximumError(stored) ? defaultShortExportMaximumMs : stored
}

export function setProjectShortExportMaximum(project: KinaouProject, maxDurationMs: number, now = new Date()): KinaouProject {
  const error = shortExportMaximumError(maxDurationMs)
  if (error) throw new Error(error)
  if (projectShortExportMaximum(project) === maxDurationMs && project.metadata.shortExportMaximumMs === maxDurationMs) return project
  return touchProject({ ...project, metadata: { ...project.metadata, shortExportMaximumMs: maxDurationMs } }, now)
}

export function shortExportVariant(candidate: ShortExportCandidate): string {
  const title = candidate.titles.join('-').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'scenes'
  return `short-${title}-${Math.round(candidate.inMs)}-${Math.round(candidate.outMs)}`
}

export function shortPreviewOutputPath(project: KinaouProject, candidate: ShortExportCandidate, format: TargetFormat): string {
  if (format !== 'landscape' && format !== 'vertical' && format !== 'square') throw new Error('Unknown Short preview format.')
  const projectId = project.id.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 40)
  if (!projectId) throw new Error('Project id must form a safe Short preview path.')
  return `KINAOU/Cache/Previews/${projectId}_${format}_${shortExportVariant(candidate)}.mp4`
}

export function planShortExportBatch(project: KinaouProject, candidates: ShortExportCandidate[], selectedIds: string[], format: TargetFormat, now = new Date()): ShortExportBatchItem[] {
  const selected = new Set(selectedIds)
  if (!selected.size) throw new Error('Select at least one reviewed Short candidate.')
  const known = new Set(candidates.map((candidate) => candidate.id))
  const unknown = [...selected].find((id) => !known.has(id))
  if (unknown) throw new Error('A selected Short candidate is no longer available. Review the current ranges again.')
  const items = candidates.filter((candidate) => selected.has(candidate.id)).map((candidate) => ({
    id: candidate.id,
    title: candidate.titles.join(' + '),
    inMs: candidate.inMs,
    outMs: candidate.outMs,
    durationMs: candidate.durationMs,
    outputPath: renderOutputPath(project, now, `${format}-${shortExportVariant(candidate)}`)
  }))
  if (new Set(items.map((item) => item.outputPath)).size !== items.length) throw new Error('Selected Short candidates do not have unique export identities.')
  return items
}

export function planShortExportRanges(project: KinaouProject, maxDurationMs = defaultShortExportMaximumMs): ShortExportPlan {
  const maximumError = shortExportMaximumError(maxDurationMs)
  if (maximumError) throw new Error(maximumError)
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
