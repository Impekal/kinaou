import {
  describe,
  expect,
  it
} from 'vitest'

import {
  defaultAudioDucking
} from '../src/core/audioDucking'

import {
  defaultLoudnessNormalization
} from '../src/core/audioLoudness'

import {
  commitCaptionChange
} from '../src/core/captionEditing'

import {
  setCaptionClipStyle
} from '../src/core/captionStyle'

import {
  createProject,
  parseProject,
  type KinaouProject
} from '../src/core/project'

import {
  createRenderPlan,
  projectFormatPreset
} from '../src/core/render'

import {
  commitShortAudioFinishingReview,
  resolveShortRenderAudioSettings,
  reviewShortAudioFinishing
} from '../src/core/shortAudioFinishing'

import {
  commitShortReframeReview,
  reviewShortReframeProposal
} from '../src/core/shortReframing'

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


function fixture():
  KinaouProject {
  const base =
    createProject(
      'Publish-ready Short',
      new Date(
        '2026-09-26T10:00:00.000Z'
      )
    )

  return parseProject({
    ...base,

    id:
      'publish-ready-short',

    updatedAt:
      '2026-09-26T10:00:00.000Z',

    storyboard: [
      {
        id:
          'short-segment-001',

        title:
          'Speaker left',

        description:
          'The speaker is explicitly positioned on the left side of frame.',

        durationMs:
          10_000,

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
          'KINAOU/Assets/video.mp4',

        managed:
          true,

        offline:
          false,

        metadata: {
          name:
            'Video',

          durationMs:
            10_000
        }
      },

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
          name:
            'Voice',

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
          name:
            'Music',

          durationMs:
            10_000
        }
      },

      {
        id:
          'caption',

        kind:
          'caption',

        uri:
          'kinaou://caption/caption',

        managed:
          true,

        offline:
          false,

        metadata: {
          name:
            'Opening caption',

          text:
            'Publish-ready Short'
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
              'video-clip',

            assetId:
              'video',

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
      },

      {
        id:
          'caption-track',

        type:
          'caption',

        name:
          'Captions',

        muted:
          false,

        locked:
          false,

        clips: [
          {
            id:
              'caption-clip',

            assetId:
              'caption',

            startMs:
              500,

            durationMs:
              3000,

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
          'Source project',

        sourceProjectUpdatedAt:
          '2026-09-26T09:00:00.000Z',

        sourceTimelineDurationMs:
          60_000,

        createdAt:
          '2026-09-26T09:30:00.000Z',

        materializedAt:
          '2026-09-26T09:31:00.000Z',

        cutTitle:
          'Opening',

        objective:
          'Create a publish-ready Short.',

        maximumDurationMs:
          60_000,

        durationMs:
          10_000,

        selectedCandidateIds: [
          'opening'
        ],

        segments: [
          {
            position:
              1,

            candidateId:
              'opening',

            hook:
              'Opening',

            rationale:
              'Reviewed opening segment.',

            sourceInMs:
              5000,

            sourceOutMs:
              15_000,

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
          'source-project',

        derivativeProjectId:
          'publish-ready-short',

        materializedAt:
          '2026-09-26T09:31:00.000Z',

        assets: [
          {
            assetId:
              'video',

            sourceAssetId:
              'video'
          },

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
          },

          {
            assetId:
              'caption',

            sourceAssetId:
              'caption'
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
          },

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
          },

          {
            trackId:
              'caption-track',

            sourceTrackId:
              'source-caption-track',

            type:
              'caption'
          }
        ],

        clips: [
          {
            clipId:
              'video-clip',

            sourceClipId:
              'source-video-clip',

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
              'voice-clip',

            sourceClipId:
              'source-voice-clip',

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
              'source-music-clip',

            sourceTrackId:
              'source-music-track',

            trackId:
              'music-track',

            assetId:
              'music',

            segmentPosition:
              1
          },

          {
            clipId:
              'caption-clip',

            sourceClipId:
              'source-caption-clip',

            sourceTrackId:
              'source-caption-track',

            trackId:
              'caption-track',

            assetId:
              'caption',

            segmentPosition:
              1
          }
        ]
      }
    }
  })
}


describe(
  'Phase 5.3 publish-ready Short acceptance',
  () => {
    it(
      'finishes reframing, captions and audio through reviewed reversible changes and one render contract',
      () => {
        let project =
          fixture()

        const initial =
          structuredClone(
            project
          )

        const history =
          new PersistentVersionHistory(
            memoryStore(),
            100,
            () =>
              new Date(
                '2026-09-26T11:00:00.000Z'
              )
          )

        /*
         * 1. Reframing is review-only until an explicit selected apply.
         */
        const reframeReview =
          reviewShortReframeProposal(
            project,
            {
              schemaVersion:
                1,

              title:
                'Opening framing',

              objective:
                'Keep the explicitly left-positioned speaker visible.',

              operations: [
                {
                  id:
                    'focus-left',

                  trackId:
                    'video-track',

                  clipId:
                    'video-clip',

                  sceneId:
                    'short-segment-001',

                  focusX:
                    0.2,

                  focusY:
                    0.5,

                  reason:
                    'The scene description explicitly places the speaker on the left.'
                }
              ],

              provenance: {
                kind:
                  'manual'
              }
            }
          )

        expect(
          project.tracks[0]
            .clips[0]
            .reframe
        ).toBeUndefined()

        let reframed:
          KinaouProject
          | null =
            null

        expect(
          commitShortReframeReview(
            project,
            reframeReview,
            [
              'focus-left'
            ],
            history,
            next => {
              reframed =
                next
            },
            new Date(
              '2026-09-26T11:01:00.000Z'
            )
          )
        ).toBe(1)

        expect(
          reframed
        ).not.toBeNull()

        project =
          reframed!

        expect(
          project.tracks
            .find(
              track =>
                track.id
                === 'video-track'
            )!
            .clips[0]
            .reframe
        ).toEqual({
          focusX:
            0.2,

          focusY:
            0.5
        })

        /*
         * 2. Caption style also snapshots before the explicit apply.
         */
        project =
          commitCaptionChange(
            project,
            () =>
              setCaptionClipStyle(
                project,
                'caption-track',
                'caption-clip',
                {
                  preset:
                    'boxed',

                  position:
                    'top',

                  size:
                    'large'
                },
                new Date(
                  '2026-09-26T11:02:00.000Z'
                )
              ),
            history,
            () => {},
            'Before Short caption finishing'
          )

        expect(
          project.tracks
            .find(
              track =>
                track.id
                === 'caption-track'
            )!
            .clips[0]
            .captionStyle
        ).toEqual({
          preset:
            'boxed',

          position:
            'top',

          size:
            'large'
        })

        /*
         * 3. Audio settings are reviewed before persistence.
         */
        const audioReview =
          reviewShortAudioFinishing(
            project,
            {
              audioDucking: {
                enabled:
                  true,

                reductionDb:
                  9,

                attackMs:
                  100,

                releaseMs:
                  300
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

        expect(
          audioReview.warnings
        ).toEqual([])

        project =
          commitShortAudioFinishingReview(
            project,
            audioReview,
            history,
            () => {},
            new Date(
              '2026-09-26T11:03:00.000Z'
            )
          )

        /*
         * Every applied finishing domain consumed a safety snapshot.
         */
        expect(
          history.list(
            project.id
          )
        ).toHaveLength(3)

        /*
         * The original reviewed child remains structurally untouched.
         */
        expect(
          initial.tracks
            .find(
              track =>
                track.id
                === 'video-track'
            )!
            .clips[0]
            .reframe
        ).toBeUndefined()

        expect(
          initial.tracks
            .find(
              track =>
                track.id
                === 'caption-track'
            )!
            .clips[0]
            .captionStyle
        ).toBeUndefined()

        expect(
          initial.metadata
            .shortAudioFinishing
        ).toBeUndefined()

        /*
         * 4. One final render contract carries all reviewed finishing choices.
         */
        const settings =
          resolveShortRenderAudioSettings(
            project,
            {
              audioDucking: {
                ...defaultAudioDucking
              },

              loudnessNormalization: {
                ...defaultLoudnessNormalization
              }
            }
          )

        const beforeRender =
          structuredClone(
            project
          )

        const plan =
          createRenderPlan(
            project,
            projectFormatPreset(
              project,
              'vertical',
              'export'
            ),
            'KINAOU/Renders/publish-ready-short.mp4',
            settings
          )

        expect(
          project
        ).toEqual(
          beforeRender
        )

        expect(
          plan.preset
        ).toMatchObject({
          width:
            1080,

          height:
            1920,

          fit:
            'cover'
        })

        expect(
          plan.durationMs
        ).toBe(
          10_000
        )

        expect(
          plan.requiredCapabilities
        ).toContain(
          'format-reframing'
        )

        expect(
          plan.clips.find(
            clip =>
              clip.clipId
              === 'video-clip'
          )?.reframe
        ).toEqual({
          focusX:
            0.2,

          focusY:
            0.5
        })

        expect(
          plan.clips.find(
            clip =>
              clip.clipId
              === 'caption-clip'
          )?.captionStyle
        ).toEqual({
          preset:
            'boxed',

          position:
            'top',

          size:
            'large'
        })

        expect(
          plan.audioDucking
        ).toEqual({
          enabled:
            true,

          reductionDb:
            9,

          attackMs:
            100,

          releaseMs:
            300
        })

        expect(
          plan.loudnessNormalization
        ).toEqual({
          enabled:
            true,

          targetLufs:
            -16,

          truePeakDb:
            -2,

          loudnessRange:
            9
        })

        /*
         * Creating the publish-ready render contract does not export or publish.
         */
        expect(
          plan.purpose
        ).toBe(
          'export'
        )

        expect(
          project.metadata
            .publishPackage
        ).toBeUndefined()
      }
    )
  }
)
