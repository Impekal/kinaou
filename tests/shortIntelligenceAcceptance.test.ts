import {
  describe,
  expect,
  it,
  vi
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
  parseShortHighlightProposal
} from '../src/core/shortHighlightProposal'

import {
  buildShortIntelligenceContext
} from '../src/core/shortIntelligence'

import {
  ShortPreviewSession
} from '../src/core/shortPreviewSession'


function fixture() {
  const project =
    createProjectFromInput(
      {
        title:
          'Long interview → Short',

        kind:
          'video',

        content:
          ''
      },
      new Date(
        '2026-09-25T18:00:00.000Z'
      )
    )

  project.assets.push(
    {
      id:
        'video',

      kind:
        'video',

      uri:
        'KINAOU/Assets/interview.mp4',

      managed:
        true,

      offline:
        false,

      metadata: {
        name:
          'Interview',

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
        'KINAOU/Assets/interview.wav',

      managed:
        true,

      offline:
        false,

      metadata: {
        name:
          'Interview audio',

        durationMs:
          120_000
      }
    },

    {
      id:
        'transcript',

      kind:
        'document',

      uri:
        'KINAOU/Projects/Transcripts/interview.json',

      managed:
        true,

      offline:
        false,

      metadata: {
        name:
          'Interview transcript',

        sourceAssetId:
          'audio',

        transcript: {
          schemaVersion:
            1,

          adapterId:
            'whisper.cpp',

          language:
            'en',

          text:
            'Opening idea. Strong proof.',

          segments: [
            {
              startMs:
                12_000,

              endMs:
                17_000,

              text:
                'Opening idea.'
            },

            {
              startMs:
                67_000,

              endMs:
                72_000,

              text:
                'Strong proof.'
            }
          ]
        }
      }
    }
  )

  project.storyboard = [
    {
      id:
        'scene-opening',

      title:
        'Opening',

      description:
        'The speaker introduces the main idea.',

      durationMs:
        30_000,

      assetId:
        'video'
    },

    {
      id:
        'scene-proof',

      title:
        'Proof',

      description:
        'The speaker gives the strongest supporting point.',

      durationMs:
        30_000,

      assetId:
        'video'
    }
  ]

  const videoTrack =
    project.tracks.find(
      track =>
        track.type
        === 'video'
    )!

  const voiceTrack =
    project.tracks.find(
      track =>
        track.type
        === 'voice'
    )!

  videoTrack.clips.push(
    {
      id:
        'video-opening',

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
        'scene-opening'
    },

    {
      id:
        'video-proof',

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
        'scene-proof'
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

  return project
}


function rawProposal() {
  return {
    schemaVersion:
      1,

    title:
      'Evidence-led Short',

    objective:
      'Open with the strongest proof, then return to the framing idea.',

    candidates: [
      {
        id:
          'opening',

        hook:
          'The framing idea',

        rationale:
          'The opening gives the audience the necessary framing.',

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
              'scene-opening'
          },

          {
            kind:
              'transcript',
            id:
              'transcript:voice:0'
          }
        ]
      },

      {
        id:
          'proof',

        hook:
          'The strongest proof',

        rationale:
          'This later section contains the clearest supporting point.',

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
              'scene-proof'
          },

          {
            kind:
              'transcript',
            id:
              'transcript:voice:1'
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
  'Intelligent Short end-to-end acceptance',
  () => {
    it(
      'turns evidence-grounded highlights into a compact preview without mutating the project',
      async () => {
        const project =
          fixture()

        const original =
          structuredClone(
            project
          )

        /*
         * 1. Evidence context from the actual timeline.
         */
        const context =
          buildShortIntelligenceContext(
            project,
            30_000
          )

        expect(
          context.readiness
            .ready
        ).toBe(true)

        expect(
          context.readiness
            .anchoredSceneCount
        ).toBe(2)

        expect(
          context.readiness
            .transcriptSegmentCount
        ).toBe(2)

        /*
         * 2. Model-like output must pass the independent evidence validator.
         */
        const proposal =
          parseShortHighlightProposal(
            rawProposal(),
            context
          )

        expect(
          proposal.candidates
            .map(
              candidate =>
                candidate.id
            )
        ).toEqual([
          'proof',
          'opening'
        ])

        /*
         * 3. Explicit human selection is required.
         */
        const selectedIds = [
          'proof',
          'opening'
        ]

        const cut =
          buildShortCutPlan(
            context,
            proposal,
            selectedIds
          )

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

        /*
         * 4. Produce a real KINAOU preview RenderPlan.
         */
        const plan =
          createShortCutRenderPlan(
            project,
            cut,
            formatProfiles.vertical
              .preview,
            'KINAOU/Cache/Previews/intelligent-short-acceptance.mp4'
          )

        expect(
          plan.purpose
        ).toBe(
          'preview'
        )

        expect(
          plan.durationMs
        ).toBe(
          20_000
        )

        expect(
          plan.outputRelativePath
        ).toBe(
          'KINAOU/Cache/Previews/intelligent-short-acceptance.mp4'
        )

        const videoClips =
          plan.clips.filter(
            clip =>
              clip.trackType
              === 'video'
          )

        expect(
          videoClips.map(
            clip => ({
              start:
                clip.startMs,

              duration:
                clip.durationMs,

              sourceOffset:
                clip.sourceOffsetMs
            })
          )
        ).toEqual([
          {
            start:
              0,

            duration:
              10_000,

            sourceOffset:
              65_000
          },

          {
            start:
              10_000,

            duration:
              10_000,

            sourceOffset:
              10_000
          }
        ])

        const voiceClips =
          plan.clips.filter(
            clip =>
              clip.trackType
              === 'voice'
          )

        expect(
          voiceClips.map(
            clip => ({
              start:
                clip.startMs,

              duration:
                clip.durationMs,

              sourceOffset:
                clip.sourceOffsetMs
            })
          )
        ).toEqual([
          {
            start:
              0,

            duration:
              10_000,

            sourceOffset:
              65_000
          },

          {
            start:
              10_000,

            duration:
              10_000,

            sourceOffset:
              10_000
          }
        ])

        /*
         * 5. Exercise the existing preview session on this compact plan.
         *    No export endpoint and no project save are involved.
         */
        const started =
          vi.fn(
            async input => {
              expect(
                input
              ).toBe(
                plan
              )

              return {
                id:
                  'preview-job',

                state:
                  'queued' as const,

                progress:
                  0,

                createdAt:
                  '2026-09-25T18:01:00.000Z',

                updatedAt:
                  '2026-09-25T18:01:00.000Z',

                outputPath:
                  plan.outputRelativePath
              }
            }
          )

        const status =
          vi.fn(
            async () => ({
              id:
                'preview-job',

              state:
                'succeeded' as const,

              progress:
                1,

              createdAt:
                '2026-09-25T18:01:00.000Z',

              updatedAt:
                '2026-09-25T18:01:01.000Z',

              outputPath:
                plan.outputRelativePath,

              durationMs:
                20_000,

              sizeBytes:
                4
            })
          )

        const load =
          vi.fn(
            async path => {
              expect(
                path
              ).toBe(
                plan.outputRelativePath
              )

              return new Blob(
                [
                  new Uint8Array([
                    0,
                    1,
                    2,
                    3
                  ])
                ],
                {
                  type:
                    'video/mp4'
                }
              )
            }
          )

        const cancelled =
          vi.fn(
            async () => ({
              id:
                'preview-job',

              state:
                'cancelled' as const,

              progress:
                0,

              createdAt:
                '2026-09-25T18:01:00.000Z',

              updatedAt:
                '2026-09-25T18:01:01.000Z'
            })
          )

        const phases:
          string[] = []

        const accepted:
          Blob[] = []

        const session =
          new ShortPreviewSession(
            plan,
            {
              client: {
                startRender:
                  started,

                renderStatus:
                  status,

                cancelRender:
                  cancelled,

                loadTimelinePreview:
                  load
              },

              publish:
                feedback => {
                  phases.push(
                    feedback.phase
                  )
                },

              accept:
                blob => {
                  accepted.push(
                    blob
                  )
                },

              wait:
                async () => {}
            }
          )

        await session.run()

        expect(
          started
        ).toHaveBeenCalledTimes(
          1
        )

        expect(
          status
        ).toHaveBeenCalledTimes(
          1
        )

        expect(
          load
        ).toHaveBeenCalledTimes(
          1
        )

        expect(
          cancelled
        ).not.toHaveBeenCalled()

        expect(
          phases.at(-1)
        ).toBe(
          'ready'
        )

        expect(
          accepted
        ).toHaveLength(
          1
        )

        expect(
          accepted[0]
        ).toBeInstanceOf(
          Blob
        )

        expect(
          accepted[0]?.size
        ).toBe(
          4
        )

        /*
         * 6. The entire review and preview path is non-destructive.
         */
        expect(
          project
        ).toEqual(
          original
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

    it(
      'never creates a compact edit without an explicit highlight selection',
      () => {
        const project =
          fixture()

        const context =
          buildShortIntelligenceContext(
            project,
            30_000
          )

        const proposal =
          parseShortHighlightProposal(
            rawProposal(),
            context
          )

        expect(
          () =>
            buildShortCutPlan(
              context,
              proposal,
              []
            )
        ).toThrow(
          /select 1–20/i
        )
      }
    )
  }
)
