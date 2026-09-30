import { parseProject, type KinaouAsset, type KinaouProject } from './project'
import { parseFootballTactics } from './footballTactics'
import { assertSafeManagedPath } from './storage'
export interface FootballSequenceDraft { name: string; startMs: number; steps: Array<{ assetId: string; durationMs: number }> }
export interface FootballSequenceReview { draft: FootballSequenceDraft; endMs: number; trackId: string }
export function footballSequenceAsset(asset: KinaouAsset) {
  try {
    if (asset.kind !== 'image' || asset.offline || !asset.managed || !asset.uri.startsWith('KINAOU/Assets/') || asset.metadata.sourceKind !== 'authored-football-tactics-v1') return false
    assertSafeManagedPath(asset.uri); parseFootballTactics(asset.metadata.board); return true
  } catch { return false }
}
const bindings = new WeakMap<FootballSequenceReview, { project: string; review: string; next: KinaouProject; snapshot: boolean; complete: boolean }>()
/** Authored hard-cut static sequence. No automatic timing, animation or media generation. */
export function reviewFootballSequence(project: KinaouProject, input: FootballSequenceDraft): FootballSequenceReview {
  if (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 120 || /[\x00-\x1f\x7f]/.test(input.name) || !Number.isSafeInteger(input.startMs) || input.startMs < 0 || input.startMs > 3600000 || !Array.isArray(input.steps) || input.steps.length < 2 || input.steps.length > 12) throw Error('Choose a name, start within one hour, and 2–12 saved tactics graphics')
  const draft: FootballSequenceDraft = { name: input.name.trim(), startMs: input.startMs, steps: input.steps.map(step => {
    const asset = project.assets.find(a => a.id === step.assetId)
    if (!asset || !footballSequenceAsset(asset) || !Number.isSafeInteger(step.durationMs) || step.durationMs < 1000 || step.durationMs > 60000 || step.durationMs % 100 !== 0) throw Error('Each step needs an available authored image and 1–60 seconds in 0.1-second increments')
    return { assetId: asset.id, durationMs: step.durationMs }
  }) }
  const trackId = crypto.randomUUID(); let cursor = draft.startMs
  const clips = draft.steps.map(step => { const startMs = cursor; cursor += step.durationMs; return { id: crypto.randomUUID(), assetId: step.assetId, startMs, durationMs: step.durationMs } })
  const next = parseProject({ ...project, updatedAt: new Date().toISOString(), tracks: [...project.tracks, { id: trackId, type: 'image', name: draft.name, clips }] })
  const review = { draft, endMs: cursor, trackId }
  bindings.set(review,{project:JSON.stringify(project),review:JSON.stringify(review),next,snapshot:false,complete:false}); return review
}
/** One prepared insertion retains its IDs and pre-change snapshot across save-only retries. */
export function commitFootballSequence(project: KinaouProject, review: FootballSequenceReview, confirmed: boolean, snapshot: (project: KinaouProject) => void, persist: (project: KinaouProject) => void) {
  const bound = bindings.get(review)
  if (!confirmed || !bound || bound.complete || bound.project !== JSON.stringify(project) || bound.review !== JSON.stringify(review)) throw Error('Review the unchanged project and sequence before creating the track')
  if (!bound.snapshot) { snapshot(project); bound.snapshot = true }
  persist(structuredClone(bound.next)); bound.complete = true
}
