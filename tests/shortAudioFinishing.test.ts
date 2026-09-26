import {
  describe,
  expect,
  it,
  vi
} from 'vitest'

import {
  defaultAudioDucking
} from '../src/core/audioDucking'

import {
  defaultLoudnessNormalization
} from '../src/core/audioLoudness'

import {
  createProject,
  parseProject
} from '../src/core/project'

import {
  applyShortAudioFinishing,
  commitShortAudioFinishingReview,
  defaultShortAudioFinishingProfile,
  projectShortAudioFinishing,
  reviewShortAudioFinishing
} from '../src/core/shortAudioFinishing'

import {
  PersistentVersionHistory
} from '../src/core/versioning'


function memoryStore() {
  const values =
    new Map<
      string,
      string
    >()

  return {
    getItem:
      (
        key:
          string
      ) =>
        values.get(
          key
        )
        ?? null,

    setItem:
      (
        key:
          string,
        value:
          string
      ) => {
        values.set(
          key,
          value
        )
      },

    removeItem:
      (
        key:
          string
      ) => {
        values.delete(
          key
        )
      }
  }
}


function shortProject() {
  return parseProject({
    ...createProject(
      'Audio Short',
      new Date(
        '2026-09-26T10:00:00.000Z'
      )
    ),

    id:
      'audio-short',

    assets: [
      {
        id:
          'voice',

        kind:
          'audio',

        uri:
          'KINAOU/Assets/voice.wav',

        managed:
          true,

        offline:
          false,

        metadata: {
          durationMs:
            10_000
        }
      },

      {
        id:
          'music',

        kind:
          'audio',

        uri:
          'KINAOU/Assets/music.wav',

        managed:
          true,

        offline:
          false,

        metadata: {
          durationMs:
            10_000
        }
      }
    ],

    tracks: [
      {
        id:
          'voice-track',

        type:
          'voice',

        name:
          'Voice',

        muted:
          false,

        locked:
          false,

        clips: [
          {
            id:
              'voice-clip',

            assetId:
              'voice',

            startMs:
              0,

            durationMs:
              10_000,

            sourceOffsetMs:
              0,

            gain:
              1,

            speed:
              1,

            sceneId:
              'short-segment-001'
          }
        ]
      },

      {
        id:
          'music-track',

        type:
          'music',

        name:
          'Music',

        muted:
          false,

        locked:
          false,

        clips: [
          {
            id:
              'music-clip',

            assetId:
              'music',

            startMs:
              0,

            durationMs:
              10_000,

            sourceOffsetMs:
              0,

            gain:
              1,

            speed:
              1,

            sceneId:
              'short-segment-001'
          }
        ]
      }
    ],

    storyboard: [
      {
        id:
          'short-segment-001',

        title:
          'Segment',

        description:
          'Segment',

        durationMs:
          10_000
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
          '2026-09-26T09:00:00.000Z',

        sourceTimelineDurationMs:
          10_000,

        createdAt:
          '2026-09-26T09:30:00.000Z',

        materializedAt:
          '2026-09-26T09:31:00.000Z',

        cutTitle:
          'Short',

        objective:
          'Short',

        maximumDurationMs:
          30_000,

        durationMs:
          10_000,

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
              10_000,

            destinationInMs:
              0,

            destinationOutMs:
              10_000,

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
          'audio-short',

        materializedAt:
          '2026-09-26T09:31:00.000Z',

        assets: [
          {
            assetId:
              'voice',

            sourceAssetId:
              'voice'
          },

          {
            assetId:
              'music',

            sourceAssetId:
              'music'
          }
        ],

        tracks: [
          {
            trackId:
              'voice-track',

            sourceTrackId:
              'source-voice-track',

            type:
              'voice'
          },

          {
            trackId:
              'music-track',

            sourceTrackId:
              'source-music-track',

            type:
              'music'
          }
        ],

        clips: [
          {
            clipId:
              'voice-clip',

            sourceClipId:
              'source-voice',

            sourceTrackId:
              'source-voice-track',

            trackId:
              'voice-track',

            assetId:
              'voice',

            segmentPosition:
              1
          },

          {
            clipId:
              'music-clip',

            sourceClipId:
              'source-music',

            sourceTrackId:
              'source-music-track',

            trackId:
              'music-track',

            assetId:
              'music',

            segmentPosition:
              1
          }
        ]
      }
    }
  })
}


