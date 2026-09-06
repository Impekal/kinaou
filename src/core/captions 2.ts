import { touchProject, type KinaouAsset, type KinaouProject, type TimelineTrack } from './project'
import { applyTimelineOperation } from './timeline'

export interface CaptionInput { text: string; startMs: number; durationMs: number }

function captionTrack(project: KinaouProject): TimelineTrack {
  const track = project.tracks.find((item) => item.type === 'caption')
  if (!track) throw new Error('Project has no caption track')
  if (track.locked) throw new Error('Caption track is locked')
  return track
}

export function addCaption(project: KinaouProject, input: CaptionInput): KinaouProject {
  const text = input.text.trim()
  if (!text) throw new Error('Caption text is required')
  if (!Number.isInteger(input.startMs) || input.startMs < 0) throw new Error('Caption start must be a non-negative integer')
  if (!Number.isInteger(input.durationMs) || input.durationMs <= 0) throw new Error('Caption duration must be a positive integer')
  const track = captionTrack(project)
  const assetId = crypto.randomUUID()
  const asset: KinaouAsset = { id: assetId, kind: 'caption', uri: `kinaou://caption/${assetId}`, managed: true, offline: false, metadata: { name: text.split('\n')[0].slice(0, 80), text } }
  const withAsset = touchProject({ ...project, assets: [...project.assets, asset] })
  return applyTimelineOperation(withAsset, { type: 'add-clip', trackId: track.id, clip: { id: crypto.randomUUID(), assetId, startMs: input.startMs, durationMs: input.durationMs, sourceOffsetMs: 0, gain: 1, speed: 1 } })
}

export function updateCaptionText(project: KinaouProject, assetId: string, text: string): KinaouProject {
  const normalized = text.trim()
  if (!normalized) throw new Error('Caption text is required')
  let found = false
  const assets = project.assets.map((asset) => {
    if (asset.id !== assetId) return asset
    if (asset.kind !== 'caption') throw new Error('Asset is not a caption')
    found = true
    return { ...asset, metadata: { ...asset.metadata, name: normalized.split('\n')[0].slice(0, 80), text: normalized } }
  })
  if (!found) throw new Error(`Caption asset not found: ${assetId}`)
  return touchProject({ ...project, assets })
}
