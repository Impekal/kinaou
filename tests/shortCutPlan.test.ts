import {
  describe,
  expect,
  it
} from 'vitest'

import {
  createProjectFromInput
} from '../src/core/create'

import {
  formatProfiles
} from '../src/core/render'

import {
  buildShortCutPlan,
  createShortCutRenderPlan
} from '../src/core/shortCutPlan'

import {
  buildShortIntelligenceContext
} from '../src/core/shortIntelligence'


function fixture(
  maximumDurationMs =
    30_000
) {
  const project =
    createProjectFromInput({
      title:
        'Long source',
      kind:
        'video',
      content:
        ''
    })

  project.assets.push(
    {
      id:
        'video',

      kind:
        'video',

      uri:
        'KINAOU/Assets/video.mp4',

      managed:
        true,

      offline:
        false,

      metadata: {
        name:
          'Long source',

        durationMs:
          120_000
      }
    },

    {
      id:
        'audio',

      kind:
        'audio',

      uri:
        'KINAOU/Assets/audio.wav',

      managed:
        true,

      offline:
        false,

      metadata: {
        name:
          'Audio',

        durationMs:
          120_000
      }
    }
  )

  project.storyboard = [
    {
      id:
        'scene-a',

      title:
        'First',

      description:
        'First source section',

      durationMs:
        30_000
    },

    {
      id:
        'scene-b',

      title:
        'Second',

      description:
        'Second source section',

      durationMs:
        30_000
    }
  ]

  const videoTrack =
    project.tracks.find(
      track =>
        track.type ===
        'video'
    )!

  const voiceTrack =
    project.tracks.find(
      track =>
        track.type ===
        'voice'
    )!

  videoTrack.clips.push(
    {
      id:
        'video-a',

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
        'video-b',

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

  voiceTrack.clips.push({
    id:
      'voice',

    assetId:
      'audio',

    startMs:
      0,

    durationMs:
      90_000,

    sourceOffsetMs:
      0,

    gain:
      1,

    speed:
      1
  })

  const context =
    buildShortIntelligenceContext(
      project,
      maximumDurationMs
    )

  return {
    project,
    context
  }
}


function proposal() {
  return {
    schemaVersion:
      1,

    title:
      'Compact Short',

    objective:
      'Lead with proof, then return to the opening.',

    candidates: [
      {
        id:
          'opening',

        hook:
          'Opening idea',

        rationale:
          'Concise opening statement.',

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
          'Proof first',

        rationale:
          'Stronger evidence-led opening.',

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
}


describe(
  'compact Short cut planning',
  () => {
    it(
      'compacts disjoint source highlights according to explicit editorial order',
      () => {
        const {
          context
        } =
          fixture()

        const cut =
          buildShortCutPlan(
            context,
            proposal(),
            [
              'opening',
              'proof'
            ]
          )

        expect(
          cut.selectedCandidateIds
        ).toEqual([
          'proof',
          'opening'
        ])

        expect(
          cut.durationMs
        ).toBe(
          20_000
        )

        expect(
          cut.segments
            .map(
              segment => ({
                id:
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
            id:
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
            id:
              'opening',

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
      'builds a virtual render plan with synchronized video and audio source offsets',
      () => {
        const {
          project,
          context
        } =
          fixture()

        const original =
          structuredClone(
            project
          )

        const cut =
          buildShortCutPlan(
            context,
            proposal(),
            [
              'proof',
              'opening'
            ]
          )

        const render =
          createShortCutRenderPlan(
            project,
            cut,
            formatProfiles.vertical
              .preview,
            'KINAOU/Cache/Previews/compact-short.mp4'
          )

        expect(
          render.durationMs
        ).toBe(
          20_000
        )

        const videos =
          render.clips.filter(
            clip =>
              clip.trackType
              === 'video'
          )

        expect(
          videos.map(
            clip => ({
              id:
                clip.clipId,

              start:
                clip.startMs,

              duration:
                clip.durationMs,

              offset:
                clip.sourceOffsetMs
            })
          )
        ).toEqual([
          {
            id:
              'video-b::short:1',

            start:
              0,

            duration:
              10_000,

            offset:
              65_000
          },

          {
            id:
              'video-a::short:2',

            start:
              10_000,

            duration:
              10_000,

            offset:
              10_000
          }
        ])

        const voices =
          render.clips.filter(
            clip =>
              clip.trackType
              === 'voice'
          )

        expect(
          voices.map(
            clip => ({
              start:
                clip.startMs,

              duration:
                clip.durationMs,

              offset:
                clip.sourceOffsetMs
            })
          )
        ).toEqual([
          {
            start:
              0,

            duration:
              10_000,

            offset:
              65_000
          },

          {
            start:
              10_000,

            duration:
              10_000,

            offset:
              10_000
          }
        ])

        expect(
          project
        ).toEqual(
          original
        )
      }
    )

    it(
      'supports selecting only a subset without changing source order metadata',
      () => {
        const {
          context
        } =
          fixture()

        const cut =
          buildShortCutPlan(
            context,
            proposal(),
            [
              'opening'
            ]
          )

        expect(
          cut.durationMs
        ).toBe(
          10_000
        )

        expect(
          cut.segments
        ).toHaveLength(1)

        expect(
          cut.segments[0]
        ).toMatchObject({
          candidateId:
            'opening',

          candidateOrder:
            2,

          destinationInMs:
            0,

          destinationOutMs:
            10_000
        })
      }
    )

    it(
      'rejects duplicate, stale or overlapping highlight selections',
      () => {
        const {
          context
        } =
          fixture()

        expect(
          () =>
            buildShortCutPlan(
              context,
              proposal(),
              [
                'opening',
                'opening'
              ]
            )
        ).toThrow(
          /only once/i
        )

        expect(
          () =>
            buildShortCutPlan(
              context,
              proposal(),
              [
                'missing'
              ]
            )
        ).toThrow(
          /no longer available/i
        )

        const overlapping =
          proposal()

        overlapping.candidates[1]
          .inMs =
            15_000

        overlapping.candidates[1]
          .outMs =
            25_000

        overlapping.candidates[1]
          .evidence = [
            {
              kind:
                'scene',
              id:
                'scene-a'
            }
          ]

        expect(
          () =>
            buildShortCutPlan(
              context,
              overlapping,
              [
                'opening',
                'proof'
              ]
            )
        ).toThrow(
          /overlap in source time/i
        )
      }
    )

    it(
      'enforces the combined Short maximum, not only the per-highlight maximum',
      () => {
        const {
          context
        } =
          fixture(
            15_000
          )

        expect(
          () =>
            buildShortCutPlan(
              context,
              proposal(),
              [
                'opening',
                'proof'
              ]
            )
        ).toThrow(
          /combined Short duration/i
        )
      }
    )

    it(
      'blocks rendering when the source timeline changed after intelligence review',
      () => {
        const {
          project,
          context
        } =
          fixture()

        const cut =
          buildShortCutPlan(
            context,
            proposal(),
            [
              'opening'
            ]
          )

        const track =
          project.tracks.find(
            item =>
              item.type === 'voice'
          )!

        track.clips.push({
          id:
            'later',

          assetId:
            'audio',

          startMs:
            90_000,

          durationMs:
            5000,

          sourceOffsetMs:
            90_000,

          gain:
            1,

          speed:
            1
        })

        expect(
          () =>
            createShortCutRenderPlan(
              project,
              cut,
              formatProfiles.vertical
                .preview,
              'KINAOU/Cache/Previews/stale-short.mp4'
            )
        ).toThrow(
          /project changed/i
        )
      }
    )

    it(
      'blocks rendering after a source revision even when timeline duration is unchanged',
      () => {
        const {
          project,
          context
        } =
          fixture()

        const cut =
          buildShortCutPlan(
            context,
            proposal(),
            [
              'opening'
            ]
          )

        const changed =
          structuredClone(
            project
          )

        changed.updatedAt =
          '2026-09-25T23:59:59.000Z'

        expect(
          () =>
            createShortCutRenderPlan(
              changed,
              cut,
              formatProfiles.vertical
                .preview,
              'KINAOU/Cache/Previews/stale-revision-short.mp4'
            )
        ).toThrow(
          /project changed/i
        )
      }
    )

    it(
      'marks the compact cut as review-only and non-destructive',
      () => {
        const {
          context
        } =
          fixture()

        const cut =
          buildShortCutPlan(
            context,
            proposal(),
            [
              'opening'
            ]
          )

        expect(
          cut.policy
        ).toEqual({
          reviewOnly:
            true,

          projectMutation:
            false,

          automaticExport:
            false
        })
      }
    )
  }
)