describe(
  'Short audio finishing',
  () => {
    it(
      'falls back to the existing renderer defaults without mutating the project',
      () => {
        const project =
          shortProject()

        const before =
          structuredClone(
            project
          )

        expect(
          projectShortAudioFinishing(
            project
          )
        ).toEqual({
          audioDucking:
            defaultAudioDucking,

          loudnessNormalization:
            defaultLoudnessNormalization
        })

        expect(
          defaultShortAudioFinishingProfile()
        ).toEqual({
          audioDucking:
            defaultAudioDucking,

          loudnessNormalization:
            defaultLoudnessNormalization
        })

        expect(
          project
        ).toEqual(
          before
        )
      }
    )

    it(
      'reviews explicit before and after settings',
      () => {
        const project =
          shortProject()

        const review =
          reviewShortAudioFinishing(
            project,
            {
              audioDucking: {
                enabled:
                  true,

                reductionDb:
                  10,

                attackMs:
                  100,

                releaseMs:
                  350
              },

              loudnessNormalization: {
                enabled:
                  true,

                targetLufs:
                  -14,

                truePeakDb:
                  -1.5,

                loudnessRange:
                  11
              }
            }
          )

        expect(
          review.current
            .loudnessNormalization
            .enabled
        ).toBe(false)

        expect(
          review.proposed
            .loudnessNormalization
            .enabled
        ).toBe(true)

        expect(
          review.proposed
            .audioDucking
            .reductionDb
        ).toBe(10)

        expect(
          review.warnings
        ).toEqual([])
      }
    )

    it(
      'warns when enabled ducking has no active music',
      () => {
        const project =
          shortProject()

        project.tracks =
          project.tracks.filter(
            track =>
              track.type
              !== 'music'
          )

        const review =
          reviewShortAudioFinishing(
            project,
            {
              audioDucking: {
                ...defaultAudioDucking
              },

              loudnessNormalization: {
                ...defaultLoudnessNormalization,

                enabled:
                  true
              }
            }
          )

        expect(
          review.warnings
        ).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              code:
                'ducking-without-music'
            })
          ])
        )
      }
    )

    it(
      'stores only reviewed validated settings',
      () => {
        const project =
          shortProject()

        const next =
          applyShortAudioFinishing(
            project,
            {
              audioDucking: {
                enabled:
                  false,

                reductionDb:
                  8,

                attackMs:
                  120,

                releaseMs:
                  300
              },

              loudnessNormalization: {
                enabled:
                  true,

                targetLufs:
                  -14,

                truePeakDb:
                  -1.5,

                loudnessRange:
                  11
              }
            },
            new Date(
              '2026-09-26T10:30:00.000Z'
            )
          )

        expect(
          next.metadata
            .shortAudioFinishing
        ).toEqual({
          schemaVersion:
            1,

          updatedAt:
            '2026-09-26T10:30:00.000Z',

          audioDucking: {
            enabled:
              false,

            reductionDb:
              8,

            attackMs:
              120,

            releaseMs:
              300
          },

          loudnessNormalization: {
            enabled:
              true,

            targetLufs:
              -14,

            truePeakDb:
              -1.5,

            loudnessRange:
              11
          }
        })

        expect(
          project.metadata
            .shortAudioFinishing
        ).toBeUndefined()
      }
    )

    it(
      'snapshots before persistence and rejects stale reviews',
      () => {
        const project =
          shortProject()

        const review =
          reviewShortAudioFinishing(
            project,
            {
              audioDucking: {
                ...defaultAudioDucking,

                reductionDb:
                  9
              },

              loudnessNormalization: {
                ...defaultLoudnessNormalization,

                enabled:
                  true
              }
            }
          )

        const history =
          new PersistentVersionHistory(
            memoryStore(),
            100,
            () =>
              new Date(
                '2026-09-26T10:29:00.000Z'
              )
          )

        const persist =
          vi.fn()

        const next =
          commitShortAudioFinishingReview(
            project,
            review,
            history,
            persist,
            new Date(
              '2026-09-26T10:30:00.000Z'
            )
          )

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
          persist
        ).toHaveBeenCalledWith(
          next
        )

        const changed =
          parseProject({
            ...project,

            updatedAt:
              '2026-09-26T10:20:00.000Z'
          })

        expect(
          () =>
            commitShortAudioFinishingReview(
              changed,
              review,
              {
                snapshot:
                  vi.fn()
              },
              vi.fn()
            )
        ).toThrow(
          /changed after audio finishing review/i
        )
      }
    )

    it(
      'rejects invalid values, ordinary projects and no-op reviews',
      () => {
        const project =
          shortProject()

        expect(
          () =>
            reviewShortAudioFinishing(
              project,
              {
                audioDucking: {
                  ...defaultAudioDucking,

                  reductionDb:
                    99
                },

                loudnessNormalization: {
                  ...defaultLoudnessNormalization
                }
              }
            )
        ).toThrow(
          /0 and 40/
        )

        expect(
          () =>
            reviewShortAudioFinishing(
              project,
              defaultShortAudioFinishingProfile()
            )
        ).toThrow(
          /no changes/i
        )

        expect(
          () =>
            reviewShortAudioFinishing(
              createProject(
                'Ordinary'
              ),
              {
                audioDucking: {
                  ...defaultAudioDucking,

                  reductionDb:
                    8
                },

                loudnessNormalization: {
                  ...defaultLoudnessNormalization,

                  enabled:
                    true
                }
              }
            )
        ).toThrow(
          /derivative Short/i
        )
      }
    )
  }
)


it(
  'resolves saved Short audio settings as the render authority while ordinary projects keep caller settings',
  async () => {
    const {
      resolveShortRenderAudioSettings
    } =
      await import(
        '../src/core/shortAudioFinishing'
      )

    const short =
      shortProject()

    const stored =
      applyShortAudioFinishing(
        short,
        {
          audioDucking: {
            enabled:
              true,

            reductionDb:
              7,

            attackMs:
              90,

            releaseMs:
              250
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

    const fallback = {
      audioDucking: {
        enabled:
          false,

        reductionDb:
          20,

        attackMs:
          500,

        releaseMs:
          900
      },

      loudnessNormalization: {
        enabled:
          false,

        targetLufs:
          -12,

        truePeakDb:
          -1,

        loudnessRange:
          15
      }
    }

    expect(
      resolveShortRenderAudioSettings(
        stored,
        fallback
      )
    ).toEqual({
      audioDucking: {
        enabled:
          true,

        reductionDb:
          7,

        attackMs:
          90,

        releaseMs:
          250
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
    })

    const ordinary =
      createProject(
        'Ordinary'
      )

    expect(
      resolveShortRenderAudioSettings(
        ordinary,
        fallback
      )
    ).toEqual(
      fallback
    )
  }
)
