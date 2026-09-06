import type { KinaouProject, TimelineClip, TimelineTrack } from './project'
import { touchProject } from './project'

export type TimelineOperation =
  | { type: 'add-track'; track: TimelineTrack }
  | { type: 'remove-track'; trackId: string }
  | { type: 'set-track-state'; trackId: string; muted?: boolean; locked?: boolean }
  | { type: 'add-clip'; trackId: string; clip: TimelineClip }
  | { type: 'remove-clip'; trackId: string; clipId: string }
  | { type: 'move-clip'; trackId: string; clipId: string; startMs: number }
  | { type: 'trim-clip'; trackId: string; clipId: string; startMs: number; durationMs: number; sourceOffsetMs: number }
  | { type: 'set-clip-gain'; trackId: string; clipId: string; gain: number }

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

function updateUnlockedTrack(project: KinaouProject, trackId: string, update: (track: TimelineTrack) => TimelineTrack): KinaouProject {
  return updateTrack(project, trackId, (track) => {
    if (track.locked) throw new Error('Track is locked')
    return update(track)
  })
}

function updateExistingClip(track: TimelineTrack, clipId: string, update: (clip: TimelineClip) => TimelineClip): TimelineTrack {
  let found = false
  const clips = track.clips.map((clip) => {
    if (clip.id !== clipId) return clip
    found = true
    return update(clip)
  })
  if (!found) throw new Error(`Timeline clip not found: ${clipId}`)
  return { ...track, clips }
}

export function applyTimelineOperation(project: KinaouProject, operation: TimelineOperation): KinaouProject {
  switch (operation.type) {
    case 'add-track':
      if (project.tracks.some((track) => track.id === operation.track.id)) throw new Error('Track id already exists')
      return touchProject({ ...project, tracks: [...project.tracks, operation.track] })
    case 'remove-track':
      return touchProject({ ...project, tracks: project.tracks.filter((track) => track.id !== operation.trackId) })
    case 'set-track-state':
      return updateTrack(project, operation.trackId, (track) => ({
        ...track,
        ...(operation.muted !== undefined ? { muted: operation.muted } : {}),
        ...(operation.locked !== undefined ? { locked: operation.locked } : {})
      }))
    case 'add-clip':
      return updateUnlockedTrack(project, operation.trackId, (track) => {
        if (track.clips.some((clip) => clip.id === operation.clip.id)) throw new Error('Clip id already exists')
        return { ...track, clips: [...track.clips, operation.clip] }
      })
    case 'remove-clip':
      return updateUnlockedTrack(project, operation.trackId, (track) => {
        if (!track.clips.some((clip) => clip.id === operation.clipId)) throw new Error(`Timeline clip not found: ${operation.clipId}`)
        return { ...track, clips: track.clips.filter((clip) => clip.id !== operation.clipId) }
      })
    case 'move-clip':
      if (operation.startMs < 0) throw new Error('Clip start must be non-negative')
      return updateUnlockedTrack(project, operation.trackId, (track) => updateExistingClip(track, operation.clipId, (clip) => ({ ...clip, startMs: operation.startMs })))
    case 'trim-clip':
      if (operation.startMs < 0 || operation.durationMs <= 0 || operation.sourceOffsetMs < 0) throw new Error('Invalid trim range')
      return updateUnlockedTrack(project, operation.trackId, (track) => updateExistingClip(track, operation.clipId, (clip) => ({
        ...clip,
        startMs: operation.startMs,
        durationMs: operation.durationMs,
        sourceOffsetMs: operation.sourceOffsetMs
      })))
    case 'set-clip-gain':
      if (!Number.isFinite(operation.gain) || operation.gain < 0 || operation.gain > 4) throw new Error('Clip gain must be between 0 and 4')
      return updateUnlockedTrack(project, operation.trackId, (track) => updateExistingClip(track, operation.clipId, (clip) => ({ ...clip, gain: operation.gain })))
  }
}
