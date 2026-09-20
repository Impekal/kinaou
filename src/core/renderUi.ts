import type { KinaouProject } from './project'
import { clipSpeedFitsSource } from './timeline'

const renderableTrackTypes = new Set(['video', 'broll', 'image', 'avatar', 'overlay', 'voice', 'dialog', 'music', 'sfx', 'caption'])

export function renderOutputPath(project: KinaouProject, now = new Date(), variant?: string): string {
  const slug = project.title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'kinaou-project'
  const timestamp = now.toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')
  const suffix = (variant ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '')
  return `KINAOU/Renders/${slug}${suffix ? `_${suffix}` : ''}_${timestamp}.mp4`
}

export type RenderReadinessCode = 'empty' | 'unsupported' | 'missing' | 'offline' | 'caption' | 'unmanaged' | 'source'
export function renderReadiness(project: KinaouProject): { ready: boolean; reason?: string; code?: RenderReadinessCode; track?: string; speed?: number } {
  const activeTracks = project.tracks.filter((track) => !track.muted && track.clips.length > 0)
  if (!activeTracks.length) return { ready: false, code: 'empty', reason: 'Add at least one timeline clip before rendering.' }
  const unsupported = activeTracks.find((track) => !renderableTrackTypes.has(track.type))
  if (unsupported) return { ready: false, code: 'unsupported', track: unsupported.name, reason: `${unsupported.name} is not renderable yet. Remove or mute its clips before rendering.` }

  const referenced = new Set(activeTracks.flatMap((track) => track.clips.map((clip) => clip.assetId)))
  for (const assetId of referenced) {
    const asset = project.assets.find((item) => item.id === assetId)
    if (!asset) return { ready: false, code: 'missing', reason: 'A timeline clip references a missing asset.' }
    if (asset.offline) return { ready: false, code: 'offline', reason: 'Reconnect offline media before rendering.' }
    if (asset.kind === 'caption') {
      if (typeof asset.metadata.text !== 'string' || !asset.metadata.text.trim()) return { ready: false, code: 'caption', reason: 'A caption has no text.' }
      continue
    }
    if (!asset.managed || !asset.uri.startsWith('KINAOU/Assets/')) {
      return { ready: false, code: 'unmanaged', reason: 'Replace planning/external clips with managed KINAOU/Assets media before rendering.' }
    }
  }

  for (const track of activeTracks) {
    for (const clip of track.clips) {
      const asset = project.assets.find((item) => item.id === clip.assetId)
      if (!clipSpeedFitsSource(asset, clip, clip.speed)) {
        return { ready: false, code: 'source', track: track.name, speed: clip.speed, reason: `A ${clip.speed}× clip on "${track.name}" needs more source media than its asset has. Lower the speed, shorten the clip, or use Speed reset.` }
      }
    }
  }
  return { ready: true }
}
