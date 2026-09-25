import {
  describe,
  expect,
  it
} from 'vitest'

import {
  createProjectFromInput
} from '../src/core/create'

import {
  buildShortCutPlan
} from '../src/core/shortCutPlan'

import {
  createShortDerivativeDraft,
  projectShortDerivativeLineage
} from '../src/core/shortDerivative'

import {
  materializeShortDerivative,
  projectShortDerivativeMaterialization
} from '../src/core/shortDerivativeMaterialize'

import {
  buildShortIntelligenceContext
} from '../src/core/shortIntelligence'


function ids() {
  let counter =
    0

  return () =>
    `child-id-${++counter}`
}


function fixture() {
  const source =
    createProjectFromInput(
      {
        title:
          'Materialization source',

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
        'KINAOU/Assets/video.mp4',

      managed:
        true,

      offline:
        false,

      metadata: {
        name:
          'Video',

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
        'KINAOU/Assets/audio.wav',

      managed:
        true,

      offline:
        false,

      metadata: {
        name:
          'Audio',

        durationMs:
          120_000
      }
    },

    {
      id:
        'caption-opening',

      kind:
        'caption',

      uri:
        'kinaou://caption/caption-opening',

      managed:
        true,

      offline:
        false,

      metadata: {
        name:
          'Opening caption',

        text:
          'Opening caption'
      }
    },

    {
      id:
        'caption-proof',

      kind:
        'caption',

      uri:
        'kinaou://caption/caption-proof',

      managed:
        true,

      offline:
        false,

      metadata: {
        name:
          'Proof caption',

        text:
          'Proof caption'
      }
    },

    {
      id:
        'unused-image',

      kind:
        'image',

      uri:
        'KINAOU/Assets/unused.png',

      managed:
        true,

      offline:
        false,

      metadata: {
        name:
          'Must not be copied'
      }
    }
  )

  source.storyboard = [
    {
      id:
        'scene-opening',

      title:
        'Opening',

      description:
        'Opening',

      durationMs:
        30_000
    },

    {
      id:
        'scene-proof',

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
        'video-opening',

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
        'scene-opening',

      fades: {
        inMs:
          300,
        outMs:
          400
      }
    },

    {
      id:
        'video-proof',

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
        'scene-proof',

      transform: {
        x:
          10,

        y:
          -5,

        scale:
          1.1,

        cropLeft:
          0,

        cropTop:
          0,

        cropRight:
          0,

        cropBottom:
          0
      }
    }
  )

  voice.clips.push({
    id:
      'voice-source',

    assetId:
      'audio',

    startMs:
      0,

    durationMs:
      90_000,

    sourceOffsetMs:
      0,

    gain:
      0.8,

    speed:
      1
  })

  captions.clips.push(
    {
      id:
        'caption-opening-clip',

      assetId:
        'caption-opening',

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
    },

    {
      id:
        'caption-proof-clip',

      assetId:
        'caption-proof',

      startMs:
        67_000,

      durationMs:
        5000,

      sourceOffsetMs:
        0,

      gain:
        1,

      speed:
        1
    }
  )

  const context =
    buildShortIntelligenceContext(
      source,
      30_000
    )

  const proposal = {
    schemaVersion:
      1,

    title:
      'Materialized Short',

    objective:
      'Proof first, context second.',

    candidates: [
      {
        id:
          'opening',

        hook:
          'Context',

        rationale:
          'Opening context.',

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
              'scene-opening'
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
              'scene-proof'
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
        'opening'
      ]
    )

  const draft =
    createShortDerivativeDraft(
      source,
      cut,
      new Date(
        '2026-09-25T19:00:00.000Z'
      ),
      'child-project'
    )

  return {
    source,
    cut,
    draft
  }
}


describe(
  'Short derivative timeline materialization',
  () => {
    it(
      'materializes the reviewed compact composition without changing the source',
      () => {
        const {
          source,
          cut,
          draft
        } =
          fixture()

        const original =
          structuredClone(
            source
          )

        const child =
          materializeShortDerivative(
            source,
            draft,
            cut,
            new Date(
              '2026-09-25T19:10:00.000Z'
            ),
            ids()
          )

        expect(
          source
        ).toEqual(
          original
        )

        expect(
          child.id
        ).toBe(
          'child-project'
        )

        expect(
          child.updatedAt
        ).toBe(
          '2026-09-25T19:10:00.000Z'
        )

        expect(
          child.tracks
        ).toHaveLength(
          source.tracks.length
        )

        expect(
          child.tracks.every(
            track =>
              !track.locked
              && !track.muted
          )
        ).toBe(true)

        expect(
          child.tracks.map(
            track =>
              track.id
          )
        ).not.toEqual(
          source.tracks.map(
            track =>
              track.id
          )
        )
      }
    )

    it(
      'copies only referenced assets while sharing the managed media URIs',
      () => {
        const {
          source,
          cut,
          draft
        } =
          fixture()

        const child =
          materializeShortDerivative(
            source,
            draft,
            cut,
            new Date(
              '2026-09-25T19:10:00.000Z'
            ),
            ids()
          )

        expect(
          child.assets.map(
            asset =>
              asset.id
          )
        ).toEqual([
          'video',
          'audio',
          'caption-opening',
          'caption-proof'
        ])

        expect(
          child.assets.find(
            asset =>
              asset.id
              === 'video'
          )?.uri
        ).toBe(
          'KINAOU/Assets/video.mp4'
        )

        expect(
          child.assets.some(
            asset =>
              asset.id
              === 'unused-image'
          )
        ).toBe(false)
      }
    )

    it(
      'creates new clip identities with compact synchronized source offsets',
      () => {
        const {
          source,
          cut,
          draft
        } =
          fixture()

        const child =
          materializeShortDerivative(
            source,
            draft,
            cut,
            new Date(
              '2026-09-25T19:10:00.000Z'
            ),
            ids()
          )

        const video =
          child.tracks.find(
            track =>
              track.type
              === 'video'
          )!

        expect(
          video.clips.map(
            clip => ({
              start:
                clip.startMs,

              duration:
                clip.durationMs,

              offset:
                clip.sourceOffsetMs,

              scene:
                clip.sceneId
            })
          )
        ).toEqual([
          {
            start:
              0,

            duration:
              10_000,

            offset:
              65_000,

            scene:
              'short-segment-001'
          },

          {
            start:
              10_000,

            duration:
              10_000,

            offset:
              10_000,

            scene:
              'short-segment-002'
          }
        ])

        const sourceClipIds =
          new Set(
            source.tracks.flatMap(
              track =>
                track.clips.map(
                  clip =>
                    clip.id
                )
            )
          )

        expect(
          child.tracks
            .flatMap(
              track =>
                track.clips
            )
            .every(
              clip =>
                !sourceClipIds.has(
                  clip.id
                )
            )
        ).toBe(true)

        const voice =
          child.tracks.find(
            track =>
              track.type
              === 'voice'
          )!

        expect(
          voice.clips.map(
            clip => ({
              start:
                clip.startMs,

              duration:
                clip.durationMs,

              offset:
                clip.sourceOffsetMs,

              gain:
                clip.gain
            })
          )
        ).toEqual([
          {
            start:
              0,

            duration:
              10_000,

            offset:
              65_000,

            gain:
              0.8
          },

          {
            start:
              10_000,

            duration:
              10_000,

            offset:
              10_000,

            gain:
              0.8
          }
        ])
      }
    )

    it(
      'preserves caption timing and assigns each materialized clip to the child storyboard segment',
      () => {
        const {
          source,
          cut,
          draft
        } =
          fixture()

        const child =
          materializeShortDerivative(
            source,
            draft,
            cut,
            new Date(
              '2026-09-25T19:10:00.000Z'
            ),
            ids()
          )

        const captions =
          child.tracks.find(
            track =>
              track.type
              === 'caption'
          )!

        expect(
          captions.clips.map(
            clip => ({
              asset:
                clip.assetId,

              start:
                clip.startMs,

              duration:
                clip.durationMs,

              scene:
                clip.sceneId
            })
          )
        ).toEqual([
          {
            asset:
              'caption-proof',

            start:
              2000,

            duration:
              5000,

            scene:
              'short-segment-001'
          },

          {
            asset:
              'caption-opening',

            start:
              12_000,

            duration:
              5000,

            scene:
              'short-segment-002'
          }
        ])

        expect(
          child.storyboard.map(
            scene => ({
              id:
                scene.id,

              assetId:
                scene.assetId
            })
          )
        ).toEqual([
          {
            id:
              'short-segment-001',

            assetId:
              'video'
          },

          {
            id:
              'short-segment-002',

            assetId:
              'video'
          }
        ])
      }
    )

    it(
      'records reversible source-to-child track and clip provenance',
      () => {
        const {
          source,
          cut,
          draft
        } =
          fixture()

        const child =
          materializeShortDerivative(
            source,
            draft,
            cut,
            new Date(
              '2026-09-25T19:10:00.000Z'
            ),
            ids()
          )

        const lineage =
          projectShortDerivativeLineage(
            child
          )

        const materialization =
          projectShortDerivativeMaterialization(
            child
          )

        expect(
          lineage?.materializedAt
        ).toBe(
          '2026-09-25T19:10:00.000Z'
        )

        expect(
          materialization
        ).not.toBeNull()

        expect(
          materialization
            ?.sourceProjectId
        ).toBe(
          source.id
        )

        expect(
          materialization
            ?.derivativeProjectId
        ).toBe(
          child.id
        )

        expect(
          materialization
            ?.tracks
        ).toHaveLength(
          source.tracks.length
        )

        expect(
          materialization
            ?.clips.length
        ).toBe(
          child.tracks.flatMap(
            track =>
              track.clips
          ).length
        )

        expect(
          materialization
            ?.clips
            .map(
              item =>
                item.segmentPosition
            )
        ).toEqual([
          1,
          1,
          1,
          2,
          2,
          2
        ])
      }
    )

    it(
      'preserves trimmed visual edit semantics from the reviewed virtual cut',
      () => {
        const {
          source,
          cut,
          draft
        } =
          fixture()

        const child =
          materializeShortDerivative(
            source,
            draft,
            cut,
            new Date(
              '2026-09-25T19:10:00.000Z'
            ),
            ids()
          )

        const video =
          child.tracks.find(
            track =>
              track.type
              === 'video'
          )!

        expect(
          video.clips[0]
            .transform
        ).toMatchObject({
          x:
            10,

          y:
            -5,

          scale:
            1.1
        })

        /*
         * Both selected video ranges begin inside their original source clips.
         * The existing range renderer therefore correctly clears edge fades.
         */
        expect(
          video.clips[0]
            .fades
        ).toEqual({
          inMs:
            0,

          outMs:
            0
        })

        expect(
          video.clips[1]
            .fades
        ).toEqual({
          inMs:
            0,

          outMs:
            0
        })
      }
    )

    it(
      'refuses stale or already materialized derivatives',
      () => {
        const {
          source,
          cut,
          draft
        } =
          fixture()

        const child =
          materializeShortDerivative(
            source,
            draft,
            cut,
            new Date(
              '2026-09-25T19:10:00.000Z'
            ),
            ids()
          )

        expect(
          () =>
            materializeShortDerivative(
              source,
              child,
              cut,
              new Date(
                '2026-09-25T19:11:00.000Z'
              ),
              ids()
            )
        ).toThrow(
          /already materialized/i
        )

        const changed =
          structuredClone(
            source
          )

        changed.updatedAt =
          '2026-09-25T20:00:00.000Z'

        expect(
          () =>
            materializeShortDerivative(
              changed,
              draft,
              cut,
              new Date(
                '2026-09-25T20:01:00.000Z'
              ),
              ids()
            )
        ).toThrow(
          /changed after Short review/i
        )
      }
    )

    it(
      'refuses generated track or clip ids that collide with source identities',
      () => {
        const {
          source,
          cut,
          draft
        } =
          fixture()

        expect(
          () =>
            materializeShortDerivative(
              source,
              draft,
              cut,
              new Date(
                '2026-09-25T19:10:00.000Z'
              ),
              () =>
                source.tracks[0].id
            )
        ).toThrow(
          /collides/i
        )
      }
    )
  }
)
