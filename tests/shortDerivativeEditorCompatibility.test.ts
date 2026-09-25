import {
  describe,
  expect,
  it,
  vi
} from 'vitest'

import {
  commitAiEditorReview,
  reviewAiEditorProposal
} from '../src/core/aiEditorReview'

import {
  updateCaptionText
} from '../src/core/captions'

import {
  createProjectFromInput
} from '../src/core/create'

import {
  ProjectRepository
} from '../src/core/persistence'

import {
  preview1080pPreset,
  createRenderPlan
} from '../src/core/render'

import {
  buildShortCutPlan
} from '../src/core/shortCutPlan'

import {
  createShortDerivativeDraft
} from '../src/core/shortDerivative'

import {
  materializeShortDerivative
} from '../src/core/shortDerivativeMaterialize'

import {
  buildShortIntelligenceContext
} from '../src/core/shortIntelligence'

import {
  applyTimelineOperation
} from '../src/core/timeline'

import {
  TimelineUndoSession
} from '../src/core/timelineUndo'

import {
  PersistentVersionHistory
} from '../src/core/versioning'


function store() {
  const data =
    new Map<string, string>()

  return {
    data,

    storage: {
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
}


function idFactory() {
  let value =
    0

  return () =>
    `child-${++value}`
}


function fixture() {
  const source =
    createProjectFromInput(
      {
        title:
          'Editable Short source',

        kind:
          'video',

        content:
          ''
      },
      new Date(
        '2026-09-25T18:00:00.000Z'
      )
    )

  source.assets.push(
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
        name:
          'Source video',

        durationMs:
          120_000
      }
    },

    {
      id:
        'audio',

      kind:
        'audio',

      uri:
        'KINAOU/Assets/source.wav',

      managed:
        true,

      offline:
        false,

      metadata: {
        name:
          'Source audio',

        durationMs:
          120_000
      }
    },

    {
      id:
        'caption-a',

      kind:
        'caption',

      uri:
        'kinaou://caption/caption-a',

      managed:
        true,

      offline:
        false,

      metadata: {
        name:
          'Original caption',

        text:
          'Original caption'
      }
    }
  )

  source.storyboard = [
    {
      id:
        'scene-a',

      title:
        'Opening',

      description:
        'Opening',

      durationMs:
        30_000
    },

    {
      id:
        'scene-b',

      title:
        'Proof',

      description:
        'Proof',

      durationMs:
        30_000
    }
  ]

  const video =
    source.tracks.find(
      track =>
        track.type
        === 'video'
    )!

  const voice =
    source.tracks.find(
      track =>
        track.type
        === 'voice'
    )!

  const captions =
    source.tracks.find(
      track =>
        track.type
        === 'caption'
    )!

  video.clips.push(
    {
      id:
        'video-a',

      assetId:
        'video',

      startMs:
        0,

      durationMs:
        30_000,

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
        'video-b',

      assetId:
        'video',

      startMs:
        60_000,

      durationMs:
        30_000,

      sourceOffsetMs:
        60_000,

      gain:
        1,

      speed:
        1,

      sceneId:
        'scene-b'
    }
  )

  voice.clips.push({
    id:
      'voice',

    assetId:
      'audio',

    startMs:
      0,

    durationMs:
      90_000,

    sourceOffsetMs:
      0,

    gain:
      1,

    speed:
      1
  })

  captions.clips.push({
    id:
      'caption',

    assetId:
      'caption-a',

    startMs:
      12_000,

    durationMs:
      5000,

    sourceOffsetMs:
      0,

    gain:
      1,

    speed:
      1
  })

  const context =
    buildShortIntelligenceContext(
      source,
      30_000
    )

  const proposal = {
    schemaVersion:
      1,

    title:
      'Editable Short',

    objective:
      'Proof first, context second.',

    candidates: [
      {
        id:
          'context',

        hook:
          'Context',

        rationale:
          'Provide context.',

        inMs:
          10_000,

        outMs:
          20_000,

        order:
          2,

        evidence: [
          {
            kind:
              'scene',
            id:
              'scene-a'
          }
        ]
      },

      {
        id:
          'proof',

        hook:
          'Proof',

        rationale:
          'Lead with proof.',

        inMs:
          65_000,

        outMs:
          75_000,

        order:
          1,

        evidence: [
          {
            kind:
              'scene',
            id:
              'scene-b'
          }
        ]
      }
    ],

    provenance: {
      kind:
        'manual'
    }
  }

  const cut =
    buildShortCutPlan(
      context,
      proposal,
      [
        'proof',
        'context'
      ]
    )

  const draft =
    createShortDerivativeDraft(
      source,
      cut,
      new Date(
        '2026-09-25T19:00:00.000Z'
      ),
      'short-child'
    )

  const child =
    materializeShortDerivative(
      source,
      draft,
      cut,
      new Date(
        '2026-09-25T19:01:00.000Z'
      ),
      idFactory()
    )

  return {
    source,
    child
  }
}


