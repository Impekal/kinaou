import {
  z
} from 'zod'

import {
  parseProject,
  type KinaouProject,
  type TimelineTrack
} from './project'

import {
  projectFormatReframing,
  projectTargetFormat
} from './render'

import {
  buildShortFinishingContext
} from './shortFinishing'

import {
  applyTimelineOperation
} from './timeline'

import type {
  PersistentVersionHistory
} from './versioning'


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


const shortReframeOperationSchema =
  z.object({
    id:
      z.string()
        .trim()
        .min(1)
        .max(120),

    trackId:
      z.string()
        .trim()
        .min(1),

    clipId:
      z.string()
        .trim()
        .min(1),

    sceneId:
      z.string()
        .trim()
        .min(1),

    focusX:
      z.number()
        .min(0)
        .max(1),

    focusY:
      z.number()
        .min(0)
        .max(1),

    reason:
      z.string()
        .trim()
        .min(1)
        .max(1000)
  })
  .strict()


export const shortReframeProposalSchema =
  z.object({
    schemaVersion:
      z.literal(1),

    title:
      z.string()
        .trim()
        .min(1)
        .max(200),

    objective:
      z.string()
        .trim()
        .min(1)
        .max(3000),

    operations:
      z.array(
        shortReframeOperationSchema
      )
      .min(1)
      .max(100),

    provenance:
      z.object({
        kind:
          z.enum([
            'manual',
            'local-model'
          ]),

        adapterId:
          z.string()
            .trim()
            .min(1)
            .optional(),

        modelId:
          z.string()
            .trim()
            .min(1)
            .optional()
      })
      .strict()
  })
  .strict()
  .superRefine(
    (
      proposal,
      context
    ) => {
      const operationIds =
        new Set<string>()

      const targets =
        new Set<string>()

      proposal.operations
        .forEach(
          (
            operation,
            index
          ) => {
            if (
              operationIds.has(
                operation.id
              )
            ) {
              context.addIssue({
                code:
                  'custom',

                path: [
                  'operations',
                  index,
                  'id'
                ],

                message:
                  'Reframing operation IDs must be unique.'
              })
            }

            operationIds.add(
              operation.id
            )

            const target =
              `${operation.trackId}:${operation.clipId}`

            if (
              targets.has(
                target
              )
            ) {
              context.addIssue({
                code:
                  'custom',

                path: [
                  'operations',
                  index
                ],

                message:
                  'Each clip may have only one reframing operation per proposal.'
              })
            }

            targets.add(
              target
            )
          }
        )

      if (
        proposal.provenance.kind
        === 'local-model'
        && (
          !proposal.provenance
            .adapterId
          || !proposal.provenance
            .modelId
        )
      ) {
        context.addIssue({
          code:
            'custom',

          path: [
            'provenance'
          ],

          message:
            'Local-model reframing provenance requires adapter and model IDs.'
        })
      }
    }
  )


export type ShortReframeProposal =
  z.infer<
    typeof shortReframeProposalSchema
  >


export interface ShortReframeChange {
  operationId:
    string

  trackId:
    string

  clipId:
    string

  sceneId:
    string

  reason:
    string

  current: {
    focusX:
      number

    focusY:
      number
  }

  proposed: {
    focusX:
      number

    focusY:
      number
  }
}


export interface ShortReframeReview {
  proposal:
    ShortReframeProposal

  projectKey:
    string

  targetFormat:
    ReturnType<
      typeof projectTargetFormat
    >

  changes:
    ShortReframeChange[]
}


export function shortReframeProjectKey(
  project:
    KinaouProject
): string {
  return JSON.stringify(
    project
  )
}


export function parseShortReframeProposal(
  input:
    unknown
): ShortReframeProposal {
  return shortReframeProposalSchema
    .parse(
      input
    )
}


