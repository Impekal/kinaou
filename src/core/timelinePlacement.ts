import type { KinaouAsset, KinaouProject, TimelineTrack } from './project'
import { applyTimelineOperation } from './timeline'

const visualTracks = new Set<TimelineTrack['type']>(['video', 'broll', 'image', 'avatar', 'overlay'])
const audioTracks = new Set<TimelineTrack['type']>(['voice', 'dialog', 'music', 'sfx'])

export function compatibleTracks(project: KinaouProject, asset: KinaouAsset): TimelineTrack[] {
  return project.tracks.filter((track) => {
    if (asset.kind === 'video' || asset.kind === 'image') return visualTracks.has(track.type)
    if (asset.kind === 'audio') return audioTracks.has(track.type)
    if (asset.kind === 'caption') return track.type === 'caption'
    return false
  })
}

export function placeAssetOnTrack(project: KinaouProject, assetId: string, trackId: string): KinaouProject {
  const asset = project.assets.find((item) => item.id === assetId)
  if (!asset) throw new Error(`Asset not found: ${assetId}`)
  if (asset.offline) throw new Error('Offline asset cannot be placed on the timeline')
  if (!asset.managed || !asset.uri.startsWith('KINAOU/Assets/')) throw new Error('Only managed KINAOU assets can be placed as real media')
  const track = project.tracks.find((item) => item.id === trackId)
  if (!track) throw new Error(`Timeline track not found: ${trackId}`)
  if (!compatibleTracks(project, asset).some((item) => item.id === track.id)) throw new Error(`Asset kind ${asset.kind} is incompatible with track type ${track.type}`)
  const metadataDuration = typeof asset.metadata.durationMs === 'number' ? asset.metadata.durationMs : undefined
  const durationMs = metadataDuration && metadataDuration > 0 ? Math.round(metadataDuration) : asset.kind === 'image' ? 5000 : undefined
  if (!durationMs) throw new Error('Media duration is required before timeline placement')
  const startMs = track.clips.reduce((max, clip) => Math.max(max, clip.startMs + clip.durationMs), 0)
  return applyTimelineOperation(project, {
    type: 'add-clip',
    trackId,
    clip: {
      id: crypto.randomUUID(),
      assetId,
      startMs,
      durationMs,
      sourceOffsetMs: 0,
      gain: 1,
      speed: 1
    }
  })
}
