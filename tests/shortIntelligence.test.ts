import {
  describe,
  expect,
  it
} from 'vitest'

import {
  setProjectContentProfile
} from '../src/core/contentProfile'

import {
  createProjectFromInput
} from '../src/core/create'

import {
  buildShortIntelligenceContext
} from '../src/core/shortIntelligence'


function fixture() {
  let project =
    createProjectFromInput({
      title:
        'Long interview',

      kind:
        'video',

      content:
        ''
    })

  project =
    setProjectContentProfile(
      project,
      {
        schemaVersion:
          1,

        sourceLanguage:
          'de',

        outputLanguage:
          'en',

        targetMarket:
          'WORLD',

        audience:
          'Museum visitors',

        objective:
          'Create a concise explanatory Short',

        tone:
          'Clear and thoughtful'
      }
    )

  project.assets.push(
    {
      id:
        'video-source',

      kind:
        'video',

      uri:
        'KINAOU/Assets/interview.mp4',

      managed:
        true,

      offline:
        false,

      metadata: {
        name:
          'Interview',

        durationMs:
          20_000
      }
    },

    {
      id:
        'transcript',

      kind:
        'document',

      uri:
        'KINAOU/Projects/Transcripts/interview.json',

      managed:
        true,

      offline:
        false,

      metadata: {
        name:
          'Interview transcript',

        sourceAssetId:
          'video-source',

        transcript: {
          schemaVersion:
            1,

          adapterId:
            'whisper.cpp',

          language:
            'de',

          text:
            'Erster Gedanke. Zweiter Gedanke.',

          segments: [
            {
              startMs:
                3000,

              endMs:
                5000,

              text:
                'Erster Gedanke.'
            },

            {
              startMs:
                7000,

              endMs:
                9000,

              text:
                'Zweiter Gedanke.'
            }
          ]
        }
      }
    }
  )

  project.storyboard = [
    {
      id:
        'scene-a',

      title:
        'Argument',

      description:
        'The speaker introduces the central argument.',

      narration:
        'A concise argument.',

      durationMs:
        5000
    }
  ]

  const videoTrack =
    project.tracks.find(
      track =>
        track.type === 'video'
    )!

  videoTrack.clips.push({
    id:
      'clip-a',

    assetId:
      'video-source',

    startMs:
      10_000,

    durationMs:
      5000,

    sourceOffsetMs:
      2000,

    gain:
      1,

    speed:
      2,

    sceneId:
      'scene-a'
  })

  return project
}


describe(
  'Short intelligence evidence context',
  () => {
    it(
      'projects transcript source time through trim and speed onto the real timeline',
      () => {
        const context =
          buildShortIntelligenceContext(
            fixture()
          )

        expect(
          context.evidence
            .transcriptSegments
            .map(
              segment => ({
                text:
                  segment.text,

                sourceStart:
                  segment.sourceStartMs,

                sourceEnd:
                  segment.sourceEndMs,

                start:
                  segment.startMs,

                end:
                  segment.endMs
              })
            )
        ).toEqual([
          {
            text:
              'Erster Gedanke.',

            sourceStart:
              3000,

            sourceEnd:
              5000,

            start:
              10_500,

            end:
              11_500
          },

          {
            text:
              'Zweiter Gedanke.',

            sourceStart:
              7000,

            sourceEnd:
              9000,

            start:
              12_500,

            end:
              13_500
          }
        ])
      }
    )

    it(
      'maps storyboard evidence to its actual active visual range',
      () => {
        const context =
          buildShortIntelligenceContext(
            fixture()
          )

        expect(
          context.evidence
            .scenes[0]
        ).toMatchObject({
          sceneId:
            'scene-a',

          anchored:
            true,

          inMs:
            10_000,

          outMs:
            15_000
        })

        expect(
          context.readiness
            .anchoredSceneCount
        ).toBe(1)
      }
    )

    it(
      'carries the production profile without leaking managed file paths',
      () => {
        const context =
          buildShortIntelligenceContext(
            fixture()
          )

        expect(
          context.target
        ).toMatchObject({
          sourceLanguage:
            'de',

          outputLanguage:
            'en',

          targetMarket:
            'WORLD',

          audience:
            'Museum visitors'
        })

        const serialized =
          JSON.stringify(
            context
          )

        expect(
          serialized
        ).not.toContain(
          'KINAOU/Assets/'
        )

        expect(
          serialized
        ).not.toContain(
          'KINAOU/Projects/Transcripts/'
        )
      }
    )

    it(
      'remains usable with storyboard-only evidence but reports the missing transcript',
      () => {
        const project =
          fixture()

        project.assets =
          project.assets.filter(
            asset =>
              asset.id
              !== 'transcript'
          )

        const context =
          buildShortIntelligenceContext(
            project
          )

        expect(
          context.readiness
            .ready
        ).toBe(true)

        expect(
          context.readiness
            .issues
        ).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              severity:
                'warning',

              code:
                'transcript-missing'
            })
          ])
        )
      }
    )

    it(
      'warns instead of inventing evidence for an unanchored storyboard scene',
      () => {
        const project =
          fixture()

        project.storyboard.push({
          id:
            'scene-b',

          title:
            'Unused',

          description:
            'Not on the timeline',

          durationMs:
            4000
        })

        const context =
          buildShortIntelligenceContext(
            project
          )

        expect(
          context.readiness
            .issues
        ).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              code:
                'scene-unanchored',

              sceneId:
                'scene-b'
            })
          ])
        )
      }
    )

    it(
      'blocks intelligence when there is no active timeline or usable content evidence',
      () => {
        const project =
          createProjectFromInput({
            title:
              'Empty',

            kind:
              'idea',

            content:
              ''
          })

        const context =
          buildShortIntelligenceContext(
            project
          )

        expect(
          context.readiness
            .ready
        ).toBe(false)

        expect(
          context.readiness
            .issues
            .map(
              issue =>
                issue.code
            )
        ).toEqual(
          expect.arrayContaining([
            'timeline-empty',
            'content-evidence-missing'
          ])
        )
      }
    )

    it(
      'keeps selection review-only and never represents trend or virality knowledge',
      () => {
        const context =
          buildShortIntelligenceContext(
            fixture()
          )

        expect(
          context.policy
        ).toEqual({
          reviewOnly:
            true,

          noAutomaticExport:
            true,

          noViralityGuarantee:
            true,

          noTrendClaimWithoutEvidence:
            true
        })
      }
    )
  }
)
