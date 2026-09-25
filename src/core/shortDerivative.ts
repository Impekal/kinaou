import {
  z
} from 'zod'

import {
  projectContentProfileSchema
} from './contentProfile'

import {
  createProject,
  parseProject,
  type KinaouProject
} from './project'

import type {
  ShortCutPlan
} from './shortCutPlan'


const derivativeEvidenceSchema =
  z.object({
    kind:
      z.enum([
        'scene',
        'transcript'
      ]),

    id:
      z.string()
        .trim()
        .min(1)
        .max(500)
  })
  .strict()


const derivativeSegmentSchema =
  z.object({
    position:
      z.number()
        .int()
        .positive(),

    candidateId:
      z.string()
        .trim()
        .min(1)
        .max(120),

    hook:
      z.string()
        .trim()
        .min(1)
        .max(500),

    rationale:
      z.string()
        .trim()
        .min(1)
        .max(3000),

    sourceInMs:
      z.number()
        .int()
        .nonnegative(),

    sourceOutMs:
      z.number()
        .int()
        .positive(),

    destinationInMs:
      z.number()
        .int()
        .nonnegative(),

    destinationOutMs:
      z.number()
        .int()
        .positive(),

    evidence:
      z.array(
        derivativeEvidenceSchema
      )
      .min(1)
      .max(50)
  })
  .strict()
  .superRefine(
    (
      segment,
      context
    ) => {
      if (
        segment.sourceOutMs
        <= segment.sourceInMs
      ) {
        context.addIssue({
          code:
            'custom',

          path: [
            'sourceOutMs'
          ],

          message:
            'Derivative Short source range must have a positive duration.'
        })
      }

      if (
        segment.destinationOutMs
        <= segment.destinationInMs
      ) {
        context.addIssue({
          code:
            'custom',

          path: [
            'destinationOutMs'
          ],

          message:
            'Derivative Short destination range must have a positive duration.'
        })
      }

      if (
        segment.sourceOutMs
          - segment.sourceInMs
        !==
        segment.destinationOutMs
          - segment.destinationInMs
      ) {
        context.addIssue({
          code:
            'custom',

          message:
            'Derivative Short source and destination segment durations must match.'
        })
      }
    }
  )


export const shortDerivativeLineageSchema =
  z.object({
    schemaVersion:
      z.literal(1),

    kind:
      z.literal(
        'short-derivative'
      ),

    sourceProjectId:
      z.string()
        .min(1),

    sourceProjectTitle:
      z.string()
        .min(1),

    sourceProjectUpdatedAt:
      z.string()
        .datetime(),

    sourceTimelineDurationMs:
      z.number()
        .int()
        .positive(),

    createdAt:
      z.string()
        .datetime(),

    cutTitle:
      z.string()
        .trim()
        .min(1)
        .max(200),

    objective:
      z.string()
        .trim()
        .min(1)
        .max(3000),

    maximumDurationMs:
      z.number()
        .int()
        .positive(),

    durationMs:
      z.number()
        .int()
        .positive(),

    selectedCandidateIds:
      z.array(
        z.string()
          .trim()
          .min(1)
          .max(120)
      )
      .min(1)
      .max(20),

    segments:
      z.array(
        derivativeSegmentSchema
      )
      .min(1)
      .max(20),

    materializedAt:
      z.string()
        .datetime()
        .optional()
  })
  .strict()
  .superRefine(
    (
      lineage,
      context
    ) => {
      if (
        lineage.durationMs
        > lineage.maximumDurationMs
      ) {
        context.addIssue({
          code:
            'custom',

          path: [
            'durationMs'
          ],

          message:
            'Derivative Short duration exceeds its configured maximum.'
        })
      }

      if (
        new Set(
          lineage
            .selectedCandidateIds
        ).size
        !== lineage
          .selectedCandidateIds
          .length
      ) {
        context.addIssue({
          code:
            'custom',

          path: [
            'selectedCandidateIds'
          ],

          message:
            'Derivative Short candidate IDs must be unique.'
        })
      }

      const segmentIds =
        lineage.segments.map(
          segment =>
            segment.candidateId
        )

      if (
        JSON.stringify(
          segmentIds
        )
        !== JSON.stringify(
          lineage
            .selectedCandidateIds
        )
      ) {
        context.addIssue({
          code:
            'custom',

          path: [
            'segments'
          ],

          message:
            'Derivative Short segments must match the selected candidate order.'
        })
      }

      lineage.segments
        .forEach(
          (
            segment,
            index
          ) => {
            if (
              segment.position
              !== index + 1
            ) {
              context.addIssue({
                code:
                  'custom',

                path: [
                  'segments',
                  index,
                  'position'
                ],

                message:
                  'Derivative Short segment positions must be contiguous from 1.'
              })
            }

            const expectedStart =
              index === 0
                ? 0
                : lineage
                  .segments[
                    index - 1
                  ]
                  .destinationOutMs

            if (
              segment.destinationInMs
              !== expectedStart
            ) {
              context.addIssue({
                code:
                  'custom',

                path: [
                  'segments',
                  index,
                  'destinationInMs'
                ],

                message:
                  'Derivative Short destination segments must be gapless.'
              })
            }
          }
        )

      if (
        lineage.segments
          .at(-1)
          ?.destinationOutMs
        !== lineage.durationMs
      ) {
        context.addIssue({
          code:
            'custom',

          path: [
            'durationMs'
          ],

          message:
            'Derivative Short duration must match the final destination boundary.'
        })
      }
    }
  )


