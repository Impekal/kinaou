import { alignCaptionsToScenes } from './captionAlignment'
import { commitCaptionChange } from './captionEditing'
import { fitScenesToNarration } from './narrationFit'
import type { KinaouProject } from './project'
import { journeySceneTrackId, type JourneyStage } from './projectJourney'
import { voiceoverTargetTracks } from './sceneVoiceover'
import { captionsFromStoryboard } from './scriptCaptions'
import { assembleTimelineFromStoryboard, assemblyTargetTracks } from './storyboardAssembly'
import { commitStoryboardChange } from './storyboardEditing'
import type { PersistentVersionHistory } from './versioning'

/**
 * The stages that are pure arithmetic on the saved project: no model, no worker, no
 * file is involved, so they can be done from anywhere with one click. Planning, media,
 * narration and export start real work on the Mac and stay in their own panels.
 */
export const journeyActionStages = ['assemble', 'fit', 'captions', 'align'] as const
export type JourneyActionStage = typeof journeyActionStages[number]

export function isJourneyActionStage(stage: JourneyStage): stage is JourneyActionStage {
  return (journeyActionStages as readonly string[]).includes(stage)
}

export interface JourneyActionOutcome {
  project: KinaouProject
  stage: JourneyActionStage
  /** Scenes the step changed. Zero means nothing was saved and no version was written. */
  changed: number
  /** Scenes the step concerned but could not handle; the panel names the reason for each. */
  left: number
}

type History = Pick<PersistentVersionHistory, 'snapshot'>

/**
 * Does one stage exactly as its own panel does with its default settings — same
 * functions, same automatic version, same history label — on the track that carries
 * the scenes. It throws what the underlying step throws (a locked track, for example);
 * nothing is saved in that case.
 */
export function runJourneyAction(project: KinaouProject, stage: JourneyActionStage, history: History, persist: (project: KinaouProject) => void): JourneyActionOutcome {
  const visual = journeySceneTrackId(project) ?? assemblyTargetTracks(project)[0]?.id
  if (!visual) throw new Error('This project has no visual track')

  if (stage === 'assemble') {
    const result = commitStoryboardChange(project, () => assembleTimelineFromStoryboard(project, visual, { motion: true, crossfade: true }), history, persist, 'Before assembling scenes on the timeline')
    // "Already placed" and "has no visual yet" are not failures of this step.
    return { project: result.project, stage, changed: result.placed.length, left: result.skipped.filter(entry => entry.code !== 'already' && entry.code !== 'empty').length }
  }
  if (stage === 'fit') {
    const voice = voiceoverTargetTracks(project)[0]?.id
    if (!voice) throw new Error('This project has no voiceover track')
    const result = commitStoryboardChange(project, () => fitScenesToNarration(project, visual, voice), history, persist, 'Before fitting scenes to the narration')
    return { project: result.project, stage, changed: result.fitted.length, left: result.remaining.length }
  }
  if (stage === 'captions') {
    const result = captionsFromStoryboard(project, visual)
    const saved = result.captioned.length ? commitCaptionChange(project, () => result.project, history, persist, 'Before writing captions from the script') : project
    return { project: saved, stage, changed: result.captioned.length, left: result.skipped.filter(entry => entry.code === 'noVisual' || entry.code === 'notPlaced').length }
  }
  const result = alignCaptionsToScenes(project, visual)
  const saved = result.realigned.length ? commitCaptionChange(project, () => result.project, history, persist, 'Before realigning captions to their scenes') : project
  return { project: saved, stage, changed: result.realigned.length, left: result.skipped.length }
}
