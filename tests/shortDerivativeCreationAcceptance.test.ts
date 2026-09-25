import {
  describe,
  expect,
  it,
  vi
} from 'vitest'

import {
  createProjectFromInput
} from '../src/core/create'

import {
  ProjectRepository
} from '../src/core/persistence'

import {
  createRenderPlan,
  formatProfiles
} from '../src/core/render'

import {
  buildShortCutPlan,
  createShortCutRenderPlan
} from '../src/core/shortCutPlan'

import {
  createMaterializedShortDerivative,
  reviewedShortCutKey
} from '../src/core/shortDerivativeCreate'

import {
  projectShortDerivativeLineage
} from '../src/core/shortDerivative'

import {
  projectShortDerivativeMaterialization
} from '../src/core/shortDerivativeMaterialize'

import {
  buildShortIntelligenceContext
} from '../src/core/shortIntelligence'

import {
  ShortPreviewSession
} from '../src/core/shortPreviewSession'

import {
  applyTimelineOperation
} from '../src/core/timeline'

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


function ids() {
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
          'Long source',

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
          'Long source',

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
          'Long source audio',

        durationMs:
          120_000
      }
    }
  )

  source.storyboard = [
    {
      id:
        'scene-a',

      title:
        'Context',

      description:
        'Context',

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

  const context =
    buildShortIntelligenceContext(
      source,
      30_000
    )

  const proposal = {
    schemaVersion:
      1,

    title:
      'Proof-led Short',

    objective:
      'Lead with proof, then give context.',

    candidates: [
      {
        id:
          'context',

        hook:
          'Context',

        rationale:
          'Sets up the point.',

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
          'Strongest moment first.',

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

  return {
    source,
    cut
  }
}


describe(
  'reviewed Short → independent editable project acceptance',
  () => {
    it(
      'requires the exact reviewed state, creates a child project and leaves the source untouched',
      async () => {
        const {
          source,
          cut
        } =
          fixture()

        const original =
          structuredClone(
            source
          )

        const format =
          'vertical' as const

        const reviewKey =
          reviewedShortCutKey(
            source,
            cut,
            format
          )

        /*
         * Preview exactly the same composition the creation action
         * will later materialize.
         */
        const previewPlan =
          createShortCutRenderPlan(
            source,
            cut,
            formatProfiles.vertical
              .preview,
            'KINAOU/Cache/Previews/reviewed-short.mp4'
          )

        let acceptedPreviewKey =
          ''

        const acceptedBlobs:
          Blob[] = []

        const session =
          new ShortPreviewSession(
            previewPlan,
            {
              client: {
                startRender:
                  vi.fn(
                    async () => ({
                      id:
                        'preview-job',

                      state:
                        'queued' as const,

                      progress:
                        0,

                      createdAt:
                        '2026-09-25T18:10:00.000Z',

                      updatedAt:
                        '2026-09-25T18:10:00.000Z',

                      outputPath:
                        previewPlan
                          .outputRelativePath
                    })
                  ),

                renderStatus:
                  vi.fn(
                    async () => ({
                      id:
                        'preview-job',

                      state:
                        'succeeded' as const,

                      progress:
                        1,

                      createdAt:
                        '2026-09-25T18:10:00.000Z',

                      updatedAt:
                        '2026-09-25T18:10:01.000Z',

                      outputPath:
                        previewPlan
                          .outputRelativePath,

                      durationMs:
                        cut.durationMs,

                      sizeBytes:
                        4
                    })
                  ),

                cancelRender:
                  vi.fn(
                    async () => ({
                      id:
                        'preview-job',

                      state:
                        'cancelled' as const,

                      progress:
                        0,

                      createdAt:
                        '2026-09-25T18:10:00.000Z',

                      updatedAt:
                        '2026-09-25T18:10:01.000Z'
                    })
                  ),

                loadTimelinePreview:
                  vi.fn(
                    async () =>
                      new Blob(
                        [
                          new Uint8Array([
                            1,
                            2,
                            3,
                            4
                          ])
                        ],
                        {
                          type:
                            'video/mp4'
                        }
                      )
                  )
              },

              publish:
                feedback => {
                  if (
                    feedback.phase
                    === 'ready'
                  ) {
                    acceptedPreviewKey =
                      reviewKey
                  }
                },

              accept:
                blob => {
                  acceptedBlobs.push(
                    blob
                  )
                },

              wait:
                async () => {}
            }
          )

        expect(
          acceptedPreviewKey
        ).toBe(
          ''
        )

        await session.run()

        expect(
          acceptedBlobs
        ).toHaveLength(1)

        expect(
          acceptedPreviewKey
        ).toBe(
          reviewKey
        )

        /*
         * The explicit create action is valid only while the reviewed
         * source/cut/format identity still matches.
         */
        expect(
          reviewedShortCutKey(
            source,
            cut,
            format
          )
        ).toBe(
          acceptedPreviewKey
        )

        const child =
          createMaterializedShortDerivative(
            source,
            cut,
            format,
            new Date(
              '2026-09-25T18:11:00.000Z'
            ),
            'short-child',
            ids()
          )

        expect(
          child.id
        ).toBe(
          'short-child'
        )

        expect(
          child.id
        ).not.toBe(
          source.id
        )

        expect(
          child.tracks
            .flatMap(
              track =>
                track.clips
            ).length
        ).toBeGreaterThan(0)

        expect(
          projectShortDerivativeLineage(
            child
          )?.sourceProjectId
        ).toBe(
          source.id
        )

        expect(
          projectShortDerivativeMaterialization(
            child
          )
        ).not.toBeNull()

        expect(
          source
        ).toEqual(
          original
        )
      }
    )

    it(
      'stores source and Short independently and the child immediately supports normal editing and rendering',
      () => {
        const {
          source,
          cut
        } =
          fixture()

        const child =
          createMaterializedShortDerivative(
            source,
            cut,
            'vertical',
            new Date(
              '2026-09-25T18:11:00.000Z'
            ),
            'short-child',
            ids()
          )

        const storage =
          memoryStore()

        const repository =
          new ProjectRepository(
            storage
          )

        const history =
          new PersistentVersionHistory(
            storage
          )

        repository.save(
          source
        )

        repository.save(
          child
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
          )
        ).toEqual(
          child
        )

        /*
         * A normal user timeline edit on the Short.
         */
        const video =
          child.tracks.find(
            track =>
              track.type
              === 'video'
          )!

        const clip =
          video.clips[0]

        history.snapshot(
          child,
          'Before Short edit',
          'user'
        )

        const edited =
          applyTimelineOperation(
            child,
            {
              type:
                'set-clip-gain',

              trackId:
                video.id,

              clipId:
                clip.id,

              gain:
                0.75
            }
          )

        repository.save(
          edited
        )

        expect(
          repository.load(
            child.id
          )?.tracks
            .find(
              track =>
                track.id
                === video.id
            )!
            .clips[0]
            .gain
        ).toBe(
          0.75
        )

        expect(
          repository.load(
            source.id
          )
        ).toEqual(
          source
        )

        expect(
          history.list(
            child.id
          )
        ).toHaveLength(1)

        /*
         * And it uses the ordinary renderer, not a Short-only renderer.
         */
        const render =
          createRenderPlan(
            edited,
            formatProfiles.vertical
              .preview,
            'KINAOU/Cache/Previews/editable-created-short.mp4'
          )

        expect(
          render.durationMs
        ).toBe(
          cut.durationMs
        )

        expect(
          render.clips.some(
            item =>
              item.trackType
              === 'video'
          )
        ).toBe(true)

        expect(
          render.clips.some(
            item =>
              item.trackType
              === 'voice'
          )
        ).toBe(true)
      }
    )

    it(
      'invalidates creation authorization after source, cut or format changes',
      () => {
        const {
          source,
          cut
        } =
          fixture()

        const accepted =
          reviewedShortCutKey(
            source,
            cut,
            'vertical'
          )

        expect(
          reviewedShortCutKey(
            {
              ...source,

              updatedAt:
                '2026-09-25T22:00:00.000Z'
            },
            cut,
            'vertical'
          )
        ).not.toBe(
          accepted
        )

        expect(
          reviewedShortCutKey(
            source,
            {
              ...cut,

              selectedCandidateIds: [
                ...cut
                  .selectedCandidateIds
              ].reverse(),

              segments: [
                ...cut.segments
              ].reverse()
            },
            'vertical'
          )
        ).not.toBe(
          accepted
        )

        expect(
          reviewedShortCutKey(
            source,
            cut,
            'square'
          )
        ).not.toBe(
          accepted
        )
      }
    )
  }
)
