import {
  describe,
  expect,
  it
} from 'vitest'

import {
  applyDirectorPlan
} from '../src/core/director'

import {
  buildDirectorExecutionContext,
  directorEditorInstruction,
  directorExecutionReadiness
} from '../src/core/directorExecution'

import {
  buildAiEditorContext
} from '../src/core/aiEditor'

import {
  createProjectFromInput
} from '../src/core/create'


function fixture() {
  const base =
    createProjectFromInput(
      {
        title:
          'Director execution',
        kind:
          'idea',
        content:
          ''
      },
      new Date(
        '2026-09-25T00:00:00.000Z'
      )
    )

  const plan = {
    schemaVersion:
      1 as const,

    title:
      'Museum short',

    objective:
      'Create a concise two-scene film',

    script:
      'Opening. Detail.',

    scenes: [
      {
        id:
          'scene-a',

        title:
          'Opening',

        description:
          'Wide establishing image',

        durationMs:
          3000,

        narration:
          'Opening.',

        visualBrief:
          'Wide view',

        requiredMedia: [
          'image' as const
        ]
      },
      {
        id:
          'scene-b',

        title:
          'Detail',

        description:
          'Closer detail',

        durationMs:
          2000,

        narration:
          'Detail.',

        visualBrief:
          'Close detail',

        requiredMedia: [
          'image' as const
        ]
      }
    ],

    provenance: {
      kind:
        'manual' as const
    }
  }

  const applied =
    applyDirectorPlan(
      base,
      plan,
      new Date(
        '2026-09-25T00:01:00.000Z'
      )
    )

  const project = {
    ...applied,

    assets: [
      ...applied.assets,
      {
        id:
          'image-a',

        kind:
          'image' as const,

        uri:
          'KINAOU/Assets/a.png',

        managed:
          true,

        offline:
          false,

        metadata: {
          name:
            'Opening image'
        }
      },
      {
        id:
          'image-b',

        kind:
          'image' as const,

        uri:
          'KINAOU/Assets/b.png',

        managed:
          true,

        offline:
          false,

        metadata: {
          name:
            'Detail image'
        }
      }
    ],

    storyboard:
      applied.storyboard.map(
        scene => ({
          ...scene,

          assetId:
            scene.id ===
              'scene-a'
              ? 'image-a'
              : 'image-b'
        })
      )
  }

  const videoTrack =
    project.tracks.find(
      track =>
        track.type === 'video'
    )!

  videoTrack.clips.push(
    {
      id:
        'clip-a',

      assetId:
        'image-a',

      startMs:
        0,

      durationMs:
        3000,

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
        3000,

      durationMs:
        2000,

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

  return project
}


describe(
  'Director executable edit context',
  () => {
    it(
      'does not claim readiness without an accepted Director plan',
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

        const readiness =
          directorExecutionReadiness(
            project
          )

        expect(
          readiness.ready
        ).toBe(false)

        expect(
          readiness.issues[0]
            .code
        ).toBe(
          'director-missing'
        )
      }
    )

    it(
      'maps accepted Director scenes to exact linked timeline clips',
      () => {
        const context =
          buildDirectorExecutionContext(
            fixture()
          )

        expect(
          context?.readiness
            .ready
        ).toBe(true)

        expect(
          context?.readiness
            .linkedSceneCount
        ).toBe(2)

        expect(
          context?.director
            .scenes
            .map(
              scene => ({
                id:
                  scene.sceneId,
                start:
                  scene.plannedStartMs,
                duration:
                  scene.plannedDurationMs,
                clips:
                  scene.clips.map(
                    clip =>
                      clip.clipId
                  )
              })
            )
        ).toEqual([
          {
            id:
              'scene-a',
            start:
              0,
            duration:
              3000,
            clips: [
              'clip-a'
            ]
          },
          {
            id:
              'scene-b',
            start:
              3000,
            duration:
              2000,
            clips: [
              'clip-b'
            ]
          }
        ])
      }
    )

    it(
      'blocks execution when one Director scene is not represented on the timeline',
      () => {
        const project =
          fixture()

        const track =
          project.tracks.find(
            item =>
              item.type
                === 'video'
          )!

        track.clips =
          track.clips.filter(
            clip =>
              clip.sceneId
                !== 'scene-b'
          )

        const readiness =
          directorExecutionReadiness(
            project
          )

        expect(
          readiness.ready
        ).toBe(false)

        expect(
          readiness.issues
        ).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              severity:
                'blocking',
              code:
                'scene-timeline-missing',
              sceneId:
                'scene-b'
            })
          ])
        )

        expect(
          () =>
            directorEditorInstruction(
              project
            )
        ).toThrow(
          /not ready/i
        )
      }
    )

    it(
      'detects a stale Director plan after storyboard timing changes',
      () => {
        const project =
          fixture()

        project.storyboard[0] = {
          ...project.storyboard[0],
          durationMs:
            3500
        }

        const readiness =
          directorExecutionReadiness(
            project
          )

        expect(
          readiness.ready
        ).toBe(false)

        expect(
          readiness
            .storyboardMatchesDirector
        ).toBe(false)

        expect(
          readiness.issues
        ).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              code:
                'director-stale'
            })
          ])
        )
      }
    )

    it(
      'creates a conservative Director-to-Editor instruction only when ready',
      () => {
        const instruction =
          directorEditorInstruction(
            fixture()
          )

        expect(
          instruction
        ).toContain(
          'existing track IDs'
        )

        expect(
          instruction
        ).toContain(
          'Do not invent'
        )

        expect(
          instruction
        ).toContain(
          'planned scene starts'
        )
      }
    )

    it(
      'adds Director execution context to the AI Editor without exposing managed file paths',
      () => {
        const context =
          buildAiEditorContext(
            fixture()
          )

        expect(
          context.director
            ?.readiness
            .ready
        ).toBe(true)

        expect(
          context.tracks
            .flatMap(
              track =>
                track.clips
            )
            .map(
              clip =>
                clip.sceneId
            )
        ).toEqual(
          expect.arrayContaining([
            'scene-a',
            'scene-b'
          ])
        )

        expect(
          JSON.stringify(
            context
          )
        ).not.toContain(
          'KINAOU/Assets/'
        )
      }
    )
  }
)
