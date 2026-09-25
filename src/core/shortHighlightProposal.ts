import {
  z
} from 'zod'

import type {
  ShortIntelligenceContext
} from './shortIntelligence'


const evidenceRefSchema =
  z.discriminatedUnion(
    'kind',
    [
      z.object({
        kind:
          z.literal(
            'scene'
          ),

        id:
          z.string()
            .trim()
            .min(1)
            .max(200)
      }),

      z.object({
        kind:
          z.literal(
            'transcript'
          ),

        id:
          z.string()
            .trim()
            .min(1)
            .max(500)
      })
    ]
  )


const candidateSchema =
  z.object({
    id:
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

    inMs:
      z.number()
        .int()
        .nonnegative(),

    outMs:
      z.number()
        .int()
        .positive(),

    order:
      z.number()
        .int()
        .min(1)
        .max(20),

    evidence:
      z.array(
        evidenceRefSchema
      )
      .min(1)
      .max(50)
  })
  .strict()


export const shortHighlightProposalSchema =
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

    candidates:
      z.array(
        candidateSchema
      )
      .min(1)
      .max(20),

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
            .max(160)
            .optional(),

        modelId:
          z.string()
            .trim()
            .min(1)
            .max(160)
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
      const ids =
        new Set<string>()

      const orders =
        new Set<number>()

      proposal.candidates
        .forEach(
          (
            candidate,
            index
          ) => {
            if (
              ids.has(
                candidate.id
              )
            ) {
              context.addIssue({
                code:
                  'custom',

                path: [
                  'candidates',
                  index,
                  'id'
                ],

                message:
                  'Short highlight candidate IDs must be unique.'
              })
            }

            ids.add(
              candidate.id
            )

            if (
              orders.has(
                candidate.order
              )
            ) {
              context.addIssue({
                code:
                  'custom',

                path: [
                  'candidates',
                  index,
                  'order'
                ],

                message:
                  'Short highlight candidate order values must be unique.'
              })
            }

            orders.add(
              candidate.order
            )

            const evidenceKeys =
              candidate.evidence.map(
                evidence =>
                  `${evidence.kind}:${evidence.id}`
              )

            if (
              new Set(
                evidenceKeys
              ).size
              !== evidenceKeys.length
            ) {
              context.addIssue({
                code:
                  'custom',

                path: [
                  'candidates',
                  index,
                  'evidence'
                ],

                message:
                  'Short highlight evidence references must be unique within a candidate.'
              })
            }
          }
        )

      const expectedOrders =
        proposal.candidates.map(
          (
            _candidate,
            index
          ) =>
            index + 1
        )

      const actualOrders =
        [...orders]
          .sort(
            (
              a,
              b
            ) =>
              a - b
          )

      if (
        JSON.stringify(
          expectedOrders
        )
        !== JSON.stringify(
          actualOrders
        )
      ) {
        context.addIssue({
          code:
            'custom',

          path: [
            'candidates'
          ],

          message:
            'Short highlight order must be contiguous from 1 through the candidate count.'
        })
      }

      if (
        proposal.provenance
          .kind
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
            'Local model Short proposals require adapterId and modelId.'
        })
      }
    }
  )


export type ShortHighlightProposal =
  z.infer<
    typeof shortHighlightProposalSchema
  >


export type ShortHighlightCandidate =
  ShortHighlightProposal[
    'candidates'
  ][number]


function overlaps(
  range:
    {
      inMs: number
      outMs: number
    },

  evidence:
    {
      inMs: number
      outMs: number
    }
): boolean {
  return (
    Math.min(
      range.outMs,
      evidence.outMs
    )
    >
    Math.max(
      range.inMs,
      evidence.inMs
    )
  )
}


export function parseShortHighlightProposal(
  value: unknown,
  context:
    ShortIntelligenceContext
): ShortHighlightProposal {
  if (
    !context.readiness.ready
  ) {
    throw new Error(
      'Short intelligence context is not ready for highlight generation'
    )
  }

  const proposal =
    shortHighlightProposalSchema
      .parse(
        value
      )

  const sceneEvidence =
    new Map(
      context.evidence
        .scenes
        .filter(
          scene =>
            scene.anchored
            && scene.inMs
              !== undefined
            && scene.outMs
              !== undefined
        )
        .map(
          scene => [
            scene.sceneId,
            {
              inMs:
                scene.inMs!,
              outMs:
                scene.outMs!
            }
          ]
        )
    )

  const transcriptEvidence =
    new Map(
      context.evidence
        .transcriptSegments
        .map(
          segment => [
            segment.id,
            {
              inMs:
                segment.startMs,
              outMs:
                segment.endMs
            }
          ]
        )
    )

  for (
    const candidate
    of proposal.candidates
  ) {
    if (
      candidate.outMs
      <= candidate.inMs
    ) {
      throw new Error(
        `Short candidate "${candidate.id}" has an invalid range`
      )
    }

    const durationMs =
      candidate.outMs
      - candidate.inMs

    if (
      durationMs < 1000
    ) {
      throw new Error(
        `Short candidate "${candidate.id}" must be at least 1 second long`
      )
    }

    if (
      durationMs
      > context.target
        .maximumDurationMs
    ) {
      throw new Error(
        `Short candidate "${candidate.id}" exceeds the configured Short duration`
      )
    }

    if (
      candidate.outMs
      > context.project
        .timelineDurationMs
    ) {
      throw new Error(
        `Short candidate "${candidate.id}" exceeds the active timeline`
      )
    }

    for (
      const evidence
      of candidate.evidence
    ) {
      const range =
        evidence.kind
          === 'scene'
          ? sceneEvidence.get(
              evidence.id
            )
          : transcriptEvidence.get(
              evidence.id
            )

      if (!range) {
        throw new Error(
          `Short candidate "${candidate.id}" references unknown ${evidence.kind} evidence: ${evidence.id}`
        )
      }

      if (
        !overlaps(
          candidate,
          range
        )
      ) {
        throw new Error(
          `Short candidate "${candidate.id}" references evidence outside its proposed range`
        )
      }
    }
  }

  return {
    ...proposal,

    candidates:
      [...proposal.candidates]
        .sort(
          (
            a,
            b
          ) =>
            a.order
            - b.order
        )
  }
}
