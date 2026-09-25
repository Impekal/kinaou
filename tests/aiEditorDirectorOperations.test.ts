import {
  describe,
  expect,
  it
} from 'vitest'

import {
  applyAiEditorProposal,
  describeAiEdit,
  parseAiEditorProposal
} from '../src/core/aiEditor'

import {
  createProjectFromInput
} from '../src/core/create'


function fixture() {
  const project =
    createProjectFromInput({
      title:
        'Director operations',
      kind:
        'idea',
      content:
        ''
    })

  project.assets.push(
    {
      id:
        'image-a',
      kind:
        'image',
      uri:
        'KINAOU/Assets/a.png',
      managed:
        true,
      offline:
        false,
      metadata: {}
    },
    {
      id:
        'image-b',
      kind:
        'image',
      uri:
        'KINAOU/Assets/b.png',
      managed:
        true,
      offline:
        false,
      metadata: {}
    }
  )

  const track =
    project.tracks.find(
      item =>
        item.type === 'video'
    )!

  track.clips.push(
    {
      id:
        'clip-a',
      assetId:
        'image-a',
      startMs:
        500,
      durationMs:
        1000,
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
        'image-b',
      startMs:
        1800,
      durationMs:
        1000,
      sourceOffsetMs:
        0,
      gain:
        1,
      speed:
        1,
      sceneId:
        'scene-b'
    }
  )

  return {
    project,
    track
  }
}


describe(
  'AI Editor Director operations',
  () => {
    it(
      'applies coordinated clip movement atomically through the existing timeline operation',
      () => {
        const {
          project,
          track
        } =
          fixture()

        const proposal =
          parseAiEditorProposal({
            schemaVersion:
              1,

            title:
              'Align scenes',

            objective:
              'Match Director timing',

            operations: [
              {
                id:
                  'align',

                reason:
                  'Move both scene clips together',

                edit: {
                  type:
                    'move-clips',

                  moves: [
                    {
                      trackId:
                        track.id,
                      clipId:
                        'clip-a',
                      startMs:
                        0
                    },
                    {
                      trackId:
                        track.id,
                      clipId:
                        'clip-b',
                      startMs:
                        1000
                    }
                  ]
                }
              }
            ],

            provenance: {
              kind:
                'manual'
            }
          })

        const description =
          describeAiEdit(
            project,
            proposal.operations[0]
          )

        expect(
          description.before
        ).toContain(
          '500ms'
        )

        expect(
          description.after
        ).toContain(
          '1000ms'
        )

        const next =
          applyAiEditorProposal(
            project,
            proposal,
            [
              'align'
            ]
          )

        expect(
          next.tracks
            .find(
              item =>
                item.id ===
                  track.id
            )!
            .clips
            .map(
              clip =>
                clip.startMs
            )
        ).toEqual([
          0,
          1000
        ])
      }
    )

    it(
      'sets and clears dissolve transitions',
      () => {
        const {
          project,
          track
        } =
          fixture()

        const set =
          {
            schemaVersion:
              1 as const,

            title:
              'Transition',

            objective:
              'Add dissolve',

            operations: [
              {
                id:
                  'transition',

                reason:
                  'Smooth scene change',

                edit: {
                  type:
                    'set-clip-transition' as const,
                  trackId:
                    track.id,
                  clipId:
                    'clip-b',
                  durationMs:
                    400
                }
              }
            ],

            provenance: {
              kind:
                'manual' as const
            }
          }

        const withTransition =
          applyAiEditorProposal(
            project,
            set,
            [
              'transition'
            ]
          )

        expect(
          withTransition
            .tracks
            .find(
              item =>
                item.id === track.id
            )!
            .clips[1]
            .transitionIn
        ).toEqual({
          type:
            'dissolve',
          durationMs:
            400
        })

        const cleared =
          applyAiEditorProposal(
            withTransition,
            {
              ...set,

              operations: [
                {
                  ...set.operations[0],

                  edit: {
                    ...set.operations[0]
                      .edit,

                    durationMs:
                      0
                  }
                }
              ]
            },
            [
              'transition'
            ]
          )

        expect(
          cleared.tracks
            .find(
              item =>
                item.id ===
                  track.id
            )!
            .clips[1]
            .transitionIn
        ).toBeUndefined()
      }
    )

    it(
      'sets and clears still-image motion',
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
            'Motion',

          objective:
            'Add restrained movement',

          operations: [
            {
              id:
                'motion',

              reason:
                'Avoid a static still',

              edit: {
                type:
                  'set-clip-motion' as const,

                trackId:
                  track.id,

                clipId:
                  'clip-a',

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

        const moved =
          applyAiEditorProposal(
            project,
            proposal,
            [
              'motion'
            ]
          )

        expect(
          moved.tracks
            .find(
              item =>
                item.id ===
                  track.id
            )!
            .clips[0]
            .motion
        ).toBe(
          'zoom-in'
        )

        const cleared =
          applyAiEditorProposal(
            moved,
            {
              ...proposal,

              operations: [
                {
                  ...proposal
                    .operations[0],

                  edit: {
                    ...proposal
                      .operations[0]
                      .edit,

                    motion:
                      'none' as const
                  }
                }
              ]
            },
            [
              'motion'
            ]
          )

        expect(
          cleared.tracks
            .find(
              item =>
                item.id ===
                  track.id
            )!
            .clips[0]
            .motion
        ).toBeUndefined()
      }
    )

    it(
      'rejects duplicate coordinated move targets',
      () => {
        const {
          track
        } =
          fixture()

        expect(
          () =>
            parseAiEditorProposal({
              schemaVersion:
                1,

              title:
                'Bad move',

              objective:
                'Duplicate target',

              operations: [
                {
                  id:
                    'duplicate',

                  reason:
                    'Invalid',

                  edit: {
                    type:
                      'move-clips',

                    moves: [
                      {
                        trackId:
                          track.id,
                        clipId:
                          'clip-a',
                        startMs:
                          0
                      },
                      {
                        trackId:
                          track.id,
                        clipId:
                          'clip-a',
                        startMs:
                          1000
                      }
                    ]
                  }
                }
              ],

              provenance: {
                kind:
                  'manual'
              }
            })
        ).toThrow(
          /unique clips/i
        )
      }
    )
  }
)
