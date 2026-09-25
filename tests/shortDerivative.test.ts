import {
  describe,
  expect,
  it
} from 'vitest'

import {
  setProjectContentProfile
} from '../src/core/contentProfile'

import {
  createProjectFromInput
} from '../src/core/create'

import {
  buildShortCutPlan
} from '../src/core/shortCutPlan'

import {
  createShortDerivativeDraft,
  projectShortDerivativeLineage
} from '../src/core/shortDerivative'

import {
  buildShortIntelligenceContext
} from '../src/core/shortIntelligence'


function fixture() {
  let project =
    createProjectFromInput(
      {
        title:
          'Original interview',

        kind:
          'video',

        content:
          ''
      },
      new Date(
        '2026-09-25T18:00:00.000Z'
      )
    )

  project =
    setProjectContentProfile(
      project,
      {
        schemaVersion:
          1,

        sourceLanguage:
          'en',

        outputLanguage:
          'en',

        targetMarket:
          'WORLD',

        audience:
          'General audience',

        objective:
          'Create a concise Short',

        tone:
          'Direct'
      },
      new Date(
        '2026-09-25T18:01:00.000Z'
      )
    )

  project.assets.push({
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
      durationMs:
        120_000
    }
  })

  project.storyboard = [
    {
      id:
        'scene-a',

      title:
        'Opening',

      description:
        'Opening idea',

      durationMs:
        30_000
    },

    {
      id:
        'scene-b',

      title:
        'Proof',

      description:
        'Strong proof',

      durationMs:
        30_000
    }
  ]

  const videoTrack =
    project.tracks.find(
      track =>
        track.type
        === 'video'
    )!

  videoTrack.clips.push(
    {
      id:
        'clip-a',

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
        'scene-a'
    },

    {
      id:
        'clip-b',

      assetId:
        'video',

      startMs:
        60_000,

      durationMs:
        30_000,

      sourceOffsetMs:
        60_000,

      gain:
        1,

      speed:
        1,

      sceneId:
        'scene-b'
    }
  )

  /*
   * Volatile state must never silently migrate into the derivative.
   */
  project.metadata.shortExportBatch = {
    unsafe:
      'old batch'
  }

  project.metadata.exportHistory = [
    {
      unsafe:
        'old export'
    }
  ]

  const context =
    buildShortIntelligenceContext(
      project,
      30_000
    )

  const proposal = {
    schemaVersion:
      1,

    title:
      'Proof-led edit',

    objective:
      'Open with proof and then provide context.',

    candidates: [
      {
        id:
          'context',

        hook:
          'Context',

        rationale:
          'Sets up the idea.',

        inMs:
          10_000,

        outMs:
          20_000,

        order:
          2,

        evidence: [
          {
            kind:
              'scene',
            id:
              'scene-a'
          }
        ]
      },

      {
        id:
          'proof',

        hook:
          'Strong proof',

        rationale:
          'Starts with the strongest moment.',

        inMs:
          65_000,

        outMs:
          75_000,

        order:
          1,

        evidence: [
          {
            kind:
              'scene',
            id:
              'scene-b'
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
        'proof',
        'context'
      ]
    )

  return {
    project,
    cut
  }
}


describe(
  'Short derivative project model',
  () => {
    it(
      'creates a distinct child project without mutating the source',
      () => {
        const {
          project,
          cut
        } =
          fixture()

        const original =
          structuredClone(
            project
          )

        const derivative =
          createShortDerivativeDraft(
            project,
            cut,
            new Date(
              '2026-09-25T19:00:00.000Z'
            ),
            'short-project'
          )

        expect(
          derivative.id
        ).toBe(
          'short-project'
        )

        expect(
          derivative.id
        ).not.toBe(
          project.id
        )

        expect(
          derivative.title
        ).toBe(
          'Original interview · Short · Proof-led edit'
        )

        expect(
          derivative.createdAt
        ).toBe(
          '2026-09-25T19:00:00.000Z'
        )

        expect(
          derivative.updatedAt
        ).toBe(
          '2026-09-25T19:00:00.000Z'
        )

        expect(
          project
        ).toEqual(
          original
        )
      }
    )

    it(
      'turns selected Short segments into an explicit child storyboard',
      () => {
        const {
          project,
          cut
        } =
          fixture()

        const derivative =
          createShortDerivativeDraft(
            project,
            cut,
            new Date(
              '2026-09-25T19:00:00.000Z'
            ),
            'short-project'
          )

        expect(
          derivative.storyboard
        ).toEqual([
          {
            id:
              'short-segment-001',

            title:
              'Strong proof',

            description:
              'Starts with the strongest moment.',

            durationMs:
              10_000
          },

          {
            id:
              'short-segment-002',

            title:
              'Context',

            description:
              'Sets up the idea.',

            durationMs:
              10_000
          }
        ])

        expect(
          derivative.assets
        ).toEqual([])

        expect(
          derivative.tracks
        ).toEqual([])
      }
    )

    it(
      'stores exact source lineage and selected editorial order',
      () => {
        const {
          project,
          cut
        } =
          fixture()

        const derivative =
          createShortDerivativeDraft(
            project,
            cut,
            new Date(
              '2026-09-25T19:00:00.000Z'
            ),
            'short-project'
          )

        const lineage =
          projectShortDerivativeLineage(
            derivative
          )

        expect(
          lineage
        ).not.toBeNull()

        expect(
          lineage
        ).toMatchObject({
          schemaVersion:
            1,

          kind:
            'short-derivative',

          sourceProjectId:
            project.id,

          sourceProjectTitle:
            'Original interview',

          sourceProjectUpdatedAt:
            project.updatedAt,

          durationMs:
            20_000,

          maximumDurationMs:
            30_000,

          selectedCandidateIds: [
            'proof',
            'context'
          ]
        })

        expect(
          lineage?.segments
            .map(
              segment => ({
                candidate:
                  segment.candidateId,

                source:
                  [
                    segment.sourceInMs,
                    segment.sourceOutMs
                  ],

                destination:
                  [
                    segment.destinationInMs,
                    segment.destinationOutMs
                  ]
              })
            )
        ).toEqual([
          {
            candidate:
              'proof',

            source: [
              65_000,
              75_000
            ],

            destination: [
              0,
              10_000
            ]
          },

          {
            candidate:
              'context',

            source: [
              10_000,
              20_000
            ],

            destination: [
              10_000,
              20_000
            ]
          }
        ])
      }
    )

    it(
      'inherits the validated content profile but not volatile source workflow state',
      () => {
        const {
          project,
          cut
        } =
          fixture()

        const derivative =
          createShortDerivativeDraft(
            project,
            cut,
            new Date(
              '2026-09-25T19:00:00.000Z'
            ),
            'short-project'
          )

        expect(
          derivative.metadata
            .contentProfile
        ).toEqual(
          project.metadata
            .contentProfile
        )

        expect(
          derivative.metadata
            .shortExportBatch
        ).toBeUndefined()

        expect(
          derivative.metadata
            .exportHistory
        ).toBeUndefined()

        expect(
          derivative.metadata
            .sourceInput
        ).toBeUndefined()
      }
    )

    it(
      'rejects a source project that changed after Short review even when duration is unchanged',
      () => {
        const {
          project,
          cut
        } =
          fixture()

        const changed =
          structuredClone(
            project
          )

        changed.updatedAt =
          '2026-09-25T19:30:00.000Z'

        expect(
          () =>
            createShortDerivativeDraft(
              changed,
              cut,
              new Date(
                '2026-09-25T20:00:00.000Z'
              ),
              'short-project'
            )
        ).toThrow(
          /changed after Short review/i
        )
      }
    )

    it(
      'rejects reuse of the source project identity',
      () => {
        const {
          project,
          cut
        } =
          fixture()

        expect(
          () =>
            createShortDerivativeDraft(
              project,
              cut,
              new Date(
                '2026-09-25T20:00:00.000Z'
              ),
              project.id
            )
        ).toThrow(
          /new project identity/i
        )
      }
    )
  }
)
