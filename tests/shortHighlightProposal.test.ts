import {
  describe,
  expect,
  it
} from 'vitest'

import {
  parseShortHighlightProposal
} from '../src/core/shortHighlightProposal'

import type {
  ShortIntelligenceContext
} from '../src/core/shortIntelligence'


function context():
  ShortIntelligenceContext {
  return {
    schemaVersion:
      1,

    project: {
      id:
        'project',
      title:
        'Interview',
      timelineDurationMs:
        120_000
    },

    target: {
      maximumDurationMs:
        60_000,

      sourceLanguage:
        'de',

      outputLanguage:
        'en',

      targetMarket:
        'WORLD',

      audience:
        'Museum visitors',

      objective:
        'Explain the main idea',

      tone:
        'Clear'
    },

    evidence: {
      scenes: [
        {
          sceneId:
            'scene-hook',

          title:
            'Opening',

          description:
            'A strong opening claim.',

          durationMs:
            20_000,

          anchored:
            true,

          inMs:
            10_000,

          outMs:
            30_000
        },

        {
          sceneId:
            'scene-proof',

          title:
            'Proof',

          description:
            'Supporting evidence.',

          durationMs:
            20_000,

          anchored:
            true,

          inMs:
            40_000,

          outMs:
            60_000
        }
      ],

      transcriptSegments: [
        {
          id:
            'transcript:clip:0',

          transcriptAssetId:
            'transcript',

          sourceAssetId:
            'source',

          sourceAssetName:
            'Interview',

          trackId:
            'voice',

          trackName:
            'Voice',

          clipId:
            'clip',

          sceneId:
            'scene-hook',

          sourceStartMs:
            0,

          sourceEndMs:
            5000,

          startMs:
            12_000,

          endMs:
            17_000,

          text:
            'This is the central claim.',

          language:
            'de'
        },

        {
          id:
            'transcript:clip:1',

          transcriptAssetId:
            'transcript',

          sourceAssetId:
            'source',

          sourceAssetName:
            'Interview',

          trackId:
            'voice',

          trackName:
            'Voice',

          clipId:
            'clip',

          sceneId:
            'scene-proof',

          sourceStartMs:
            5000,

          sourceEndMs:
            10_000,

          startMs:
            43_000,

          endMs:
            48_000,

          text:
            'Here is the evidence.',

          language:
            'de'
        }
      ],

      existingSceneCandidates: []
    },

    readiness: {
      ready:
        true,

      anchoredSceneCount:
        2,

      transcriptSegmentCount:
        2,

      issues: []
    },

    policy: {
      reviewOnly:
        true,

      noAutomaticExport:
        true,

      noViralityGuarantee:
        true,

      noTrendClaimWithoutEvidence:
        true
    }
  }
}


function validProposal() {
  return {
    schemaVersion:
      1,

    title:
      'Short options',

    objective:
      'Find concise evidence-grounded excerpts',

    candidates: [
      {
        id:
          'hook',

        hook:
          'The central claim',

        rationale:
          'The opening contains a self-contained claim.',

        inMs:
          10_000,

        outMs:
          30_000,

        order:
          1,

        evidence: [
          {
            kind:
              'scene',
            id:
              'scene-hook'
          },

          {
            kind:
              'transcript',
            id:
              'transcript:clip:0'
          }
        ]
      },

      {
        id:
          'proof',

        hook:
          'The evidence',

        rationale:
          'The second excerpt supports the claim with concrete evidence.',

        inMs:
          40_000,

        outMs:
          60_000,

        order:
          2,

        evidence: [
          {
            kind:
              'scene',
            id:
              'scene-proof'
          },

          {
            kind:
              'transcript',
            id:
              'transcript:clip:1'
          }
        ]
      }
    ],

    provenance: {
      kind:
        'local-model',

      adapterId:
        'ollama',

      modelId:
        'qwen:7b'
    }
  }
}


describe(
  'Short highlight proposal',
  () => {
    it(
      'accepts exact timeline ranges with real supporting evidence',
      () => {
        const proposal =
          parseShortHighlightProposal(
            validProposal(),
            context()
          )

        expect(
          proposal.candidates
            .map(
              candidate =>
                candidate.id
            )
        ).toEqual([
          'hook',
          'proof'
        ])

        expect(
          proposal.provenance
        ).toEqual({
          kind:
            'local-model',
          adapterId:
            'ollama',
          modelId:
            'qwen:7b'
        })
      }
    )

    it(
      'normalizes candidates into their explicit editorial order',
      () => {
        const input =
          validProposal()

        input.candidates =
          [
            input.candidates[1],
            input.candidates[0]
          ]

        const proposal =
          parseShortHighlightProposal(
            input,
            context()
          )

        expect(
          proposal.candidates
            .map(
              candidate =>
                candidate.order
            )
        ).toEqual([
          1,
          2
        ])
      }
    )

    it(
      'rejects invented evidence IDs',
      () => {
        const input =
          validProposal()

        input.candidates[0]
          .evidence[1]
          .id =
            'made-up'

        expect(
          () =>
            parseShortHighlightProposal(
              input,
              context()
            )
        ).toThrow(
          /unknown transcript evidence/i
        )
      }
    )

    it(
      'rejects evidence that does not overlap the proposed range',
      () => {
        const input =
          validProposal()

        input.candidates[0]
          .evidence = [
            {
              kind:
                'scene',
              id:
                'scene-proof'
            }
          ]

        expect(
          () =>
            parseShortHighlightProposal(
              input,
              context()
            )
        ).toThrow(
          /outside its proposed range/i
        )
      }
    )

    it(
      'rejects ranges beyond the configured Short maximum or active timeline',
      () => {
        const tooLong =
          validProposal()

        tooLong.candidates[0]
          .outMs =
            80_000

        expect(
          () =>
            parseShortHighlightProposal(
              tooLong,
              context()
            )
        ).toThrow(
          /configured Short duration/i
        )

        const outside =
          validProposal()

        outside.candidates[1]
          .inMs =
            110_000

        outside.candidates[1]
          .outMs =
            121_000

        expect(
          () =>
            parseShortHighlightProposal(
              outside,
              context()
            )
        ).toThrow(
          /active timeline/i
        )
      }
    )

    it(
      'requires contiguous unique editorial ordering',
      () => {
        const input =
          validProposal()

        input.candidates[1]
          .order =
            3

        expect(
          () =>
            parseShortHighlightProposal(
              input,
              context()
            )
        ).toThrow(
          /contiguous/i
        )
      }
    )

    it(
      'refuses generation against an unready evidence context',
      () => {
        const inputContext =
          context()

        inputContext.readiness
          .ready =
            false

        expect(
          () =>
            parseShortHighlightProposal(
              validProposal(),
              inputContext
            )
        ).toThrow(
          /not ready/i
        )
      }
    )
  }
)
