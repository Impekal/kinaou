import {
  describe,
  expect,
  it
} from 'vitest'

import {
  createProject,
  parseProject
} from '../src/core/project'

import {
  buildShortReframeModelContext
} from '../src/core/shortReframingModel'


function fixture() {
  return parseProject({
    ...createProject(
      'Reframe assistant',
      new Date(
        '2026-09-25T21:00:00.000Z'
      )
    ),

    id:
      'short-project',

    storyboard: [
      {
        id:
          'short-segment-001',

        title:
          'Speaker left',

        description:
          'The speaker is explicitly described on the left side of frame.',

        durationMs:
          5000,

        assetId:
          'video'
      },

      {
        id:
          'short-segment-002',

        title:
          'Speaker right',

        description:
          'The speaker is explicitly described on the right side of frame.',

        durationMs:
          5000,

        assetId:
          'video'
      }
    ],

    assets: [
      {
        id:
          'video',

        kind:
          'video',

        uri:
          'KINAOU/Assets/private-source.mp4',

        managed:
          true,

        offline:
          false,

        metadata: {
          name:
            'Interview source',

          durationMs:
            30_000
        }
      }
    ],

    tracks: [
      {
        id:
          'video-track',

        type:
          'video',

        name:
          'Video',

        muted:
          false,

        locked:
          false,

        clips: [
          {
            id:
              'left',

            assetId:
              'video',

            startMs:
              0,

            durationMs:
              5000,

            sourceOffsetMs:
              0,

            gain:
              1,

            speed:
              1,

            sceneId:
              'short-segment-001'
          },

          {
            id:
              'right',

            assetId:
              'video',

            startMs:
              5000,

            durationMs:
              5000,

            sourceOffsetMs:
              5000,

            gain:
              1,

            speed:
              1,

            sceneId:
              'short-segment-002',

            reframe: {
              focusX:
                0.75,

              focusY:
                0.5
            }
          }
        ]
      }
    ],

    metadata: {
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
          '2026-09-25T20:00:00.000Z',

        sourceTimelineDurationMs:
          30_000,

        createdAt:
          '2026-09-25T20:30:00.000Z',

        materializedAt:
          '2026-09-25T20:31:00.000Z',

        cutTitle:
          'Short',

        objective:
          'Short',

        maximumDurationMs:
          30_000,

        durationMs:
          10_000,

        selectedCandidateIds: [
          'one',
          'two'
        ],

        segments: [
          {
            position:
              1,

            candidateId:
              'one',

            hook:
              'One',

            rationale:
              'One',

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
                  'source-one'
              }
            ]
          },

          {
            position:
              2,

            candidateId:
              'two',

            hook:
              'Two',

            rationale:
              'Two',

            sourceInMs:
              5000,

            sourceOutMs:
              10_000,

            destinationInMs:
              5000,

            destinationOutMs:
              10_000,

            evidence: [
              {
                kind:
                  'scene',

                id:
                  'source-two'
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
          'short-project',

        materializedAt:
          '2026-09-25T20:31:00.000Z',

        assets: [
          {
            assetId:
              'video',

            sourceAssetId:
              'video'
          }
        ],

        tracks: [
          {
            trackId:
              'video-track',

            sourceTrackId:
              'source-track',

            type:
              'video'
          }
        ],

        clips: [
          {
            clipId:
              'left',

            sourceClipId:
              'source-left',

            sourceTrackId:
              'source-track',

            trackId:
              'video-track',

            assetId:
              'video',

            segmentPosition:
              1
          },

          {
            clipId:
              'right',

            sourceClipId:
              'source-right',

            sourceTrackId:
              'source-track',

            trackId:
              'video-track',

            assetId:
              'video',

            segmentPosition:
              2
          }
        ]
      }
    }
  })
}


describe(
  'Short reframing local-model context',
  () => {
    it(
      'exposes exact editable clip and scene identities with current focus',
      () => {
        const context =
          buildShortReframeModelContext(
            fixture()
          )

        expect(
          context.visualClips
        ).toEqual([
          expect.objectContaining({
            trackId:
              'video-track',

            clipId:
              'left',

            sceneId:
              'short-segment-001',

            currentFocus: {
              focusX:
                0.5,

              focusY:
                0.5
            }
          }),

          expect.objectContaining({
            trackId:
              'video-track',

            clipId:
              'right',

            sceneId:
              'short-segment-002',

            currentFocus: {
              focusX:
                0.75,

              focusY:
                0.5
            }
          })
        ])
      }
    )

    it(
      'does not expose managed file paths to the language model',
      () => {
        const serialized =
          JSON.stringify(
            buildShortReframeModelContext(
              fixture()
            )
          )

        expect(
          serialized
        ).not.toContain(
          'KINAOU/Assets/'
        )

        expect(
          serialized
        ).not.toContain(
          'private-source.mp4'
        )

        expect(
          serialized
        ).toContain(
          'Interview source'
        )
      }
    )

    it(
      'states the no-pixel and review-only boundary explicitly',
      () => {
        const context =
          buildShortReframeModelContext(
            fixture()
          )

        expect(
          context.policy
        ).toEqual({
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
        })
      }
    )
  }
)
