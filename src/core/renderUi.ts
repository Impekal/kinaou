import type { KinaouProject } from './project'

const renderableTrackTypes = new Set(['video', 'broll', 'image', 'avatar', 'overlay', 'voice', 'dialog', 'music', 'sfx'])

export function renderOutputPath(project: KinaouProject, now = new Date()): string {
  const slug = project.title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'kinaou-project'
  const timestamp = now.toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')
  return `KINAOU/Renders/${slug}_${timestamp}.mp4`
}

export function renderReadiness(project: KinaouProject): { ready: boolean; reason?: string } {
  const activeTracks = project.tracks.filter((track) => !track.muted && track.clips.length > 0)
  if (!activeTracks.length) return { ready: false, reason: 'Add at least one timeline clip before rendering.' }
  const unsupported = activeTracks.find((track) => !renderableTrackTypes.has(track.type))
  if (unsupported) return { ready: false, reason: `${unsupported.name} is not renderable yet. Remove or mute its clips before rendering.` }

  const referenced = new Set(activeTracks.flatMap((track) => track.clips.map((clip) => clip.assetId)))
  for (const assetId of referenced) {
    const asset = project.assets.find((item) => item.id === assetId)
    if (!asset) return { ready: false, reason: 'A timeline clip references a missing asset.' }
    if (asset.offline) return { ready: false, reason: 'Reconnect offline media before rendering.' }
    if (!asset.managed || !asset.uri.startsWith('KINAOU/Assets/')) {
      return { ready: false, reason: 'Replace planning/external clips with managed KINAOU/Assets media before rendering.' }
    }
  }
  if (activeTracks.some((track) => track.clips.some((clip) => clip.speed !== 1))) {
    return { ready: false, reason: 'Clip speed changes are not renderable yet.' }
  }
  return { ready: true }
}
