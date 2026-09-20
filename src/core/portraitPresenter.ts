import { z } from 'zod'
import { parseProject, touchProject, type KinaouAsset, type KinaouProject } from './project'
import { assertSafeManagedPath } from './storage'

export const portraitPresenterInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  portraitAssetId: z.string().min(1),
  narrationAssetId: z.string().min(1)
}).strict()
export type PortraitPresenterInput = z.infer<typeof portraitPresenterInputSchema>

export function presenterAssetAvailable(asset: KinaouAsset): boolean {
  try { return asset.managed && !asset.offline && assertSafeManagedPath(asset.uri) === asset.uri && asset.uri.startsWith('KINAOU/Assets/') }
  catch { return false }
}

/** This is a voiced still portrait, never an animated/lip-synced avatar claim. */
export function planPortraitPresenter(project: KinaouProject, input: PortraitPresenterInput) {
  const checked = portraitPresenterInputSchema.safeParse(input)
  if (!checked.success) throw new Error('Enter a presenter name (up to 80 characters), then choose a portrait and a narration.')
  const parsed = checked.data
  const portrait = project.assets.find((asset) => asset.id === parsed.portraitAssetId)
  const narration = project.assets.find((asset) => asset.id === parsed.narrationAssetId)
  if (!portrait || portrait.kind !== 'image' || !presenterAssetAvailable(portrait)) throw new Error('Choose an online managed portrait image.')
  if (!narration || narration.kind !== 'audio' || !presenterAssetAvailable(narration)) throw new Error('Choose an online managed narration asset.')
  const measured = narration.metadata.durationMs
  if (typeof measured !== 'number' || !Number.isFinite(measured) || measured < 1 || measured > 3600000) throw new Error('Narration needs a measured duration between 1 ms and one hour.')
  const durationMs = Math.round(measured)
  // Append after every track, even muted/locked tracks; never overlap existing work.
  const startMs = project.tracks.reduce((end, track) => track.clips.reduce((end, clip) => Math.max(end, clip.startMs + clip.durationMs), end), 0)
  if (!Number.isSafeInteger(startMs) || startMs + durationMs > 86400000) throw new Error('The resulting timeline would exceed the one-day presenter placement limit.')
  return { ...parsed, portrait, narration, startMs, durationMs }
}

export function appendPortraitPresenter(project: KinaouProject, input: PortraitPresenterInput, now = new Date()): KinaouProject {
  const plan = planPortraitPresenter(project, input)
  const id = crypto.randomUUID()
  const clip = { startMs: plan.startMs, durationMs: plan.durationMs, sourceOffsetMs: 0, gain: 1, speed: 1 }
  // New paired tracks keep existing locked/muted tracks and original provenance untouched.
  // Both are ordinary editable clips consumed by the existing real compositor.
  return parseProject(touchProject({ ...project, tracks: [...project.tracks,
    { id: `presenter-${id}-visual`, type: 'avatar', name: `${plan.name} · still portrait`, muted: false, locked: false, clips: [{ ...clip, id: `${id}-portrait`, assetId: plan.portrait.id }] },
    { id: `presenter-${id}-voice`, type: 'voice', name: `${plan.name} · narration`, muted: false, locked: false, clips: [{ ...clip, id: `${id}-narration`, assetId: plan.narration.id }] }
  ] }, now))
}
