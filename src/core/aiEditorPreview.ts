import {
  applyAiEditorProposal,
  parseAiEditorProposal,
  type AiEditorProposal
} from './aiEditor'

import type {
  KinaouProject,
  TimelineTrack
} from './project'


export interface AiEditorClipPreviewState {
  trackId: string
  trackName: string
  trackType: TimelineTrack['type']

  clipId: string
  assetId: string
  assetKind?: string
  assetName: string

  sceneId?: string

  startMs: number
  durationMs: number
  sourceOffsetMs: number

  gain: number
  speed: number

  fadeInMs: number
  fadeOutMs: number

  transitionMs: number | null

  motion:
    | 'zoom-in'
    | 'zoom-out'
    | null

  captionText?: string
}


export interface AiEditorCombinedTargetPreview {
  key: string
  before: AiEditorClipPreviewState
  after: AiEditorClipPreviewState
}


export interface AiEditorCombinedPreview {
  selectedOperationIds: string[]

  beforeTimelineEndMs: number
  afterTimelineEndMs: number

  targets:
    AiEditorCombinedTargetPreview[]
}


function timelineEndMs(
  project: KinaouProject
) {
  return project.tracks.reduce(
    (
      projectMax,
      track
    ) =>
      Math.max(
        projectMax,
        track.clips.reduce(
          (
            trackMax,
            clip
          ) =>
            Math.max(
              trackMax,
              clip.startMs
              + clip.durationMs
            ),
          0
        )
      ),
    0
  )
}


function selectedTargets(
  proposal: AiEditorProposal,
  selected:
    Set<string>
) {
  const result:
    Array<{
      trackId: string
      clipId: string
    }> = []

  const seen =
    new Set<string>()

  for (
    const operation
    of proposal.operations
  ) {
    if (
      !selected.has(
        operation.id
      )
    ) {
      continue
    }

    const edit =
      operation.edit

    const targets =
      edit.type === 'move-clips'
        ? edit.moves.map(
            move => ({
              trackId:
                move.trackId,
              clipId:
                move.clipId
            })
          )
        : [
            {
              trackId:
                edit.trackId,
              clipId:
                edit.clipId
            }
          ]

    for (
      const target
      of targets
    ) {
      const key =
        `${target.trackId}:${target.clipId}`

      if (
        seen.has(
          key
        )
      ) {
        continue
      }

      seen.add(
        key
      )

      result.push(
        target
      )
    }
  }

  return result
}


function snapshot(
  project: KinaouProject,
  trackId: string,
  clipId: string
): AiEditorClipPreviewState {
  const track =
    project.tracks.find(
      item =>
        item.id === trackId
    )

  const clip =
    track?.clips.find(
      item =>
        item.id === clipId
    )

  if (
    !track
    || !clip
  ) {
    throw new Error(
      `AI Editor preview target not found: ${trackId}/${clipId}`
    )
  }

  const asset =
    project.assets.find(
      item =>
        item.id === clip.assetId
    )

  if (!asset) {
    throw new Error(
      `AI Editor preview asset not found: ${clip.assetId}`
    )
  }

  return {
    trackId:
      track.id,

    trackName:
      track.name,

    trackType:
      track.type,

    clipId:
      clip.id,

    assetId:
      clip.assetId,

    assetKind:
      asset.kind,

    assetName:
      String(
        asset.metadata.name
        ?? asset.id
      ),

    ...(clip.sceneId
      ? {
          sceneId:
            clip.sceneId
        }
      : {}),

    startMs:
      clip.startMs,

    durationMs:
      clip.durationMs,

    sourceOffsetMs:
      clip.sourceOffsetMs,

    gain:
      clip.gain,

    speed:
      clip.speed,

    fadeInMs:
      clip.fades?.inMs
      ?? 0,

    fadeOutMs:
      clip.fades?.outMs
      ?? 0,

    transitionMs:
      clip.transitionIn
        ?.durationMs
      ?? null,

    motion:
      clip.motion
      ?? null,

    ...(asset.kind
      === 'caption'
      ? {
          captionText:
            String(
              asset.metadata.text
              ?? ''
            )
        }
      : {})
  }
}


export function buildAiEditorCombinedPreview(
  project: KinaouProject,
  input: unknown,
  selectedIds: string[]
): AiEditorCombinedPreview {
  const proposal =
    parseAiEditorProposal(
      input
    )

  const selected =
    new Set(
      selectedIds
    )

  if (
    !selected.size
    || [...selected].some(
      id =>
        !proposal.operations.some(
          operation =>
            operation.id === id
        )
    )
  ) {
    throw new Error(
      'Select valid AI edit operations'
    )
  }

  const targets =
    selectedTargets(
      proposal,
      selected
    )

  const before =
    new Map(
      targets.map(
        target => [
          `${target.trackId}:${target.clipId}`,
          snapshot(
            project,
            target.trackId,
            target.clipId
          )
        ]
      )
    )

  const projected =
    applyAiEditorProposal(
      project,
      proposal,
      [...selected],
      new Date(
        project.updatedAt
      )
    )

  return {
    selectedOperationIds:
      [...selected],

    beforeTimelineEndMs:
      timelineEndMs(
        project
      ),

    afterTimelineEndMs:
      timelineEndMs(
        projected
      ),

    targets:
      targets.map(
        target => {
          const key =
            `${target.trackId}:${target.clipId}`

          const original =
            before.get(
              key
            )

          if (!original) {
            throw new Error(
              `AI Editor preview baseline missing: ${key}`
            )
          }

          return {
            key,
            before:
              original,
            after:
              snapshot(
                projected,
                target.trackId,
                target.clipId
              )
          }
        }
      )
  }
}
