import {
  describe,
  expect,
  it
} from 'vitest'

import {
  createProjectFromInput
} from '../src/core/create'

import {
  projectFormatReframing,
  projectTargetFormat,
  setProjectFormatReframing
} from '../src/core/render'

import {
  buildShortCutPlan
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


function ids() {
  let value =
    0

  return () =>
    `generated-${++value}`
}


function fixture() {
  let source =
    createProjectFromInput(
      {
        title:
          'Make this Short',

        kind:
          'video',

        content:
          ''
      },
      new Date(
        '2026-09-25T18:00:00.000Z'
      )
    )

  source.assets.push({
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
        'Source',

      durationMs:
        60_000
    }
  })

  source.storyboard = [
    {
      id:
        'scene',

      title:
        'Scene',

      description:
        'Reviewed scene',

      durationMs:
        30_000
    }
  ]

  source.tracks
    .find(
      track =>
        track.type
        === 'video'
    )!
    .clips.push({
      id:
        'clip',

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
        'scene'
    })

  source =
    setProjectFormatReframing(
      source,
      'vertical',
      {
        fit:
          'cover',

        focusX:
          0.25,

        focusY:
          0.7
      },
      new Date(
        '2026-09-25T18:01:00.000Z'
      )
    )

  const context =
    buildShortIntelligenceContext(
      source,
      20_000
    )

  const proposal = {
    schemaVersion:
      1,

    title:
      'Reviewed cut',

    objective:
      'Create the selected edit.',

    candidates: [
      {
        id:
          'selected',

        hook:
          'Selected moment',

        rationale:
          'Explicitly reviewed by the user.',

        inMs:
          5000,

        outMs:
          15_000,

        order:
          1,

        evidence: [
          {
            kind:
              'scene',
            id:
              'scene'
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
        'selected'
      ]
    )

  return {
    source,
    cut
  }
}


describe(
  'reviewed Short creation',
  () => {
    it(
      'creates a fully materialized independent project from the reviewed cut',
      () => {
        const {
          source,
          cut
        } =
          fixture()

        const original =
          structuredClone(
            source
          )

        const child =
          createMaterializedShortDerivative(
            source,
            cut,
            'vertical',
            new Date(
              '2026-09-25T19:00:00.000Z'
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
          )?.materializedAt
        ).toBe(
          '2026-09-25T19:00:00.000Z'
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
      'keeps the reviewed output format and exact reframing in the child',
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
              '2026-09-25T19:00:00.000Z'
            ),
            'short-child',
            ids()
          )

        expect(
          projectTargetFormat(
            child
          )
        ).toBe(
          'vertical'
        )

        expect(
          projectFormatReframing(
            child,
            'vertical'
          )
        ).toEqual(
          projectFormatReframing(
            source,
            'vertical'
          )
        )
      }
    )

    it(
      'shares managed media references instead of duplicating source files',
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
              '2026-09-25T19:00:00.000Z'
            ),
            'short-child',
            ids()
          )

        expect(
          child.assets
            .find(
              asset =>
                asset.id
                === 'video'
            )?.uri
        ).toBe(
          'KINAOU/Assets/source.mp4'
        )

        expect(
          source.assets
            .find(
              asset =>
                asset.id
                === 'video'
            )?.uri
        ).toBe(
          child.assets
            .find(
              asset =>
                asset.id
                === 'video'
            )?.uri
        )
      }
    )

    it(
      'changes preview authorization identity when source revision, format or cut changes',
      () => {
        const {
          source,
          cut
        } =
          fixture()

        const original =
          reviewedShortCutKey(
            source,
            cut,
            'vertical'
          )

        expect(
          reviewedShortCutKey(
            source,
            cut,
            'square'
          )
        ).not.toBe(
          original
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
          original
        )

        expect(
          reviewedShortCutKey(
            source,
            {
              ...cut,

              title:
                'Another cut'
            },
            'vertical'
          )
        ).not.toBe(
          original
        )
      }
    )
  }
)
