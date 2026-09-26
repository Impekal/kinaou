import type {
  KinaouProject,
  TimelineTrack
} from './project'

import {
  projectFormatReframing,
  projectTargetFormat
} from './render'

import {
  buildShortFinishingContext
} from './shortFinishing'


const visualTrackTypes =
  new Set<
    TimelineTrack['type']
  >([
    'video',
    'broll',
    'image',
    'avatar',
    'overlay'
  ])


export interface ShortReframeModelContext {
  schemaVersion:
    1

  project: {
    id:
      string

    title:
      string

    updatedAt:
      string

    targetFormat:
      ReturnType<
        typeof projectTargetFormat
      >

    durationMs:
      number
  }

  globalFocus: {
    focusX:
      number

    focusY:
      number
  }

  visualClips:
    Array<{
      trackId:
        string

      clipId:
        string

      sceneId:
        string

      trackType:
        TimelineTrack['type']

      startMs:
        number

      durationMs:
        number

      currentFocus: {
        focusX:
          number

        focusY:
          number
      }

      scene: {
        title:
          string

        description:
          string
      }

      asset: {
        kind:
          string

        name:
          string
      }
    }>

  policy: {
    noPixelAccess:
      true

    exactIdsOnly:
      true

    explicitSpatialEvidenceOnly:
      true

    reviewOnly:
      true

    automaticApply:
      false
  }
}


export function buildShortReframeModelContext(
  project:
    KinaouProject
): ShortReframeModelContext {
  const finishing =
    buildShortFinishingContext(
      project
    )

  if (
    !finishing.readiness
      .ready
  ) {
    throw new Error(
      'Short finishing context is not ready for local reframing assistance'
    )
  }

  const format =
    projectTargetFormat(
      project
    )

  const globalFrame =
    projectFormatReframing(
      project,
      format
    )

  if (
    globalFrame.fit
    !== 'cover'
  ) {
    throw new Error(
      'Local Short reframing assistance requires a cover target format'
    )
  }

  const scenes =
    new Map(
      project.storyboard.map(
        scene => [
          scene.id,
          scene
        ]
      )
    )

  const assets =
    new Map(
      project.assets.map(
        asset => [
          asset.id,
          asset
        ]
      )
    )

  const visualClips =
    project.tracks
      .filter(
        track =>
          !track.muted
          && !track.locked
          && visualTrackTypes
            .has(
              track.type
            )
      )
      .flatMap(
        track =>
          track.clips
            .flatMap(
              clip => {
                if (
                  !clip.sceneId
                ) {
                  return []
                }

                const scene =
                  scenes.get(
                    clip.sceneId
                  )

                const asset =
                  assets.get(
                    clip.assetId
                  )

                if (
                  !scene
                  || !asset
                ) {
                  return []
                }

                const name =
                  typeof asset.metadata
                    .name
                    === 'string'
                    ? asset.metadata
                      .name
                    : asset.kind

                return [{
                  trackId:
                    track.id,

                  clipId:
                    clip.id,

                  sceneId:
                    clip.sceneId,

                  trackType:
                    track.type,

                  startMs:
                    clip.startMs,

                  durationMs:
                    clip.durationMs,

                  currentFocus:
                    clip.reframe
                    ? {
                        focusX:
                          clip.reframe
                            .focusX,

                        focusY:
                          clip.reframe
                            .focusY
                      }
                    : {
                        focusX:
                          globalFrame
                            .focusX,

                        focusY:
                          globalFrame
                            .focusY
                      },

                  scene: {
                    title:
                      scene.title,

                    description:
                      scene.description
                  },

                  asset: {
                    kind:
                      asset.kind,

                    name
                  }
                }]
              }
            )
      )
      .sort(
        (
          a,
          b
        ) =>
          a.startMs
          - b.startMs
          || a.trackId
            .localeCompare(
              b.trackId
            )
          || a.clipId
            .localeCompare(
              b.clipId
            )
      )

  if (
    !visualClips.length
  ) {
    throw new Error(
      'Short has no editable scene-linked visual clips for reframing'
    )
  }

  return {
    schemaVersion:
      1,

    project: {
      id:
        project.id,

      title:
        project.title,

      updatedAt:
        project.updatedAt,

      targetFormat:
        format,

      durationMs:
        finishing.project
          .durationMs
    },

    globalFocus: {
      focusX:
        globalFrame.focusX,

      focusY:
        globalFrame.focusY
    },

    visualClips,

    policy: {
      noPixelAccess:
        true,

      exactIdsOnly:
        true,

      explicitSpatialEvidenceOnly:
        true,

      reviewOnly:
        true,

      automaticApply:
        false
    }
  }
}
