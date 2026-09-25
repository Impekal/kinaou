import {
  directorPlanSchema,
  type DirectorPlan
} from './director'

import type {
  KinaouProject,
  TimelineTrack
} from './project'


const visualTrackTypes =
  new Set<
    TimelineTrack['type']
  >([
    'video',
    'broll',
    'image',
    'avatar',
    'overlay'
  ])


export type DirectorExecutionIssueCode =
  | 'director-missing'
  | 'director-stale'
  | 'scene-timeline-missing'
  | 'scene-track-locked'
  | 'scene-asset-missing'
  | 'scene-asset-offline'
  | 'scene-asset-unmanaged'


export interface DirectorExecutionIssue {
  severity:
    | 'blocking'
    | 'warning'

  code:
    DirectorExecutionIssueCode

  message:
    string

  sceneId?:
    string
}


export interface DirectorSceneExecutionClip {
  trackId:
    string

  trackName:
    string

  trackType:
    TimelineTrack['type']

  trackLocked:
    boolean

  clipId:
    string

  assetId:
    string

  startMs:
    number

  durationMs:
    number

  sourceOffsetMs:
    number

  speed:
    number
}


export interface DirectorSceneExecution {
  sceneId:
    string

  title:
    string

  plannedStartMs:
    number

  plannedDurationMs:
    number

  narration:
    string

  visualBrief:
    string

  requiredMedia:
    DirectorPlan['scenes'][number]['requiredMedia']

  storyboardAssetId?:
    string

  clips:
    DirectorSceneExecutionClip[]
}


export interface DirectorExecutionReadiness {
  acceptedDirectorPlan:
    boolean

  storyboardMatchesDirector:
    boolean

  ready:
    boolean

  sceneCount:
    number

  linkedSceneCount:
    number

  issues:
    DirectorExecutionIssue[]
}


export interface DirectorExecutionContext {
  schemaVersion:
    1

  director: {
    title:
      string

    objective:
      string

    scenes:
      DirectorSceneExecution[]
  }

  readiness:
    DirectorExecutionReadiness
}


export function acceptedDirectorPlan(
  project: KinaouProject
): DirectorPlan | undefined {
  const parsed =
    directorPlanSchema.safeParse(
      project.metadata
        .directorPlan
    )

  return parsed.success
    ? parsed.data
    : undefined
}


function storyboardMatches(
  project: KinaouProject,
  plan: DirectorPlan
): boolean {
  if (
    project.storyboard.length
      !== plan.scenes.length
  ) {
    return false
  }

  return plan.scenes.every(
    (
      scene,
      index
    ) => {
      const storyboard =
        project.storyboard[
          index
        ]

      return Boolean(
        storyboard
        && storyboard.id
          === scene.id
        && storyboard.durationMs
          === scene.durationMs
      )
    }
  )
}


function sceneClips(
  project: KinaouProject,
  sceneId: string
): DirectorSceneExecutionClip[] {
  return project.tracks
    .filter(
      track =>
        visualTrackTypes.has(
          track.type
        )
    )
    .flatMap(
      track =>
        track.clips
          .filter(
            clip =>
              clip.sceneId
                === sceneId
          )
          .map(
            clip => ({
              trackId:
                track.id,

              trackName:
                track.name,

              trackType:
                track.type,

              trackLocked:
                track.locked,

              clipId:
                clip.id,

              assetId:
                clip.assetId,

              startMs:
                clip.startMs,

              durationMs:
                clip.durationMs,

              sourceOffsetMs:
                clip.sourceOffsetMs,

              speed:
                clip.speed
            })
          )
    )
}


