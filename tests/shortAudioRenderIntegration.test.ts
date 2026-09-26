import {
  expect,
  it
} from 'vitest'

import {
  assetSchema,
  clipSchema,
  trackSchema
} from '../src/core/project'

import {
  createRenderPlan,
  formatProfiles
} from '../src/core/render'

import {
  applyShortAudioFinishing,
  resolveShortRenderAudioSettings
} from '../src/core/shortAudioFinishing'

import {
  createProject
} from '../src/core/project'


it(
  'feeds the stored Short audio profile unchanged into the real render plan contract',
  () => {
    const project =
      createProject(
        'Render audio contract',
        new Date(
          '2026-09-26T11:00:00.000Z'
        )
      )

    project.id =
      'audio-render-short'

    const voice =
      assetSchema.parse({
        id:
          'voice',

        kind:
          'audio',

        uri:
          'KINAOU/Assets/voice.wav',

        managed:
          true,

        metadata: {
          durationMs:
            5000
        }
      })

    project.assets = [
      voice
    ]

    project.tracks = [
      trackSchema.parse({
        id:
          'voice-track',

        type:
          'voice',

        name:
          'Voice',

        clips: [
          clipSchema.parse({
            id:
              'voice-clip',

            assetId:
              'voice',

            startMs:
              0,

            durationMs:
              5000,

            sceneId:
              'short-segment-001'
          })
        ]
      })
    ]

    project.storyboard = [
      {
        id:
          'short-segment-001',

        title:
          'Segment',

        description:
          'Segment',

        durationMs:
          5000
      }
    ]

    project.metadata = {
      targetFormat:
        'vertical',

      shortDerivative: {
        schemaVersion:
          1,

        kind:
          'short-derivative',

        sourceProjectId:
          'source',

        sourceProjectTitle:
          'Source',

        sourceProjectUpdatedAt:
          '2026-09-26T10:00:00.000Z',

        sourceTimelineDurationMs:
          5000,

        createdAt:
          '2026-09-26T10:30:00.000Z',

        materializedAt:
          '2026-09-26T10:31:00.000Z',

        cutTitle:
          'Short',

        objective:
          'Short',

        maximumDurationMs:
          30000,

        durationMs:
          5000,

        selectedCandidateIds: [
          'segment'
        ],

        segments: [
          {
            position:
              1,

            candidateId:
              'segment',

            hook:
              'Segment',

            rationale:
              'Segment',

            sourceInMs:
              0,

            sourceOutMs:
              5000,

            destinationInMs:
              0,

            destinationOutMs:
              5000,

            evidence: [
              {
                kind:
                  'scene',

                id:
                  'source-scene'
              }
            ]
          }
        ]
      },

      shortDerivativeMaterialization: {
        schemaVersion:
          1,

        sourceProjectId:
          'source',

        derivativeProjectId:
          'audio-render-short',

        materializedAt:
          '2026-09-26T10:31:00.000Z',

        assets: [
          {
            assetId:
              'voice',

            sourceAssetId:
              'voice'
          }
        ],

        tracks: [
          {
            trackId:
              'voice-track',

            sourceTrackId:
              'source-voice',

            type:
              'voice'
          }
        ],

        clips: [
          {
            clipId:
              'voice-clip',

            sourceClipId:
              'source-voice-clip',

            sourceTrackId:
              'source-voice',

            trackId:
              'voice-track',

            assetId:
              'voice',

            segmentPosition:
              1
          }
        ]
      }
    }

    const stored =
      applyShortAudioFinishing(
        project,
        {
          audioDucking: {
            enabled:
              false,

            reductionDb:
              6,

            attackMs:
              80,

            releaseMs:
              220
          },

          loudnessNormalization: {
            enabled:
              true,

            targetLufs:
              -16,

            truePeakDb:
              -2,

            loudnessRange:
              9
          }
        }
      )

    const settings =
      resolveShortRenderAudioSettings(
        stored,
        {
          audioDucking: {
            enabled:
              true,

            reductionDb:
              30,

            attackMs:
              1000,

            releaseMs:
              1000
          },

          loudnessNormalization: {
            enabled:
              false,

            targetLufs:
              -10,

            truePeakDb:
              -1,

            loudnessRange:
              20
          }
        }
      )

    const plan =
      createRenderPlan(
        stored,
        formatProfiles.vertical
          .preview,
        'KINAOU/Cache/Previews/audio-finishing.mp4',
        settings
      )

    expect(
      plan.audioDucking
    ).toEqual(
      settings.audioDucking
    )

    expect(
      plan.loudnessNormalization
    ).toEqual(
      settings.loudnessNormalization
    )
  }
)
