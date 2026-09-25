import {
  describe,
  expect,
  it
} from 'vitest'

import {
  applyAiEditorProposal
} from '../src/core/aiEditor'

import {
  buildAiEditorCombinedPreview
} from '../src/core/aiEditorPreview'

import {
  createProjectFromInput
} from '../src/core/create'


function fixture(
  kind:
    'image'
    | 'video'
    = 'image'
) {
  const project =
    createProjectFromInput({
      title:
        'Combined preview',
      kind:
        'idea',
      content:
        ''
    })

  project.assets.push({
    id:
      'asset',

    kind,

    uri:
      kind === 'image'
        ? 'KINAOU/Assets/a.png'
        : 'KINAOU/Assets/a.mp4',

    managed:
      true,

    offline:
      false,

    metadata: {
      name:
        'Scene media',

      ...(kind === 'video'
        ? {
            durationMs:
              5000
          }
        : {})
    }
  })

  const track =
    project.tracks.find(
      item =>
        item.type === 'video'
    )!

  track.clips.push({
    id:
      'clip',

    assetId:
      'asset',

    startMs:
      500,

    durationMs:
      2000,

    sourceOffsetMs:
      0,

    gain:
      1,

    speed:
      1,

    fades: {
      inMs:
        0,
      outMs:
        0
    }
  })

  return {
    project,
    track
  }
}


describe(
  'AI Editor combined preview',
  () => {
    it(
      'shows the real sequential final state without mutating the reviewed project',
      () => {
        const {
          project,
          track
        } =
          fixture()

        const before =
          structuredClone(
            project
          )

        const proposal = {
          schemaVersion:
            1 as const,

          title:
            'Combined',

          objective:
            'Preview the final state',

          operations: [
            {
              id:
                'move',

              reason:
                'Align opening',

              edit: {
                type:
                  'move-clip' as const,
                trackId:
                  track.id,
                clipId:
                  'clip',
                startMs:
                  0
              }
            },

            {
              id:
                'transition',

              reason:
                'Add dissolve',

              edit: {
                type:
                  'set-clip-transition' as const,
                trackId:
                  track.id,
                clipId:
                  'clip',
                durationMs:
                  400
              }
            },

            {
              id:
                'motion',

              reason:
                'Add movement',

              edit: {
                type:
                  'set-clip-motion' as const,
                trackId:
                  track.id,
                clipId:
                  'clip',
                motion:
                  'zoom-in' as const
              }
            }
          ],

          provenance: {
            kind:
              'manual' as const
          }
        }

        const preview =
          buildAiEditorCombinedPreview(
            project,
            proposal,
            [
              'move',
              'transition',
              'motion'
            ]
          )

        expect(
          preview.targets
        ).toHaveLength(1)

        expect(
          preview.targets[0]
            .before
        ).toMatchObject({
          startMs:
            500,
          transitionMs:
            null,
          motion:
            null
        })

        expect(
          preview.targets[0]
            .after
        ).toMatchObject({
          startMs:
            0,
          transitionMs:
            400,
          motion:
            'zoom-in'
        })

        expect(
          project
        ).toEqual(
          before
        )

        expect(
          project.metadata
            .lastAiEditorApply
        ).toBeUndefined()
      }
    )

    it(
      'uses only selected operations in the projected state',
      () => {
        const {
          project,
          track
        } =
          fixture()

        const proposal = {
          schemaVersion:
            1 as const,

          title:
            'Partial',

          objective:
            'Preview selection',

          operations: [
            {
              id:
                'move',

              reason:
                'Move',

              edit: {
                type:
                  'move-clip' as const,
                trackId:
                  track.id,
                clipId:
                  'clip',
                startMs:
                  0
              }
            },

            {
              id:
                'gain',

              reason:
                'Lower',

              edit: {
                type:
                  'set-clip-gain' as const,
                trackId:
                  track.id,
                clipId:
                  'clip',
                gain:
                  0.5
              }
            }
          ],

          provenance: {
            kind:
              'manual' as const
          }
        }

        const preview =
          buildAiEditorCombinedPreview(
            project,
            proposal,
            [
              'gain'
            ]
          )

        expect(
          preview.targets[0]
            .after
        ).toMatchObject({
          startMs:
            500,
          gain:
            0.5
        })
      }
    )

    it(
      'blocks a combination that makes an existing transition longer than the final clip',
      () => {
        const {
          project,
          track
        } =
          fixture()

        const proposal = {
          schemaVersion:
            1 as const,

          title:
            'Invalid combination',

          objective:
            'Must fail',

          operations: [
            {
              id:
                'transition',

              reason:
                'Long dissolve',

              edit: {
                type:
                  'set-clip-transition' as const,
                trackId:
                  track.id,
                clipId:
                  'clip',
                durationMs:
                  900
              }
            },

            {
              id:
                'trim',

              reason:
                'Shorten',

              edit: {
                type:
                  'trim-clip' as const,
                trackId:
                  track.id,
                clipId:
                  'clip',
                startMs:
                  500,
                durationMs:
                  500,
                sourceOffsetMs:
                  0
              }
            }
          ],

          provenance: {
            kind:
              'manual' as const
          }
        }

        expect(
          () =>
            buildAiEditorCombinedPreview(
              project,
              proposal,
              [
                'transition',
                'trim'
              ]
            )
        ).toThrow(
          /transition longer/i
        )

        expect(
          () =>
            applyAiEditorProposal(
              project,
              proposal,
              [
                'transition',
                'trim'
              ]
            )
        ).toThrow(
          /transition longer/i
        )
      }
    )

    it(
      'blocks still-image motion on video media instead of silently ignoring it',
      () => {
        const {
          project,
          track
        } =
          fixture(
            'video'
          )

        const proposal = {
          schemaVersion:
            1 as const,

          title:
            'Invalid motion',

          objective:
            'Must fail',

          operations: [
            {
              id:
                'motion',

              reason:
                'Invalid Ken Burns',

              edit: {
                type:
                  'set-clip-motion' as const,
                trackId:
                  track.id,
                clipId:
                  'clip',
                motion:
                  'zoom-in' as const
              }
            }
          ],

          provenance: {
            kind:
              'manual' as const
          }
        }

        expect(
          () =>
            buildAiEditorCombinedPreview(
              project,
              proposal,
              [
                'motion'
              ]
            )
        ).toThrow(
          /image asset/i
        )
      }
    )
  }
)
