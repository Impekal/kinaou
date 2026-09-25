import type {
  AudioDuckingSettings
} from './audioDucking'

import type {
  LoudnessNormalizationSettings
} from './audioLoudness'

import type {
  KinaouProject
} from './project'

import {
  createRenderPlan,
  type RenderPlan,
  type RenderPreset
} from './render'

import {
  createRangeRenderPlan
} from './renderRange'

import {
  parseShortHighlightProposal
} from './shortHighlightProposal'

import type {
  ShortIntelligenceContext
} from './shortIntelligence'


const visualTrackTypes =
  new Set([
    'video',
    'broll',
    'image',
    'avatar',
    'overlay'
  ])


export interface ShortCutSegment {
  position:
    number

  candidateId:
    string

  candidateOrder:
    number

  hook:
    string

  rationale:
    string

  sourceInMs:
    number

  sourceOutMs:
    number

  sourceDurationMs:
    number

  destinationInMs:
    number

  destinationOutMs:
    number

  evidence:
    Array<{
      kind:
        'scene'
        | 'transcript'

      id:
        string
    }>
}


export interface ShortCutPlan {
  schemaVersion:
    1

  projectId:
    string

  sourceTimelineDurationMs:
    number

  sourceProjectUpdatedAt:
    string

  title:
    string

  objective:
    string

  selectedCandidateIds:
    string[]

  maximumDurationMs:
    number

  durationMs:
    number

  segments:
    ShortCutSegment[]

  policy: {
    reviewOnly:
      true

    projectMutation:
      false

    automaticExport:
      false
  }
}


export interface ShortCutRenderOptions {
  audioDucking?:
    AudioDuckingSettings

  loudnessNormalization?:
    LoudnessNormalizationSettings
}


export function buildShortCutPlan(
  context:
    ShortIntelligenceContext,

  proposalInput:
    unknown,

  selectedIds:
    string[]
): ShortCutPlan {
  if (
    !context.readiness.ready
  ) {
    throw new Error(
      'Short intelligence context is not ready for compact editing'
    )
  }

  if (
    !selectedIds.length
    || selectedIds.length > 20
  ) {
    throw new Error(
      'Select 1–20 Short highlight candidates'
    )
  }

  if (
    new Set(
      selectedIds
    ).size
    !== selectedIds.length
  ) {
    throw new Error(
      'Select each Short highlight candidate only once'
    )
  }

  const proposal =
    parseShortHighlightProposal(
      proposalInput,
      context
    )

  const selected =
    new Set(
      selectedIds
    )

  const known =
    new Set(
      proposal.candidates
        .map(
          candidate =>
            candidate.id
        )
    )

  const unknown =
    [...selected]
      .find(
        id =>
          !known.has(id)
      )

  if (unknown) {
    throw new Error(
      `Selected Short highlight candidate is no longer available: ${unknown}`
    )
  }

  const candidates =
    proposal.candidates
      .filter(
        candidate =>
          selected.has(
            candidate.id
          )
      )
      .sort(
        (
          a,
          b
        ) =>
          a.order
          - b.order
      )

  /*
   * Different highlight candidates may be editorially reordered,
   * but the same source moment must not be duplicated implicitly.
   */
  const sourceOrder =
    [...candidates]
      .sort(
        (
          a,
          b
        ) =>
          a.inMs
          - b.inMs
          || a.outMs
          - b.outMs
      )

  for (
    let index = 1;
    index < sourceOrder.length;
    index += 1
  ) {
    const previous =
      sourceOrder[
        index - 1
      ]

    const current =
      sourceOrder[
        index
      ]

    if (
      current.inMs
      < previous.outMs
    ) {
      throw new Error(
        `Selected Short highlights overlap in source time: "${previous.id}" and "${current.id}"`
      )
    }
  }

  const totalDurationMs =
    candidates.reduce(
      (
        total,
        candidate
      ) =>
        total
        + (
          candidate.outMs
          - candidate.inMs
        ),
      0
    )

  if (
    totalDurationMs
    > context.target
      .maximumDurationMs
  ) {
    throw new Error(
      'Selected Short highlights exceed the configured combined Short duration'
    )
  }

  let cursorMs =
    0

  const segments =
    candidates.map(
      (
        candidate,
        index
      ) => {
        const durationMs =
          candidate.outMs
          - candidate.inMs

        const segment:
          ShortCutSegment = {
            position:
              index + 1,

            candidateId:
              candidate.id,

            candidateOrder:
              candidate.order,

            hook:
              candidate.hook,

            rationale:
              candidate.rationale,

            sourceInMs:
              candidate.inMs,

            sourceOutMs:
              candidate.outMs,

            sourceDurationMs:
              durationMs,

            destinationInMs:
              cursorMs,

            destinationOutMs:
              cursorMs
              + durationMs,

            evidence:
              candidate.evidence.map(
                item => ({
                  kind:
                    item.kind,
                  id:
                    item.id
                })
              )
          }

        cursorMs +=
          durationMs

        return segment
      }
    )

  return {
    schemaVersion:
      1,

    projectId:
      context.project.id,

    sourceTimelineDurationMs:
      context.project
        .timelineDurationMs,

    sourceProjectUpdatedAt:
      context.project
        .updatedAt,

    title:
      proposal.title,

    objective:
      proposal.objective,

    selectedCandidateIds:
      candidates.map(
        candidate =>
          candidate.id
      ),

    maximumDurationMs:
      context.target
        .maximumDurationMs,

    durationMs:
      totalDurationMs,

    segments,

    policy: {
      reviewOnly:
        true,

      projectMutation:
        false,

      automaticExport:
        false
    }
  }
}