export function buildDirectorExecutionContext(
  project: KinaouProject
): DirectorExecutionContext | undefined {
  const plan =
    acceptedDirectorPlan(
      project
    )

  if (!plan) {
    return undefined
  }

  const matches =
    storyboardMatches(
      project,
      plan
    )

  const issues:
    DirectorExecutionIssue[] = []

  if (!matches) {
    issues.push({
      severity:
        'blocking',

      code:
        'director-stale',

      message:
        'The accepted Director plan no longer matches the current storyboard.'
    })
  }

  let cursorMs =
    0

  let linkedSceneCount =
    0

  const scenes =
    plan.scenes.map(
      scene => {
        const storyboard =
          project.storyboard.find(
            item =>
              item.id === scene.id
          )

        const clips =
          sceneClips(
            project,
            scene.id
          )

        if (
          clips.length > 0
        ) {
          linkedSceneCount +=
            1
        } else {
          issues.push({
            severity:
              'blocking',

            code:
              'scene-timeline-missing',

            sceneId:
              scene.id,

            message:
              `Director scene "${scene.title}" has no linked visual clip on the timeline.`
          })
        }

        if (
          clips.some(
            clip =>
              clip.trackLocked
          )
        ) {
          issues.push({
            severity:
              'blocking',

            code:
              'scene-track-locked',

            sceneId:
              scene.id,

            message:
              `Director scene "${scene.title}" is linked to a locked visual track.`
          })
        }

        if (
          storyboard?.assetId
        ) {
          const asset =
            project.assets.find(
              item =>
                item.id
                  === storyboard.assetId
            )

          if (!asset) {
            issues.push({
              severity:
                'warning',

              code:
                'scene-asset-missing',

              sceneId:
                scene.id,

              message:
                `Director scene "${scene.title}" references a missing storyboard visual.`
            })
          } else if (
            asset.offline
          ) {
            issues.push({
              severity:
                'warning',

              code:
                'scene-asset-offline',

              sceneId:
                scene.id,

              message:
                `Director scene "${scene.title}" has an offline storyboard visual.`
            })
          } else if (
            !asset.managed
            || !asset.uri
              .startsWith(
                'KINAOU/Assets/'
              )
          ) {
            issues.push({
              severity:
                'warning',

              code:
                'scene-asset-unmanaged',

              sceneId:
                scene.id,

              message:
                `Director scene "${scene.title}" uses an unmanaged storyboard visual.`
            })
          }
        }

        const result:
          DirectorSceneExecution = {
            sceneId:
              scene.id,

            title:
              scene.title,

            plannedStartMs:
              cursorMs,

            plannedDurationMs:
              scene.durationMs,

            narration:
              scene.narration
              ?? '',

            visualBrief:
              scene.visualBrief,

            requiredMedia:
              [...scene.requiredMedia],

            ...(storyboard
              ?.assetId
              ? {
                  storyboardAssetId:
                    storyboard
                      .assetId
                }
              : {}),

            clips
          }

        cursorMs +=
          scene.durationMs

        return result
      }
    )

  const readiness:
    DirectorExecutionReadiness = {
      acceptedDirectorPlan:
        true,

      storyboardMatchesDirector:
        matches,

      ready:
        !issues.some(
          issue =>
            issue.severity
              === 'blocking'
        ),

      sceneCount:
        scenes.length,

      linkedSceneCount,

      issues
    }

  return {
    schemaVersion:
      1,

    director: {
      title:
        plan.title,

      objective:
        plan.objective,

      scenes
    },

    readiness
  }
}


export function directorExecutionReadiness(
  project: KinaouProject
): DirectorExecutionReadiness {
  const context =
    buildDirectorExecutionContext(
      project
    )

  if (context) {
    return context.readiness
  }

  return {
    acceptedDirectorPlan:
      false,

    storyboardMatchesDirector:
      false,

    ready:
      false,

    sceneCount:
      0,

    linkedSceneCount:
      0,

    issues: [
      {
        severity:
          'blocking',

        code:
          'director-missing',

        message:
          'No accepted Director plan is available.'
      }
    ]
  }
}


export function directorEditorInstruction(
  project: KinaouProject
): string {
  const context =
    buildDirectorExecutionContext(
      project
    )

  if (
    !context
    || !context.readiness.ready
  ) {
    throw new Error(
      'Director plan is not ready for executable timeline editing'
    )
  }

  return [
    'Turn the accepted KINAOU Director plan into a conservative executable timeline edit.',
    'Preserve the Director scene order and intended scene durations.',
    'Use only existing track IDs, clip IDs and assets already present in the supplied context.',
    'Do not invent tracks, clips, assets or media.',
    'Prefer moving and trimming existing scene-linked clips to align them with the planned scene starts and durations.',
    'Use gain, speed, fades or caption text edits only when they clearly support the Director plan.',
    'Do not remove media or make destructive assumptions.',
    'Every proposed operation must explain why it is needed.'
  ].join(
    ' '
  )
}
