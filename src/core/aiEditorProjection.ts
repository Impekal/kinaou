import type {
  KinaouProject
} from './project'

import {
  clipSpeedFitsSource
} from './timeline'


export interface AiEditorTarget {
  trackId: string
  clipId: string
}


export function assertAiEditorProjectedState(
  project: KinaouProject,
  targets: AiEditorTarget[]
): void {
  const unique =
    new Map<string, AiEditorTarget>()

  for (
    const target
    of targets
  ) {
    unique.set(
      `${target.trackId}:${target.clipId}`,
      target
    )
  }

  for (
    const target
    of unique.values()
  ) {
    const track =
      project.tracks.find(
        item =>
          item.id ===
          target.trackId
      )

    const clip =
      track?.clips.find(
        item =>
          item.id ===
          target.clipId
      )

    if (
      !track
      || !clip
    ) {
      throw new Error(
        `Projected AI Editor target not found: ${target.trackId}/${target.clipId}`
      )
    }

    const asset =
      project.assets.find(
        item =>
          item.id ===
          clip.assetId
      )

    if (!asset) {
      throw new Error(
        `Projected AI Editor asset not found: ${clip.assetId}`
      )
    }

    if (
      clip.transitionIn
      && clip.transitionIn
        .durationMs
        > clip.durationMs
    ) {
      throw new Error(
        'Selected AI edits create a transition longer than its clip'
      )
    }

    if (
      clip.fades
      && (
        clip.fades.inMs
        + clip.fades.outMs
      ) > clip.durationMs
    ) {
      throw new Error(
        'Selected AI edits create fades longer than their clip'
      )
    }

    if (
      clip.motion
      && asset.kind !== 'image'
    ) {
      throw new Error(
        'AI Editor still-image motion can only target an image asset'
      )
    }

    if (
      !clipSpeedFitsSource(
        asset,
        clip,
        clip.speed
      )
    ) {
      throw new Error(
        'Selected AI edits exceed available source media'
      )
    }
  }
}