export function createShortCutRenderPlan(
  project:
    KinaouProject,

  cut:
    ShortCutPlan,

  preset:
    RenderPreset,

  outputRelativePath:
    string,

  options:
    ShortCutRenderOptions = {}
): RenderPlan {
  if (
    project.id
    !== cut.projectId
  ) {
    throw new Error(
      'Short cut plan belongs to another project'
    )
  }

  if (
    cut.durationMs <= 0
    || cut.durationMs
      > cut.maximumDurationMs
  ) {
    throw new Error(
      'Short cut plan has an invalid compact duration'
    )
  }

  const base =
    createRenderPlan(
      project,
      preset,
      outputRelativePath,
      options
    )

  if (
    project.updatedAt
      !== cut.sourceProjectUpdatedAt
    || base.durationMs
      !== cut.sourceTimelineDurationMs
  ) {
    throw new Error(
      'The project changed after Short intelligence review'
    )
  }

  const compactClips:
    RenderPlan['clips'] = []

  cut.segments.forEach(
    (
      segment,
      segmentIndex
    ) => {
      const ranged =
        createRangeRenderPlan(
          base,
          {
            inMs:
              segment.sourceInMs,

            outMs:
              segment.sourceOutMs
          },
          outputRelativePath
        )

      if (
        !ranged.clips.some(
          clip =>
            visualTrackTypes.has(
              clip.trackType
            )
        )
      ) {
        throw new Error(
          `Short segment "${segment.candidateId}" contains no visual media`
        )
      }

      ranged.clips
        .forEach(
          clip => {
            compactClips.push({
              ...clip,

              /*
               * One source clip may legitimately appear in multiple
               * disjoint selected ranges. Give each virtual occurrence
               * its own render identity without touching the project.
               */
              clipId:
                `${clip.clipId}::short:${segmentIndex + 1}`,

              startMs:
                segment.destinationInMs
                + clip.startMs
            })
          }
        )
    }
  )

  if (
    !compactClips.length
  ) {
    throw new Error(
      'Compact Short cut contains no renderable media'
    )
  }

  compactClips.sort(
    (
      a,
      b
    ) =>
      a.startMs
      - b.startMs
      || a.trackIndex
        - b.trackIndex
      || a.clipId.localeCompare(
        b.clipId
      )
  )

  return {
    ...base,

    durationMs:
      cut.durationMs,

    clips:
      compactClips
  }
}
