import { planCaptionAlignment } from './captionAlignment'
import { projectExportHistory } from './exportHistory'
import { planNarrationFit } from './narrationFit'
import type { KinaouProject } from './project'
import { sceneSpeech } from './sceneSpeech'
import { voiceoverTargetTracks } from './sceneVoiceover'
import { assemblyTargetTracks } from './storyboardAssembly'

/** In the order a video is normally made. */
export const journeyStages = ['plan', 'visuals', 'assemble', 'narration', 'fit', 'captions', 'align', 'export'] as const
export type JourneyStage = typeof journeyStages[number]

/**
 * done    — nothing countable is left in this stage
 * open    — there is something to do here now
 * waiting — an earlier stage has to happen first
 * unknown — the saved data could not be read; never shown as done
 */
export type JourneyState = 'done' | 'open' | 'waiting' | 'unknown'

/** Where in the app the stage is worked on. */
export type JourneyTarget = 'Director' | 'Studio'

export interface JourneyStep {
  stage: JourneyStage
  state: JourneyState
  target: JourneyTarget
  /** How many scenes (or items) are finished out of how many the stage concerns. */
  done: number
  total: number
}

export interface ProjectJourney {
  steps: JourneyStep[]
  /** The first stage with something to do, or null when nothing countable is open. */
  next: JourneyStep | null
}

const targets: Record<JourneyStage, JourneyTarget> = {
  plan: 'Director', visuals: 'Director', assemble: 'Studio', narration: 'Studio', fit: 'Studio', captions: 'Studio', align: 'Studio', export: 'Studio'
}

function sceneIdsOfKind(project: KinaouProject, kind: 'audio' | 'caption'): Set<string> {
  return new Set(project.assets.filter(asset => asset.kind === kind && typeof asset.metadata.sceneId === 'string').map(asset => String(asset.metadata.sceneId)))
}

/** The visual track that carries the scenes: the one holding the most of them. */
function sceneTrack(project: KinaouProject) {
  let best: { id: string; placed: Set<string> } | null = null
  for (const track of assemblyTargetTracks(project)) {
    const placed = new Set<string>()
    for (const scene of project.storyboard) {
      if (track.clips.some(clip => clip.sceneId === scene.id || (!clip.sceneId && Boolean(scene.assetId) && clip.assetId === scene.assetId))) placed.add(scene.id)
    }
    if (!best || placed.size > best.placed.size) best = { id: track.id, placed }
  }
  return best
}

/**
 * Reads where a project stands on the way from a plan to an exported video. It counts
 * what is saved and nothing else: a stage that reads "done" has nothing countable left,
 * which is not the same as being good. It changes nothing and starts nothing.
 */
export function projectJourney(project: KinaouProject): ProjectJourney {
  const scenes = project.storyboard
  const steps: JourneyStep[] = []
  const add = (stage: JourneyStage, done: number, total: number, ready: boolean) => {
    const state: JourneyState = !ready ? 'waiting' : done >= total && total > 0 ? 'done' : 'open'
    steps.push({ stage, state, target: targets[stage], done, total })
  }
  const unknown = (stage: JourneyStage) => { steps.push({ stage, state: 'unknown', target: targets[stage], done: 0, total: 0 }) }

  // A new project carries the author's description as one placeholder scene. That is a
  // starting point for Director, not a plan.
  const source = project.metadata.sourceInput as { content?: unknown } | undefined
  const placeholderOnly = scenes.length === 1 && !project.script.trim() && !Object.hasOwn(project.metadata, 'directorPlan')
    && typeof source?.content === 'string' && scenes[0].description === source.content && scenes[0].narration === undefined
  add('plan', scenes.length && !placeholderOnly ? 1 : 0, 1, true)
  const fulfilled = scenes.filter(scene => Boolean(scene.assetId))
  add('visuals', fulfilled.length, scenes.length, scenes.length > 0)

  const track = sceneTrack(project)
  const placed = track?.placed ?? new Set<string>()
  add('assemble', fulfilled.filter(scene => placed.has(scene.id)).length, fulfilled.length, fulfilled.length > 0)

  // Only scenes that are on the timeline and have something to say can be narrated or captioned.
  const speaking = scenes.filter(scene => placed.has(scene.id) && Boolean(sceneSpeech(scene).text))
  const narrated = sceneIdsOfKind(project, 'audio')
  add('narration', speaking.filter(scene => narrated.has(scene.id)).length, speaking.length, speaking.length > 0)

  const voiceTrack = voiceoverTargetTracks(project)[0]
  const anyNarration = speaking.some(scene => narrated.has(scene.id))
  if (!track || !voiceTrack || !anyNarration) add('fit', 0, 1, false)
  else {
    try {
      const overruns = planNarrationFit(project, track.id, voiceTrack.id).length
      const narratedCount = speaking.filter(scene => narrated.has(scene.id)).length
      add('fit', narratedCount - Math.min(overruns, narratedCount), narratedCount, true)
    } catch { unknown('fit') }
  }

  const captioned = sceneIdsOfKind(project, 'caption')
  add('captions', speaking.filter(scene => captioned.has(scene.id)).length, speaking.length, speaking.length > 0)

  const captionedCount = speaking.filter(scene => captioned.has(scene.id)).length
  if (!track || !captionedCount) add('align', 0, 1, false)
  else {
    try {
      const drifted = planCaptionAlignment(project, track.id).drifted.length
      add('align', captionedCount - Math.min(drifted, captionedCount), captionedCount, true)
    } catch { unknown('align') }
  }

  try { add('export', projectExportHistory(project).length ? 1 : 0, 1, placed.size > 0) } catch { unknown('export') }

  return { steps, next: steps.find(step => step.state === 'open') ?? null }
}

/** The areas a journey can start in, beyond the two the stages themselves use. */
export type JourneyEntryTarget = 'Research' | 'Course' | 'Sports' | 'Assets'

/**
 * For an author who set out on a journey other than "a video from an idea", the very
 * first step is in that journey's own area, not in Director. This applies only while
 * the project has no plan yet; afterwards the ordinary stages take over.
 */
export function journeyEntry(journey: string | null, next: JourneyStep | null): JourneyEntryTarget | null {
  if (next?.stage !== 'plan') return null
  if (journey === 'research') return 'Research'
  if (journey === 'course') return 'Course'
  if (journey === 'sports') return 'Sports'
  if (journey === 'shorts') return 'Assets'
  return null
}