export function reviewShortReframeProposal(
  project:
    KinaouProject,

  input:
    unknown
): ShortReframeReview {
  const finishing =
    buildShortFinishingContext(
      project
    )

  if (
    !finishing.readiness
      .ready
  ) {
    throw new Error(
      'Short finishing context is not ready for reframing review'
    )
  }

  const targetFormat =
    projectTargetFormat(
      project
    )

  const globalFrame =
    projectFormatReframing(
      project,
      targetFormat
    )

  if (
    globalFrame.fit
    !== 'cover'
  ) {
    throw new Error(
      'Per-clip Short reframing requires a cover target format'
    )
  }

  const proposal =
    parseShortReframeProposal(
      input
    )

  const changes =
    proposal.operations.map(
      operation => {
        const track =
          project.tracks.find(
            item =>
              item.id
              === operation.trackId
          )

        if (!track) {
          throw new Error(
            `Reframing track not found: ${operation.trackId}`
          )
        }

        if (
          !visualTrackTypes.has(
            track.type
          )
        ) {
          throw new Error(
            `Reframing target is not a visual track: ${track.id}`
          )
        }

        if (track.locked) {
          throw new Error(
            `Reframing target track is locked: ${track.id}`
          )
        }

        const clip =
          track.clips.find(
            item =>
              item.id
              === operation.clipId
          )

        if (!clip) {
          throw new Error(
            `Reframing clip not found: ${operation.clipId}`
          )
        }

        if (
          clip.sceneId
          !== operation.sceneId
        ) {
          throw new Error(
            `Reframing scene no longer matches clip: ${operation.clipId}`
          )
        }

        const current =
          clip.reframe
          ?? {
            focusX:
              globalFrame.focusX,

            focusY:
              globalFrame.focusY
          }

        const proposed = {
          focusX:
            Number(
              operation.focusX
                .toFixed(3)
            ),

          focusY:
            Number(
              operation.focusY
                .toFixed(3)
            )
        }

        if (
          current.focusX
            === proposed.focusX
          && current.focusY
            === proposed.focusY
        ) {
          throw new Error(
            `Reframing proposal contains no change for clip: ${operation.clipId}`
          )
        }

        return {
          operationId:
            operation.id,

          trackId:
            track.id,

          clipId:
            clip.id,

          sceneId:
            operation.sceneId,

          reason:
            operation.reason,

          current: {
            focusX:
              current.focusX,

            focusY:
              current.focusY
          },

          proposed
        }
      }
    )

  return {
    proposal,

    projectKey:
      shortReframeProjectKey(
        project
      ),

    targetFormat,

    changes
  }
}


export function applyShortReframeProposal(
  project:
    KinaouProject,

  proposal:
    ShortReframeProposal,

  selectedOperationIds:
    string[],

  now =
    new Date()
): KinaouProject {
  if (
    !selectedOperationIds.length
  ) {
    throw new Error(
      'Select at least one Short reframing operation'
    )
  }

  if (
    new Set(
      selectedOperationIds
    ).size
    !== selectedOperationIds
      .length
  ) {
    throw new Error(
      'Select each Short reframing operation only once'
    )
  }

  /*
   * Revalidate every proposal target against the current project before
   * touching anything. This also rejects locked/stale/non-visual targets.
   */
  reviewShortReframeProposal(
    project,
    proposal
  )

  const selected =
    new Set(
      selectedOperationIds
    )

  const known =
    new Set(
      proposal.operations.map(
        operation =>
          operation.id
      )
    )

  const unknown =
    [...selected].find(
      id =>
        !known.has(
          id
        )
    )

  if (unknown) {
    throw new Error(
      `Unknown Short reframing operation: ${unknown}`
    )
  }

  let next =
    project

  for (
    const operation
    of proposal.operations
  ) {
    if (
      !selected.has(
        operation.id
      )
    ) {
      continue
    }

    next =
      applyTimelineOperation(
        next,
        {
          type:
            'set-clip-reframe',

          trackId:
            operation.trackId,

          clipId:
            operation.clipId,

          reframe: {
            focusX:
              operation.focusX,

            focusY:
              operation.focusY
          }
        }
      )
  }

  const timestamp =
    now.toISOString()

  return parseProject({
    ...next,

    updatedAt:
      timestamp,

    metadata: {
      ...next.metadata,

      lastShortReframeApply: {
        proposal:
          structuredClone(
            proposal
          ),

        selectedOperationIds:
          [...selectedOperationIds],

        appliedAt:
          timestamp
      }
    }
  })
}


export function commitShortReframeReview(
  project:
    KinaouProject,

  review:
    ShortReframeReview,

  selectedOperationIds:
    string[],

  history:
    Pick<
      PersistentVersionHistory,
      'snapshot'
    >,

  persist:
    (
      project:
        KinaouProject
    ) => void,

  now =
    new Date()
): number {
  if (
    review.projectKey
    !== shortReframeProjectKey(
      project
    )
  ) {
    throw new Error(
      'The Short changed after reframing review. Review it again before applying.'
    )
  }

  const next =
    applyShortReframeProposal(
      project,
      review.proposal,
      selectedOperationIds,
      now
    )

  history.snapshot(
    project,
    `Before Short reframing: ${review.proposal.title}`,
    'system'
  )

  persist(
    next
  )

  return selectedOperationIds
    .length
}
