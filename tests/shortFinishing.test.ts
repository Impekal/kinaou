import {
  describe,
  expect,
  it
} from 'vitest'

import {
  createProjectFromInput
} from '../src/core/create'

import {
  buildShortCutPlan
} from '../src/core/shortCutPlan'

import {
  createMaterializedShortDerivative
} from '../src/core/shortDerivativeCreate'

import {
  createShortDerivativeDraft
} from '../src/core/shortDerivative'

import {
  buildShortFinishingContext
} from '../src/core/shortFinishing'

import {
  buildShortIntelligenceContext
} from '../src/core/shortIntelligence'


function idFactory() {
  let value =
    0

  return () =>
    `finish-${++value}`
}


function fixture() {
  const source =
    createProjectFromInput(
      {
        title:
          'Finishing source',

        kind:
          'video',

        content:
          ''
      },
      new Date(
        '2026-09-25T20:00:00.000Z'
      )
    )

  source.assets.push({
    id:
      'video',

    kind:
      'video',

    uri:
      'KINAOU/Assets/source.mp4',

    managed:
      true,

    offline:
      false,

    metadata: {
      name:
        'Source video',

      durationMs:
        60_000
    }
  })

  source.storyboard = [
    {
      id:
        'scene',

      title:
        'Moment',

      description:
        'Selected moment',

      durationMs:
        30_000
    }
  ]

  source.tracks
    .find(
      track =>
        track.type
        === 'video'
    )!
    .clips.push({
      id:
        'video-clip',

      assetId:
        'video',

      startMs:
        0,

      durationMs:
        30_000,

      sourceOffsetMs:
        0,

      gain:
        1,

      speed:
        1,

      sceneId:
        'scene'
    })

  const context =
    buildShortIntelligenceContext(
      source,
      20_000
    )

  const proposal = {
    schemaVersion:
      1,

    title:
      'Finishing candidate',

    objective:
      'Prepare the reviewed Short for finishing.',

    candidates: [
      {
        id:
          'moment',

        hook:
          'Moment',

        rationale:
          'Reviewed source moment.',

        inMs:
          5000,

        outMs:
          15_000,

        order:
          1,

        evidence: [
          {
            kind:
              'scene',
            id:
              'scene'
          }
        ]
      }
    ],

    provenance: {
      kind:
        'manual'
    }
  }

  const cut =
    buildShortCutPlan(
      context,
      proposal,
      [
        'moment'
      ]
    )

  const child =
    createMaterializedShortDerivative(
      source,
      cut,
      'vertical',
      new Date(
        '2026-09-25T20:10:00.000Z'
      ),
      'short-child',
      idFactory()
    )

  return {
    source,
    cut,
    child
  }
}


describe(
  'Short finishing readiness',
  () => {
    it(
      'recognizes a materialized derivative as finishable without mutating it',
      () => {
        const {
          child
        } =
          fixture()

        const before =
          structuredClone(
            child
          )

        const context =
          buildShortFinishingContext(
            child
          )

        expect(
          context.readiness.ready
        ).toBe(true)

        expect(
          context.project
        ).toMatchObject({
          id:
            child.id,

          durationMs:
            10_000,

          targetFormat:
            'vertical'
        })

        expect(
          context.counts
            .visualClipCount
        ).toBe(1)

        expect(
          context.capabilities
        ).toEqual({
          formatReframing:
            true,

          segmentReframing:
            true,

          captionTextEditing:
            true,

          captionLayoutStyling:
            false,

          audioDucking:
            true,

          loudnessNormalization:
            true
        })

        expect(
          context.readiness
            .issues
            .map(
              issue =>
                issue.code
            )
        ).toEqual(
          expect.arrayContaining([
            'captions-missing',
            'speech-missing'
          ])
        )

        expect(
          child
        ).toEqual(
          before
        )
      }
    )

    it(
      'blocks ordinary projects that are not derivative Shorts',
      () => {
        const project =
          createProjectFromInput(
            {
              title:
                'Ordinary project',

              kind:
                'idea',

              content:
                ''
            }
          )

        const context =
          buildShortFinishingContext(
            project
          )

        expect(
          context.readiness.ready
        ).toBe(false)

        expect(
          context.readiness
            .issues
        ).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              code:
                'not-short-derivative',

              severity:
                'blocking'
            })
          ])
        )
      }
    )

    it(
      'blocks derivative drafts until the reviewed timeline is materialized',
      () => {
        const {
          source,
          cut
        } =
          fixture()

        const draft =
          createShortDerivativeDraft(
            source,
            cut,
            new Date(
              '2026-09-25T20:05:00.000Z'
            ),
            'draft-short'
          )

        const context =
          buildShortFinishingContext(
            draft
          )

        expect(
          context.readiness.ready
        ).toBe(false)

        expect(
          context.readiness
            .issues
        ).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              code:
                'not-materialized',

              severity:
                'blocking'
            })
          ])
        )
      }
    )

    it(
      'blocks missing and offline media instead of claiming publish readiness',
      () => {
        const {
          child
        } =
          fixture()

        const offline =
          structuredClone(
            child
          )

        offline.assets[0].offline =
          true

        const offlineContext =
          buildShortFinishingContext(
            offline
          )

        expect(
          offlineContext
            .readiness.ready
        ).toBe(false)

        expect(
          offlineContext
            .readiness.issues
        ).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              code:
                'asset-offline',

              severity:
                'blocking'
            })
          ])
        )

        const missing =
          structuredClone(
            child
          )

        missing.assets = []

        const missingContext =
          buildShortFinishingContext(
            missing
          )

        expect(
          missingContext
            .readiness.ready
        ).toBe(false)

        expect(
          missingContext
            .readiness.issues
        ).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              code:
                'asset-missing',

              severity:
                'blocking'
            })
          ])
        )
      }
    )

    it(
      'keeps finishing review-only with no automatic export or publication',
      () => {
        const {
          child
        } =
          fixture()

        const context =
          buildShortFinishingContext(
            child
          )

        expect(
          context.policy
        ).toEqual({
          reviewOnly:
            true,

          projectMutation:
            false,

          automaticExport:
            false,

          automaticPublish:
            false
        })

        expect(
          context.audioDefaults
            .loudnessNormalization
            .enabled
        ).toBe(false)
      }
    )
  }
)