export type ShortDerivativeLineage =
  z.infer<
    typeof shortDerivativeLineageSchema
  >


function derivativeTitle(
  source:
    KinaouProject,

  cut:
    ShortCutPlan
): string {
  const suffix =
    cut.title.trim()

  const value =
    suffix
      ? `${source.title} · Short · ${suffix}`
      : `${source.title} · Short`

  return value
    .trim()
    .slice(
      0,
      240
    )
}


export function projectShortDerivativeLineage(
  project:
    KinaouProject
): ShortDerivativeLineage | null {
  const parsed =
    shortDerivativeLineageSchema
      .safeParse(
        project.metadata
          .shortDerivative
      )

  return parsed.success
    ? parsed.data
    : null
}


export function createShortDerivativeDraft(
  source:
    KinaouProject,

  cut:
    ShortCutPlan,

  now =
    new Date(),

  id: string =
    crypto.randomUUID()
): KinaouProject {
  if (
    source.id
    !== cut.projectId
  ) {
    throw new Error(
      'Short derivative cut belongs to another source project'
    )
  }

  if (
    source.updatedAt
    !== cut.sourceProjectUpdatedAt
  ) {
    throw new Error(
      'Source project changed after Short review'
    )
  }

  if (
    id === source.id
  ) {
    throw new Error(
      'Short derivative must have a new project identity'
    )
  }

  if (
    !id.trim()
  ) {
    throw new Error(
      'Short derivative project id is required'
    )
  }

  const timestamp =
    now.toISOString()

  const lineage =
    shortDerivativeLineageSchema
      .parse({
        schemaVersion:
          1,

        kind:
          'short-derivative',

        sourceProjectId:
          source.id,

        sourceProjectTitle:
          source.title,

        sourceProjectUpdatedAt:
          cut.sourceProjectUpdatedAt,

        sourceTimelineDurationMs:
          cut.sourceTimelineDurationMs,

        createdAt:
          timestamp,

        cutTitle:
          cut.title,

        objective:
          cut.objective,

        maximumDurationMs:
          cut.maximumDurationMs,

        durationMs:
          cut.durationMs,

        selectedCandidateIds:
          [...cut.selectedCandidateIds],

        segments:
          cut.segments.map(
            segment => ({
              position:
                segment.position,

              candidateId:
                segment.candidateId,

              hook:
                segment.hook,

              rationale:
                segment.rationale,

              sourceInMs:
                segment.sourceInMs,

              sourceOutMs:
                segment.sourceOutMs,

              destinationInMs:
                segment.destinationInMs,

              destinationOutMs:
                segment.destinationOutMs,

              evidence:
                segment.evidence.map(
                  item => ({
                    kind:
                      item.kind,

                    id:
                      item.id
                  })
                )
            })
          )
      })

  const base =
    createProject(
      derivativeTitle(
        source,
        cut
      ),
      now
    )

  const contentProfile =
    projectContentProfileSchema
      .safeParse(
        source.metadata
          .contentProfile
      )

  return parseProject({
    ...base,

    id,

    createdAt:
      timestamp,

    updatedAt:
      timestamp,

    /*
     * Each selected highlight becomes an explicit child-project scene.
     * Timeline clips are intentionally materialized only in Phase 5.2B.
     */
    storyboard:
      lineage.segments.map(
        segment => ({
          id:
            `short-segment-${String(
              segment.position
            ).padStart(
              3,
              '0'
            )}`,

          title:
            segment.hook,

          description:
            segment.rationale,

          durationMs:
            segment.destinationOutMs
            - segment.destinationInMs
        })
      ),

    assets:
      [],

    tracks:
      [],

    script:
      '',

    metadata: {
      shortDerivative:
        lineage,

      ...(contentProfile.success
        ? {
            contentProfile:
              structuredClone(
                contentProfile.data
              )
          }
        : {})
    }
  })
}
