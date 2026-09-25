import {
  parseAiEditorProposal,
  type AiEditorProposal
} from './aiEditor'

import {
  buildDirectorExecutionContext
} from './directorExecution'

import type {
  KinaouProject
} from './project'


type ProposalOperation =
  AiEditorProposal[
    'operations'
  ][number]


function linkedAsset(
  project: KinaouProject,
  assetId: string,
  sceneTitle: string
) {
  const asset =
    project.assets.find(
      item =>
        item.id === assetId
    )

  if (!asset) {
    throw new Error(
      `Director scene "${sceneTitle}" has a linked clip whose asset is missing.`
    )
  }

  if (asset.offline) {
    throw new Error(
      `Director scene "${sceneTitle}" has an offline linked clip.`
    )
  }

  if (
    !asset.managed
    || !asset.uri.startsWith(
      'KINAOU/Assets/'
    )
  ) {
    throw new Error(
      `Director scene "${sceneTitle}" has an unmanaged linked clip.`
    )
  }

  if (
    asset.kind !== 'image'
    && asset.kind !== 'video'
  ) {
    throw new Error(
      `Director scene "${sceneTitle}" requires a visual image or video clip.`
    )
  }

  return asset
}


function assertSafeDuration(
  project: KinaouProject,
  sceneTitle: string,
  clip: {
    assetId: string
    durationMs: number
    sourceOffsetMs: number
    speed: number
  },
  targetDurationMs: number
) {
  const asset =
    linkedAsset(
      project,
      clip.assetId,
      sceneTitle
    )

  if (
    asset.kind === 'image'
  ) {
    return
  }

  const sourceDuration =
    typeof asset.metadata
      .durationMs === 'number'
    && Number.isFinite(
      asset.metadata.durationMs
    )
    && asset.metadata.durationMs > 0
      ? Math.round(
          asset.metadata.durationMs
        )
      : undefined

  if (
    sourceDuration
      === undefined
  ) {
    if (
      targetDurationMs
        > clip.durationMs
    ) {
      throw new Error(
        `Director scene "${sceneTitle}" cannot safely extend its video clip because source duration is unknown.`
      )
    }

    return
  }

  const availableSourceMs =
    sourceDuration
    - clip.sourceOffsetMs

  const availableTimelineMs =
    Math.floor(
      availableSourceMs
      / clip.speed
    )

  if (
    availableTimelineMs < 0
    || targetDurationMs
      > availableTimelineMs
  ) {
    throw new Error(
      `Director scene "${sceneTitle}" does not have enough source video for its planned duration.`
    )
  }
}


function assertTrimEnvelopeSafe(
  project: KinaouProject,
  trackId: string,
  clipId: string,
  sceneTitle: string,
  targetDurationMs: number
) {
  const track =
    project.tracks.find(
      item =>
        item.id === trackId
    )

  const clip =
    track?.clips.find(
      item =>
        item.id === clipId
    )

  if (
    !track
    || !clip
  ) {
    throw new Error(
      `Director scene "${sceneTitle}" no longer has its linked clip.`
    )
  }

  if (
    clip.transitionIn
    && clip.transitionIn
      .durationMs
      > targetDurationMs
  ) {
    throw new Error(
      `Director scene "${sceneTitle}" needs manual transition review before it can be shortened.`
    )
  }

  if (
    clip.fades
    && (
      clip.fades.inMs
      + clip.fades.outMs
    ) > targetDurationMs
  ) {
    throw new Error(
      `Director scene "${sceneTitle}" needs manual fade review before it can be shortened.`
    )
  }
}


function operationId(
  sceneIndex: number,
  suffix: string
) {
  return (
    `director-${String(
      sceneIndex + 1
    ).padStart(
      3,
      '0'
    )}-${suffix}`
  )
}


export function buildDirectorEditProposal(
  project: KinaouProject
): AiEditorProposal | null {
  const context =
    buildDirectorExecutionContext(
      project
    )

  if (
    !context
    || !context.readiness.ready
  ) {
    throw new Error(
      'Director plan is not ready for executable timeline editing'
    )
  }

  const operations:
    ProposalOperation[] = []

  context.director.scenes
    .forEach(
      (
        scene,
        sceneIndex
      ) => {
        const clips =
          [...scene.clips]
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

        for (
          const clip
          of clips
        ) {
          linkedAsset(
            project,
            clip.assetId,
            scene.title
          )
        }

        if (
          clips.length === 1
        ) {
          const clip =
            clips[0]

          const needsMove =
            clip.startMs
              !== scene
                .plannedStartMs

          const needsTrim =
            clip.durationMs
              !== scene
                .plannedDurationMs

          if (needsTrim) {
            assertSafeDuration(
              project,
              scene.title,
              clip,
              scene
                .plannedDurationMs
            )

            assertTrimEnvelopeSafe(
              project,
              clip.trackId,
              clip.clipId,
              scene.title,
              scene
                .plannedDurationMs
            )

            operations.push({
              id:
                operationId(
                  sceneIndex,
                  'align-trim'
                ),

              reason:
                `Align "${scene.title}" with the accepted Director timing.`,

              edit: {
                type:
                  'trim-clip',

                trackId:
                  clip.trackId,

                clipId:
                  clip.clipId,

                startMs:
                  scene
                    .plannedStartMs,

                durationMs:
                  scene
                    .plannedDurationMs,

                sourceOffsetMs:
                  clip
                    .sourceOffsetMs
              }
            })

            return
          }

          if (needsMove) {
            operations.push({
              id:
                operationId(
                  sceneIndex,
                  'align-start'
                ),

              reason:
                `Move "${scene.title}" to its accepted Director start time.`,

              edit: {
                type:
                  'move-clip',

                trackId:
                  clip.trackId,

                clipId:
                  clip.clipId,

                startMs:
                  scene
                    .plannedStartMs
              }
            })
          }

          return
        }

        const earliestStart =
          Math.min(
            ...clips.map(
              clip =>
                clip.startMs
            )
          )

        const delta =
          scene.plannedStartMs
          - earliestStart

        if (delta === 0) {
          return
        }

        const moves =
          clips.map(
            clip => ({
              trackId:
                clip.trackId,

              clipId:
                clip.clipId,

              startMs:
                clip.startMs
                + delta
            })
          )

        if (
          moves.some(
            move =>
              move.startMs < 0
          )
        ) {
          throw new Error(
            `Director scene "${scene.title}" cannot be aligned without moving a clip before zero.`
          )
        }

        operations.push({
          id:
            operationId(
              sceneIndex,
              'align-group'
            ),

          reason:
            `Move all linked clips for "${scene.title}" together while preserving their relative timing.`,

          edit: {
            type:
              'move-clips',

            moves
          }
        })
      }
    )

  if (
    operations.length === 0
  ) {
    return null
  }

  if (
    operations.length > 500
  ) {
    throw new Error(
      'Director timing proposal exceeds the AI Editor 500-operation safety limit'
    )
  }

  return parseAiEditorProposal({
    schemaVersion:
      1,

    title:
      `Director timing · ${context.director.title}`
        .slice(
          0,
          200
        ),

    objective:
      (
        'Align existing scene-linked timeline clips with the accepted Director plan. '
        + context.director
          .objective
      ).slice(
        0,
        4000
      ),

    operations,

    provenance: {
      kind:
        'director-derived',

      adapterId:
        'kinaou-director-execution'
    }
  })
}
