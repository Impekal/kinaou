import type { KinaouProject, TimelineClip, TimelineTrack } from './project'
import { touchProject } from './project'

export type TimelineOperation =
  | { type: 'add-track'; track: TimelineTrack }
  | { type: 'remove-track'; trackId: string }
  | { type: 'add-clip'; trackId: string; clip: TimelineClip }
  | { type: 'remove-clip'; trackId: string; clipId: string }
  | { type: 'move-clip'; trackId: string; clipId: string; startMs: number }
  | { type: 'trim-clip'; trackId: string; clipId: string; startMs: number; durationMs: number; sourceOffsetMs: number }

function updateTrack(project: KinaouProject, trackId: string, update: (track: TimelineTrack) => TimelineTrack): KinaouProject {
  let found = false
  const tracks = project.tracks.map((track) => {
    if (track.id !== trackId) return track
    found = true
    return update(track)
  })
  if (!found) throw new Error(`Timeline track not found: ${trackId}`)
  return touchProject({ ...project, tracks })
}

export function applyTimelineOperation(project: KinaouProject, operation: TimelineOperation): KinaouProject {
  switch (operation.type) {
    case 'add-track':
      if (project.tracks.some((track) => track.id === operation.track.id)) throw new Error('Track id already exists')
      return touchProject({ ...project, tracks: [...project.tracks, operation.track] })
    case 'remove-track':
      return touchProject({ ...project, tracks: project.tracks.filter((track) => track.id !== operation.trackId) })
    case 'add-clip':
      return updateTrack(project, operation.trackId, (track) => {
        if (track.locked) throw new Error('Track is locked')
        if (track.clips.some((clip) => clip.id === operation.clip.id)) throw new Error('Clip id already exists')
        return { ...track, clips: [...track.clips, operation.clip] }
      })
    case 'remove-clip':
      return updateTrack(project, operation.trackId, (track) => {
        if (track.locked) throw new Error('Track is locked')
        return { ...track, clips: track.clips.filter((clip) => clip.id !== operation.clipId) }
      })
    case 'move-clip':
      if (operation.startMs < 0) throw new Error('Clip start must be non-negative')
      return updateTrack(project, operation.trackId, (track) => ({
        ...track,
        clips: track.clips.map((clip) => clip.id === operation.clipId ? { ...clip, startMs: operation.startMs } : clip)
      }))
    case 'trim-clip':
      if (operation.startMs < 0 || operation.durationMs <= 0 || operation.sourceOffsetMs < 0) throw new Error('Invalid trim range')
      return updateTrack(project, operation.trackId, (track) => ({
        ...track,
        clips: track.clips.map((clip) => clip.id === operation.clipId ? {
          ...clip,
          startMs: operation.startMs,
          durationMs: operation.durationMs,
          sourceOffsetMs: operation.sourceOffsetMs
        } : clip)
      }))
  }
}
