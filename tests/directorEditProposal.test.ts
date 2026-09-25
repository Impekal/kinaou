import {
  describe,
  expect,
  it
} from 'vitest'

import {
  applyAiEditorProposal,
  parseAiEditorProposal
} from '../src/core/aiEditor'

import {
  applyDirectorPlan
} from '../src/core/director'

import {
  buildDirectorEditProposal
} from '../src/core/directorEditProposal'

import {
  createProjectFromInput
} from '../src/core/create'


function oneSceneFixture(
  options: {
    startMs?: number
    durationMs?: number
    assetKind?: 'image' | 'video'
    assetDurationMs?: number
  } = {}
) {
  const base =
    createProjectFromInput({
      title:
        'Director proposal',
      kind:
        'idea',
      content:
        ''
    })

  const applied =
    applyDirectorPlan(
      base,
      {
        schemaVersion:
          1,

        title:
          'Director cut',

        objective:
          'Align one scene',

        script:
          'Words',

        scenes: [
          {
            id:
              'scene-a',
            title:
              'Opening',
            description:
              'Opening visual',
            durationMs:
              3000,
            narration:
              'Words',
            visualBrief:
              'Wide shot',
            requiredMedia: [
              options.assetKind
                ?? 'image'
            ]
          }
        ],

        provenance: {
          kind:
            'manual'
        }
      }
    )

  const kind =
    options.assetKind
    ?? 'image'

  applied.assets.push({
    id:
      'asset-a',

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
      ...(options.assetDurationMs
        !== undefined
        ? {
            durationMs:
              options.assetDurationMs
          }
        : {})
    }
  })

  applied.storyboard[0] = {
    ...applied.storyboard[0],
    assetId:
      'asset-a'
  }

  const track =
    applied.tracks.find(
      item =>
        item.type === 'video'
    )!

  track.clips.push({
    id:
      'clip-a',

    assetId:
      'asset-a',

    startMs:
      options.startMs
      ?? 500,

    durationMs:
      options.durationMs
      ?? 2000,

    sourceOffsetMs:
      0,

    gain:
      1,

    speed:
      1,

    sceneId:
      'scene-a'
  })

  return {
    project:
      applied,
    track
  }
}


describe(
  'Director-derived edit proposal',
  () => {
    it(
      'creates a deterministic trim operation that also aligns the scene start',
      () => {
        const {
          project,
          track
        } =
          oneSceneFixture()

        const proposal =
          buildDirectorEditProposal(
            project
          )

        expect(
          proposal
        ).not.toBeNull()

        expect(
          proposal?.provenance
        ).toEqual({
          kind:
            'director-derived',
          adapterId:
            'kinaou-director-execution'
        })

        expect(
          proposal?.operations
        ).toEqual([
          expect.objectContaining({
            id:
              'director-001-align-trim',

            edit: {
              type:
                'trim-clip',
              trackId:
                track.id,
              clipId:
                'clip-a',
              startMs:
                0,
              durationMs:
                3000,
              sourceOffsetMs:
                0
            }
          })
        ])

        const next =
          applyAiEditorProposal(
            project,
            proposal!,
            [
              'director-001-align-trim'
            ]
          )

        expect(
          next.tracks
            .find(
              item =>
                item.id ===
                  track.id
            )!
            .clips[0]
        ).toMatchObject({
          startMs:
            0,
          durationMs:
            3000
        })
      }
    )

    it(
      'uses a move-only operation when duration already matches',
      () => {
        const {
          project
        } =
          oneSceneFixture({
            startMs:
              800,
            durationMs:
              3000
          })

        expect(
          buildDirectorEditProposal(
            project
          )?.operations[0]
            .edit
        ).toMatchObject({
          type:
            'move-clip',
          startMs:
            0
        })
      }
    )

    it(
      'returns no proposal when the timeline already matches Director timing',
      () => {
        const {
          project
        } =
          oneSceneFixture({
            startMs:
              0,
            durationMs:
              3000
          })

        expect(
          buildDirectorEditProposal(
            project
          )
        ).toBeNull()
      }
    )

    it(
      'moves multiple clips for one scene together without changing their internal spacing',
      () => {
        const {
          project,
          track
        } =
          oneSceneFixture({
            startMs:
              1000,
            durationMs:
              3000
          })

        project.assets.push({
          id:
            'asset-overlay',
          kind:
            'image',
          uri:
            'KINAOU/Assets/overlay.png',
          managed:
            true,
          offline:
            false,
          metadata: {}
        })

        track.clips.push({
          id:
            'clip-overlay',

          assetId:
            'asset-overlay',

          startMs:
            1500,

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
        })

        const proposal =
          buildDirectorEditProposal(
            project
          )

        const edit =
          proposal
            ?.operations[0]
            .edit

        expect(
          edit?.type
        ).toBe(
          'move-clips'
        )

        if (
          edit?.type
            !== 'move-clips'
        ) {
          throw new Error(
            'Expected coordinated move'
          )
        }

        expect(
          edit.moves
        ).toEqual([
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
              'clip-overlay',
            startMs:
              500
          }
        ])
      }
    )

    it(
      'refuses to extend a video beyond verified source duration',
      () => {
        const {
          project
        } =
          oneSceneFixture({
            assetKind:
              'video',
            assetDurationMs:
              2200,
            startMs:
              0,
            durationMs:
              2000
          })

        expect(
          () =>
            buildDirectorEditProposal(
              project
            )
        ).toThrow(
          /enough source video/i
        )
      }
    )

    it(
      'refuses an untrusted director-derived provenance marker',
      () => {
        expect(
          () =>
            parseAiEditorProposal({
              schemaVersion:
                1,
              title:
                'Bad provenance',
              objective:
                'Reject',
              operations: [
                {
                  id:
                    'x',
                  reason:
                    'x',
                  edit: {
                    type:
                      'move-clip',
                    trackId:
                      't',
                    clipId:
                      'c',
                    startMs:
                      0
                  }
                }
              ],
              provenance: {
                kind:
                  'director-derived',
                adapterId:
                  'other'
              }
            })
        ).toThrow(
          /trusted KINAOU Director adapter/i
        )
      }
    )
  }
)
