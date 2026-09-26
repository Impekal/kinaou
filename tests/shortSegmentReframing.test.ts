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
  createRenderPlan,
  formatProfiles
} from '../src/core/render'

import {
  applyTimelineOperation
} from '../src/core/timeline'

import {
  buildCompositeFilter
} from '../src/core/localWorker'


function fixture() {
  return parseProject({
    ...createProject(
      'Segment reframing',
      new Date(
        '2026-09-25T20:00:00.000Z'
      )
    ),

    assets: [
      {
        id:
          'video',

        kind:
          'video',

        uri:
          'KINAOU/Assets/striped.mp4',

        managed:
          true,

        offline:
          false,

        metadata: {
          durationMs:
            5000
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

        clips: [
          {
            id:
              'left',

            assetId:
              'video',

            startMs:
              0,

            durationMs:
              1000,

            sourceOffsetMs:
              0,

            gain:
              1,

            speed:
              1,

            sceneId:
              'segment-left',

            reframe: {
              focusX:
                0,

              focusY:
                0.5
            }
          },

          {
            id:
              'right',

            assetId:
              'video',

            startMs:
              1000,

            durationMs:
              1000,

            sourceOffsetMs:
              0,

            gain:
              1,

            speed:
              1,

            sceneId:
              'segment-right',

            reframe: {
              focusX:
                1,

              focusY:
                0.5
            }
          }
        ]
      }
    ]
  })
}


describe(
  'segment-aware Short reframing',
  () => {
    it(
      'persists a normalized focus independently on each clip',
      () => {
        const project =
          fixture()

        expect(
          project.tracks[0]
            .clips.map(
              clip =>
                clip.reframe
            )
        ).toEqual([
          {
            focusX:
              0,

            focusY:
              0.5
          },

          {
            focusX:
              1,

            focusY:
              0.5
          }
        ])
      }
    )

    it(
      'carries per-clip focus into a cover render plan',
      () => {
        const plan =
          createRenderPlan(
            fixture(),
            formatProfiles.vertical
              .preview,
            'KINAOU/Cache/Previews/segment-reframe.mp4'
          )

        expect(
          plan.clips.map(
            clip =>
              clip.reframe
          )
        ).toEqual([
          {
            focusX:
              0,

            focusY:
              0.5
          },

          {
            focusX:
              1,

            focusY:
              0.5
          }
        ])

        expect(
          plan.requiredCapabilities
        ).toContain(
          'format-reframing'
        )
      }
    )

    it(
      'builds distinct per-clip cover crops in the local compositor contract',
      () => {
        const plan =
          createRenderPlan(
            fixture(),
            formatProfiles.vertical
              .preview,
            'KINAOU/Cache/Previews/local-segment-reframe.mp4'
          )

        const graph =
          buildCompositeFilter(
            plan
          ).graph

        expect(
          graph
        ).toContain(
          'crop=540:960:(iw-540)*0:(ih-960)*0.5'
        )

        expect(
          graph
        ).toContain(
          'crop=540:960:(iw-540)*1:(ih-960)*0.5'
        )
      }
    )

    it(
      'does not require format-reframing for contain output',
      () => {
        const plan =
          createRenderPlan(
            fixture(),
            formatProfiles.landscape
              .preview,
            'KINAOU/Cache/Previews/segment-contain.mp4'
          )

        expect(
          plan.requiredCapabilities
        ).not.toContain(
          'format-reframing'
        )
      }
    )

    it(
      'supports explicit set and clear operations through the normal timeline API',
      () => {
        const project =
          fixture()

        const set =
          applyTimelineOperation(
            project,
            {
              type:
                'set-clip-reframe',

              trackId:
                'video-track',

              clipId:
                'left',

              reframe: {
                focusX:
                  0.33,

                focusY:
                  0.66
              }
            }
          )

        expect(
          set.tracks[0]
            .clips[0]
            .reframe
        ).toEqual({
          focusX:
            0.33,

          focusY:
            0.66
        })

        const cleared =
          applyTimelineOperation(
            set,
            {
              type:
                'set-clip-reframe',

              trackId:
                'video-track',

              clipId:
                'left'
            }
          )

        expect(
          cleared.tracks[0]
            .clips[0]
            .reframe
        ).toBeUndefined()
      }
    )

    it(
      'rejects invalid normalized clip focus',
      () => {
        const project =
          structuredClone(
            fixture()
          )

        project.tracks[0]
          .clips[0]
          .reframe = {
            focusX:
              1.25,

            focusY:
              0.5
          }

        expect(
          () =>
            parseProject(
              project
            )
        ).toThrow()
      }
    )
  }
)
