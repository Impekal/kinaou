import type { KinaouProject, TimelineClip, TimelineTrack } from './project'
import { applyTimelineOperation } from './timeline'
import { registerGeneratedVoice } from './generatedVoice'
import type { TtsJobRecord } from './ttsJobs'

const VOICE_TRACK_TYPES = new Set<TimelineTrack['type']>(['voice', 'dialog'])

export interface VoiceoverScene {
  sceneId: string
  title: string
  text: string
  startMs: number
  sceneDurationMs: number
}

export interface NarratedScene extends VoiceoverScene {
  assetId: string
  narrationMs: number
  /** Narration that runs past its scene, in ms — the editor's call, not ours to hide. */
  overrunMs: number
}

export interface SkippedVoiceoverScene {
  sceneId: string
  title: string
  reason: string
}

export function voiceoverTargetTracks(project: KinaouProject): TimelineTrack[] {
  return project.tracks.filter((track) => VOICE_TRACK_TYPES.has(track.type))
}

function narratedSceneIds(project: KinaouProject): Set<string> {
  return new Set(project.assets
    .filter((asset) => asset.kind === 'audio' && typeof asset.metadata.sceneId === 'string')
    .map((asset) => String(asset.metadata.sceneId)))
}

/**
 * The clip this scene put on the track. A storyboard may show one picture in two
 * scenes, so the stamp decides; only a clip that carries no stamp at all — placed
 * before scenes were recorded — is matched by its media.
 */
function clipForScene(track: TimelineTrack, sceneId: string, assetId: string): TimelineClip | undefined {
  return track.clips.find((clip) => clip.sceneId === sceneId)
    ?? track.clips.find((clip) => !clip.sceneId && clip.assetId === assetId)
}

/**
 * Works out which scenes still need narration and where it belongs, without running
 * anything. The caller drives the actual TTS jobs so each one stays cancellable and
 * individually reportable.
 */
export function planSceneVoiceovers(project: KinaouProject, visualTrackId: string): { pending: VoiceoverScene[]; skipped: SkippedVoiceoverScene[] } {
  const visualTrack = project.tracks.find((track) => track.id === visualTrackId)
  if (!visualTrack) throw new Error(`Timeline track not found: ${visualTrackId}`)
  if (!project.storyboard.length) throw new Error('This project has no storyboard scenes yet')

  const alreadyNarrated = narratedSceneIds(project)
  const pending: VoiceoverScene[] = []
  const skipped: SkippedVoiceoverScene[] = []

  for (const scene of project.storyboard) {
    if (alreadyNarrated.has(scene.id)) {
      skipped.push({ sceneId: scene.id, title: scene.title, reason: 'This scene already has narration' })
      continue
    }
    const text = scene.description.replace(/\s+/g, ' ').trim()
    if (!text) {
      skipped.push({ sceneId: scene.id, title: scene.title, reason: 'Scene has no description to read out' })
      continue
    }
    if (!scene.assetId) {
      skipped.push({ sceneId: scene.id, title: scene.title, reason: 'Scene has no visual on the timeline yet' })
      continue
    }
    const clip = clipForScene(visualTrack, scene.id, scene.assetId)
    if (!clip) {
      skipped.push({ sceneId: scene.id, title: scene.title, reason: `Its visual is not on "${visualTrack.name}" — assemble the timeline first` })
      continue
    }
    pending.push({ sceneId: scene.id, title: scene.title, text, startMs: clip.startMs, sceneDurationMs: clip.durationMs })
  }

  return { pending, skipped }
}

/**
 * Registers one finished narration job and places it under its scene. The voice keeps
 * its natural length: trimming a sentence to fit a picture would cut words off.
 */
export function placeSceneNarration(project: KinaouProject, scene: VoiceoverScene, job: TtsJobRecord, voiceTrackId: string): { project: KinaouProject; narrated: NarratedScene } {
  const track = project.tracks.find((entry) => entry.id === voiceTrackId)
  if (!track) throw new Error(`Timeline track not found: ${voiceTrackId}`)
  if (!VOICE_TRACK_TYPES.has(track.type)) throw new Error(`Narration needs a voice track, not ${track.type}`)
  if (track.locked) throw new Error(`"${track.name}" is locked. Unlock it before adding narration.`)

  const withAsset = registerGeneratedVoice(project, job, scene.text)
  const asset = withAsset.assets.find((entry) => entry.uri === job.audioPath)
  if (!asset) throw new Error('Generated narration was not registered')

  const narrationMs = Math.round(job.durationMs ?? 0)
  if (narrationMs <= 0) throw new Error('Generated narration has no duration')

  const tagged = {
    ...withAsset,
    assets: withAsset.assets.map((entry) => entry.id === asset.id
      ? { ...entry, metadata: { ...entry.metadata, sceneId: scene.sceneId, source: 'storyboard-description' } }
      : entry)
  }

  const next = applyTimelineOperation(tagged, {
    type: 'add-clip',
    trackId: voiceTrackId,
    clip: { id: crypto.randomUUID(), assetId: asset.id, startMs: scene.startMs, durationMs: narrationMs, sourceOffsetMs: 0, gain: 1, speed: 1 }
  })

  return {
    project: next,
    narrated: { ...scene, assetId: asset.id, narrationMs, overrunMs: Math.max(0, narrationMs - scene.sceneDurationMs) }
  }
}
