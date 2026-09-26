import {
  describe,
  expect,
  it,
  vi
} from 'vitest'

import {
  createProject,
  parseProject
} from '../src/core/project'

import {
  applyTimelineOperation
} from '../src/core/timeline'

import {
  applyShortReframeProposal,
  commitShortReframeReview,
  reviewShortReframeProposal,
  type ShortReframeProposal
} from '../src/core/shortReframing'

import {
  PersistentVersionHistory
} from '../src/core/versioning'


function memoryStore() {
  const data =
    new Map<string, string>()

  return {
    getItem:
      (key: string) =>
        data.get(key)
        ?? null,

    setItem:
      (
        key: string,
        value: string
      ) => {
        data.set(
          key,
          value
        )
      },

    removeItem:
      (key: string) => {
        data.delete(
          key
        )
      }
  }
}


function fixture() {
  return parseProject({
    ...createProject(
      'Reviewed Short',
      new Date(
        '2026-09-25T21:00:00.000Z'
      )
    ),

    id:
      'short-project',

    updatedAt:
      '2026-09-25T21:00:00.000Z',

    storyboard: [
      {
        id:
          'short-segment-001',

        title:
          'First',

        description:
          'First segment',

        durationMs:
          5000,

        assetId:
          'video'
      },

      {
        id:
          'short-segment-002',

        title:
          'Second',

        description:
          'Second segment',

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
          'KINAOU/Assets/source.mp4',

        managed:
          true,

        offline:
          false,

        metadata: {
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
              'clip-left',

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
              'clip-right',

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
              'short-segment-002'
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
          'source-project',

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
          'Reviewed cut',

        objective:
          'Make a Short',

        maximumDurationMs:
          30_000,

        durationMs:
          10_000,

        selectedCandidateIds: [
          'first',
          'second'
        ],

        segments: [
          {
            position:
              1,

            candidateId:
              'first',

            hook:
              'First',

            rationale:
              'First reason',

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
                  'source-scene-1'
              }
            ]
          },

          {
            position:
              2,

            candidateId:
              'second',

            hook:
              'Second',

            rationale:
              'Second reason',

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
                  'source-scene-2'
              }
            ]
          }
        ]
      },

      shortDerivativeMaterialization: {
        schemaVersion:
          1,

        sourceProjectId:
          'source-project',

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
              'source-video-track',

            type:
              'video'
          }
        ],

        clips: [
          {
            clipId:
              'clip-left',

            sourceClipId:
              'source-left',

            sourceTrackId:
              'source-video-track',

            trackId:
              'video-track',

            assetId:
              'video',

            segmentPosition:
              1
          },

          {
            clipId:
              'clip-right',

            sourceClipId:
              'source-right',

            sourceTrackId:
              'source-video-track',

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


function proposal(): ShortReframeProposal {
  return {
    schemaVersion:
      1,

    title:
      'Keep subjects framed',

    objective:
      'Use a distinct focus for each Short segment.',

    operations: [
      {
        id:
          'left-focus',

        trackId:
          'video-track',

        clipId:
          'clip-left',

        sceneId:
          'short-segment-001',

        focusX:
          0.2,

        focusY:
          0.5,

        reason:
          'The subject is left of centre.'
      },

      {
        id:
          'right-focus',

        trackId:
          'video-track',

        clipId:
          'clip-right',

        sceneId:
          'short-segment-002',

        focusX:
          0.8,

        focusY:
          0.45,

        reason:
          'The subject is right of centre.'
      }
    ],

    provenance: {
      kind:
        'manual'
    }
  }
}


describe(
  'Short reframing review and apply',
  () => {
    it(
      'builds explicit before/after review changes without mutating the Short',
      () => {
        const project =
          fixture()

        const before =
          structuredClone(
            project
          )

        const review =
          reviewShortReframeProposal(
            project,
            proposal()
          )

        expect(
          review.targetFormat
        ).toBe(
          'vertical'
        )

        expect(
          review.changes
        ).toEqual([
          {
            operationId:
              'left-focus',

            trackId:
              'video-track',

            clipId:
              'clip-left',

            sceneId:
              'short-segment-001',

            reason:
              'The subject is left of centre.',

            current: {
              focusX:
                0.5,

              focusY:
                0.5
            },

            proposed: {
              focusX:
                0.2,

              focusY:
                0.5
            }
          },

          {
            operationId:
              'right-focus',

            trackId:
              'video-track',

            clipId:
              'clip-right',

            sceneId:
              'short-segment-002',

            reason:
              'The subject is right of centre.',

            current: {
              focusX:
                0.5,

              focusY:
                0.5
            },

            proposed: {
              focusX:
                0.8,

              focusY:
                0.45
            }
          }
        ])

        expect(
          project
        ).toEqual(
          before
        )
      }
    )

    it(
      'applies only explicitly selected operations',
      () => {
        const project =
          fixture()

        const next =
          applyShortReframeProposal(
            project,
            proposal(),
            [
              'right-focus'
            ],
            new Date(
              '2026-09-25T21:10:00.000Z'
            )
          )

        expect(
          next.tracks[0]
            .clips[0]
            .reframe
        ).toBeUndefined()

        expect(
          next.tracks[0]
            .clips[1]
            .reframe
        ).toEqual({
          focusX:
            0.8,

          focusY:
            0.45
        })

        expect(
          next.metadata
            .lastShortReframeApply
        ).toMatchObject({
          selectedOperationIds: [
            'right-focus'
          ],

          appliedAt:
            '2026-09-25T21:10:00.000Z'
        })

        expect(
          project.tracks[0]
            .clips[1]
            .reframe
        ).toBeUndefined()
      }
    )

    it(
      'snapshots Version History before persisting the selected reframes',
      () => {
        const project =
          fixture()

        const review =
          reviewShortReframeProposal(
            project,
            proposal()
          )

        const storage =
          memoryStore()

        const history =
          new PersistentVersionHistory(
            storage,
            100,
            () =>
              new Date(
                '2026-09-25T21:09:00.000Z'
              )
          )

        const persist =
          vi.fn()

        const count =
          commitShortReframeReview(
            project,
            review,
            [
              'left-focus',
              'right-focus'
            ],
            history,
            persist,
            new Date(
              '2026-09-25T21:10:00.000Z'
            )
          )

        expect(
          count
        ).toBe(2)

        expect(
          history.list(
            project.id
          )
        ).toHaveLength(1)

        expect(
          history.list(
            project.id
          )[0]
            .project
        ).toEqual(
          project
        )

        expect(
          history.list(
            project.id
          )[0]
            .label
        ).toBe(
          'Before Short reframing: Keep subjects framed'
        )

        expect(
          persist
        ).toHaveBeenCalledTimes(1)
      }
    )

    it(
      'rejects stale reviews after any project change',
      () => {
        const project =
          fixture()

        const review =
          reviewShortReframeProposal(
            project,
            proposal()
          )

        const changed =
          applyTimelineOperation(
            project,
            {
              type:
                'set-clip-reframe',

              trackId:
                'video-track',

              clipId:
                'clip-left',

              reframe: {
                focusX:
                  0.1,

                focusY:
                  0.5
              }
            }
          )

        expect(
          () =>
            commitShortReframeReview(
              changed,
              review,
              [
                'right-focus'
              ],
              {
                snapshot:
                  vi.fn()
              },
              vi.fn()
            )
        ).toThrow(
          /changed after reframing review/i
        )
      }
    )

    it(
      'rejects scene mismatches, locked tracks and no-op proposals',
      () => {
        const project =
          fixture()

        const wrongScene =
          proposal()

        wrongScene.operations[0]
          .sceneId =
            'wrong-scene'

        expect(
          () =>
            reviewShortReframeProposal(
              project,
              wrongScene
            )
        ).toThrow(
          /scene no longer matches/i
        )

        const locked =
          structuredClone(
            project
          )

        locked.tracks[0]
          .locked =
            true

        expect(
          () =>
            reviewShortReframeProposal(
              locked,
              proposal()
            )
        ).toThrow(
          /locked/i
        )

        const noOp =
          proposal()

        noOp.operations[0]
          .focusX =
            0.5

        noOp.operations[0]
          .focusY =
            0.5

        expect(
          () =>
            reviewShortReframeProposal(
              project,
              noOp
            )
        ).toThrow(
          /contains no change/i
        )
      }
    )

    it(
      'requires cover output and valid explicit selections',
      () => {
        const project =
          fixture()

        const contain =
          structuredClone(
            project
          )

        contain.metadata
          .targetFormat =
            'landscape'

        expect(
          () =>
            reviewShortReframeProposal(
              contain,
              proposal()
            )
        ).toThrow(
          /requires a cover/i
        )

        expect(
          () =>
            applyShortReframeProposal(
              project,
              proposal(),
              []
            )
        ).toThrow(
          /select at least one/i
        )

        expect(
          () =>
            applyShortReframeProposal(
              project,
              proposal(),
              [
                'missing'
              ]
            )
        ).toThrow(
          /unknown/i
        )
      }
    )
  }
)