describe(
  'materialized Short editor compatibility',
  () => {
    it(
      'supports ordinary Timeline operations and undo/redo',
      () => {
        const {
          child
        } =
          fixture()

        const video =
          child.tracks.find(
            track =>
              track.type
              === 'video'
          )!

        const clip =
          video.clips[0]

        const undo =
          new TimelineUndoSession(
            child
          )

        const moved =
          applyTimelineOperation(
            child,
            {
              type:
                'move-clip',

              trackId:
                video.id,

              clipId:
                clip.id,

              startMs:
                500
            }
          )

        undo.record(
          child,
          moved
        )

        expect(
          moved.tracks
            .find(
              track =>
                track.id
                === video.id
            )!
            .clips[0]
            .startMs
        ).toBe(
          500
        )

        const undone =
          undo.undo(
            moved,
            vi.fn()
          )!

        expect(
          undone.tracks
            .find(
              track =>
                track.id
                === video.id
            )!
            .clips[0]
            .startMs
        ).toBe(
          0
        )

        const redone =
          undo.redo(
            undone,
            vi.fn()
          )!

        expect(
          redone.tracks
            .find(
              track =>
                track.id
                === video.id
            )!
            .clips[0]
            .startMs
        ).toBe(
          500
        )
      }
    )

    it(
      'supports normal caption editing',
      () => {
        const {
          child
        } =
          fixture()

        const edited =
          updateCaptionText(
            child,
            'caption-a',
            'Edited Short caption'
          )

        expect(
          edited.assets.find(
            asset =>
              asset.id
              === 'caption-a'
          )?.metadata.text
        ).toBe(
          'Edited Short caption'
        )
      }
    )

    it(
      'supports reviewed AI Editor changes with persistent history',
      () => {
        const {
          child
        } =
          fixture()

        const video =
          child.tracks.find(
            track =>
              track.type
              === 'video'
          )!

        const clip =
          video.clips[0]

        const storage =
          store()

        const history =
          new PersistentVersionHistory(
            storage.storage
          )

        const proposal = {
          schemaVersion:
            1,

          title:
            'Short polish',

          objective:
            'Add a restrained fade.',

          operations: [
            {
              id:
                'fade',

              reason:
                'Soften the opening.',

              edit: {
                type:
                  'set-clip-fades',

                trackId:
                  video.id,

                clipId:
                  clip.id,

                inMs:
                  200,

                outMs:
                  300
              }
            }
          ],

          provenance: {
            kind:
              'manual'
          }
        }

        const review =
          reviewAiEditorProposal(
            child,
            proposal
          )

        let persisted =
          child

        const applied =
          commitAiEditorReview(
            child,
            review,
            [
              'fade'
            ],
            history,
            next => {
              persisted =
                next
            }
          )

        expect(
          applied
        ).toBe(1)

        expect(
          persisted.tracks
            .find(
              track =>
                track.id
                === video.id
            )!
            .clips[0]
            .fades
        ).toEqual({
          inMs:
            200,

          outMs:
            300
        })

        expect(
          history.list(
            child.id
          )
        ).toHaveLength(1)

        expect(
          history.list(
            child.id
          )[0]
            .project
        ).toEqual(
          child
        )
      }
    )

    it(
      'creates a normal render plan containing video, audio and captions',
      () => {
        const {
          child
        } =
          fixture()

        const plan =
          createRenderPlan(
            child,
            preview1080pPreset,
            'KINAOU/Renders/editable-short.mp4'
          )

        expect(
          plan.durationMs
        ).toBe(
          20_000
        )

        expect(
          plan.clips.some(
            clip =>
              clip.trackType
              === 'video'
          )
        ).toBe(true)

        expect(
          plan.clips.some(
            clip =>
              clip.trackType
              === 'voice'
          )
        ).toBe(true)

        expect(
          plan.clips.some(
            clip =>
              clip.trackType
              === 'caption'
          )
        ).toBe(true)

        expect(
          plan.clips
            .every(
              clip =>
                clip.startMs
                + clip.durationMs
                <= 20_000
            )
        ).toBe(true)
      }
    )

    it(
      'saves source and derivative as independent library projects',
      () => {
        const {
          source,
          child
        } =
          fixture()

        const storage =
          store()

        const repository =
          new ProjectRepository(
            storage.storage
          )

        repository.save(
          source
        )

        repository.save(
          child
        )

        expect(
          repository.list()
            .map(
              project =>
                project.id
            )
            .sort()
        ).toEqual(
          [
            source.id,
            child.id
          ].sort()
        )

        const changedChild =
          applyTimelineOperation(
            child,
            {
              type:
                'set-track-state',

              trackId:
                child.tracks[0].id,

              muted:
                true
            }
          )

        repository.save(
          changedChild
        )

        expect(
          repository.load(
            source.id
          )
        ).toEqual(
          source
        )

        expect(
          repository.load(
            child.id
          )?.tracks[0]
            .muted
        ).toBe(true)
      }
    )

    it(
      'retains derivative provenance after ordinary edits',
      () => {
        const {
          child
        } =
          fixture()

        const before =
          structuredClone(
            child.metadata
              .shortDerivative
          )

        const next =
          applyTimelineOperation(
            child,
            {
              type:
                'set-track-state',

              trackId:
                child.tracks[0].id,

              locked:
                true
            }
          )

        expect(
          next.metadata
            .shortDerivative
        ).toEqual(
          before
        )

        expect(
          next.metadata
            .shortDerivativeMaterialization
        ).toEqual(
          child.metadata
            .shortDerivativeMaterialization
        )
      }
    )
  }
)
