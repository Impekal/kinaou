import {
  describe,
  expect,
  it
} from 'vitest'

import {
  applyDirectorPlan
} from '../src/core/director'

import {
  buildDirectorEditProposal
} from '../src/core/directorEditProposal'

import {
  buildAiEditorCombinedPreview
} from '../src/core/aiEditorPreview'

import {
  commitAiEditorReview,
  reviewAiEditorProposal
} from '../src/core/aiEditorReview'

import {
  createProjectFromInput
} from '../src/core/create'

import {
  PersistentVersionHistory
} from '../src/core/versioning'


function historyStore() {
  const values =
    new Map<string, string>()

  return new PersistentVersionHistory({
    getItem:
      key =>
        values.get(key)
        ?? null,

    setItem:
      (
        key,
        value
      ) => {
        values.set(
          key,
          value
        )
      },

    removeItem:
      key => {
        values.delete(
          key
        )
      }
  })
}


function fixture() {
  const base =
    createProjectFromInput(
      {
        title:
          'Director → Editor Acceptance',

        kind:
          'idea',

        content:
          ''
      },
      new Date(
        '2026-09-25T10:00:00.000Z'
      )
    )

  const project =
    applyDirectorPlan(
      base,
      {
        schemaVersion:
          1,

        title:
          'Two scene film',

        objective:
          'Create a clean two-scene sequence',

        script:
          'Opening. Detail.',

        scenes: [
          {
            id:
              'scene-opening',

            title:
              'Opening',

            description:
              'Wide opening view',

            durationMs:
              3000,

            narration:
              'Opening.',

            visualBrief:
              'Wide establishing shot',

            requiredMedia: [
              'image'
            ]
          },

          {
            id:
              'scene-detail',

            title:
              'Detail',

            description:
              'Closer detail',

            durationMs:
              2000,

            narration:
              'Detail.',

            visualBrief:
              'Close detail shot',

            requiredMedia: [
              'image'
            ]
          }
        ],

        provenance: {
          kind:
            'manual'
        }
      },
      new Date(
        '2026-09-25T10:01:00.000Z'
      )
    )

  project.assets.push(
    {
      id:
        'opening-image',

      kind:
        'image',

      uri:
        'KINAOU/Assets/opening.png',

      managed:
        true,

      offline:
        false,

      metadata: {
        name:
          'Opening'
      }
    },

    {
      id:
        'detail-image',

      kind:
        'image',

      uri:
        'KINAOU/Assets/detail.png',

      managed:
        true,

      offline:
        false,

      metadata: {
        name:
          'Detail'
      }
    }
  )

  project.storyboard =
    project.storyboard.map(
      scene => ({
        ...scene,

        assetId:
          scene.id
            === 'scene-opening'
            ? 'opening-image'
            : 'detail-image'
      })
    )

  const videoTrack =
    project.tracks.find(
      track =>
        track.type === 'video'
    )!

  videoTrack.clips.push(
    {
      id:
        'opening-clip',

      assetId:
        'opening-image',

      startMs:
        500,

      durationMs:
        2500,

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
        'detail-clip',

      assetId:
        'detail-image',

      startMs:
        3500,

      durationMs:
        1500,

      sourceOffsetMs:
        0,

      gain:
        1,

      speed:
        1,

      sceneId:
        'scene-detail'
    }
  )

  return {
    project,
    videoTrack
  }
}


describe(
  'Director → executable Editor acceptance',
  () => {
    it(
      'reviews a deterministic Director edit, previews the final state and saves only after explicit selection',
      () => {
        const {
          project,
          videoTrack
        } =
          fixture()

        const original =
          structuredClone(
            project
          )

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
            .map(
              operation =>
                operation.id
            )
        ).toEqual([
          'director-001-align-trim',
          'director-002-align-trim'
        ])

        const selected =
          proposal!.operations.map(
            operation =>
              operation.id
          )

        const preview =
          buildAiEditorCombinedPreview(
            project,
            proposal,
            selected
          )

        expect(
          preview.targets
            .map(
              target => ({
                clip:
                  target.after
                    .clipId,

                start:
                  target.after
                    .startMs,

                duration:
                  target.after
                    .durationMs
              })
            )
        ).toEqual([
          {
            clip:
              'opening-clip',

            start:
              0,

            duration:
              3000
          },

          {
            clip:
              'detail-clip',

            start:
              3000,

            duration:
              2000
          }
        ])

        /*
         * Preview must be side-effect free.
         */
        expect(
          project
        ).toEqual(
          original
        )

        expect(
          project.metadata
            .lastAiEditorApply
        ).toBeUndefined()

        const review =
          reviewAiEditorProposal(
            project,
            proposal
          )

        const history =
          historyStore()

        let saved =
          project

        const applied =
          commitAiEditorReview(
            project,
            review,
            selected,
            history,
            next => {
              saved =
                next
            }
          )

        expect(
          applied
        ).toBe(2)

        const savedTrack =
          saved.tracks.find(
            track =>
              track.id ===
              videoTrack.id
          )!

        expect(
          savedTrack.clips
            .map(
              clip => ({
                id:
                  clip.id,

                start:
                  clip.startMs,

                duration:
                  clip.durationMs
              })
            )
        ).toEqual([
          {
            id:
              'opening-clip',

            start:
              0,

            duration:
              3000
          },

          {
            id:
              'detail-clip',

            start:
              3000,

            duration:
              2000
          }
        ])

        expect(
          saved.metadata
            .lastAiEditorApply
        ).toMatchObject({
          selectedOperationIds:
            selected
        })

        const versions =
          history.list(
            project.id
          )

        expect(
          versions
        ).toHaveLength(1)

        expect(
          versions[0]
            .project
        ).toEqual(
          original
        )
      }
    )

    it(
      'keeps the reviewed Director proposal stale-safe before persistence',
      () => {
        const {
          project
        } =
          fixture()

        const proposal =
          buildDirectorEditProposal(
            project
          )!

        const review =
          reviewAiEditorProposal(
            project,
            proposal
          )

        const changed =
          structuredClone(
            project
          )

        changed.title =
          'Project changed after review'

        const history =
          historyStore()

        expect(
          () =>
            commitAiEditorReview(
              changed,
              review,
              proposal.operations.map(
                operation =>
                  operation.id
              ),
              history,
              () => {
                throw new Error(
                  'must not persist'
                )
              }
            )
        ).toThrow(
          /changed after review/i
        )

        expect(
          history.list(
            project.id
          )
        ).toEqual([])
      }
    )
  }
)
