import type { KinaouProject } from './project'

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
  const referenced = new Set(project.tracks.flatMap((track) => track.clips.map((clip) => clip.assetId)))
  if (!referenced.size) return { ready: false, reason: 'Add at least one timeline clip before rendering.' }
  for (const assetId of referenced) {
    const asset = project.assets.find((item) => item.id === assetId)
    if (!asset) return { ready: false, reason: 'A timeline clip references a missing asset.' }
    if (asset.offline) return { ready: false, reason: 'Reconnect offline media before rendering.' }
    if (!asset.managed || !asset.uri.startsWith('KINAOU/Assets/')) {
      return { ready: false, reason: 'Replace planning/external clips with managed KINAOU/Assets media before rendering.' }
    }
  }
  if (project.tracks.some((track) => track.clips.some((clip) => clip.speed !== 1))) {
    return { ready: false, reason: 'Clip speed changes are not renderable yet.' }
  }
  return { ready: true }
}
