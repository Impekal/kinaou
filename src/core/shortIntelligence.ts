import {
  projectContentProfile
} from './contentProfile'

import type {
  KinaouProject,
  TimelineTrack
} from './project'

import {
  planShortExportRanges,
  projectShortExportMaximum,
  shortExportMaximumError
} from './shortExportRanges'

import {
  parseSttTranscript,
  type SttTranscript
} from './sttJobs'


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


export const SHORT_INTELLIGENCE_CONTEXT_MAX_BYTES =
  250_000

export const SHORT_INTELLIGENCE_SEGMENT_LIMIT =
  1000


export type ShortIntelligenceIssueCode =
  | 'timeline-empty'
  | 'content-evidence-missing'
  | 'transcript-missing'
  | 'transcript-invalid'
  | 'transcript-too-large'
  | 'scene-unanchored'
  | 'target-longer-than-source'
  | 'context-too-large'


export interface ShortIntelligenceIssue {
  severity:
    | 'blocking'
    | 'warning'

  code:
    ShortIntelligenceIssueCode

  message:
    string

  sceneId?:
    string
}


export interface ShortSceneEvidence {
  sceneId:
    string

  title:
    string

  description:
    string

  narration?:
    string

  durationMs:
    number

  anchored:
    boolean

  inMs?:
    number

  outMs?:
    number
}


export interface ShortTranscriptEvidence {
  id:
    string

  transcriptAssetId:
    string

  sourceAssetId:
    string

  sourceAssetName:
    string

  trackId:
    string

  trackName:
    string

  clipId:
    string

  sceneId?:
    string

  sourceStartMs:
    number

  sourceEndMs:
    number

  startMs:
    number

  endMs:
    number

  text:
    string

  language:
    string
}


export interface ShortIntelligenceContext {
  schemaVersion:
    1

  project: {
    id:
      string

    title:
      string

    updatedAt:
      string

    timelineDurationMs:
      number
  }

  target: {
    maximumDurationMs:
      number

    sourceLanguage:
      string

    outputLanguage:
      string

    targetMarket:
      string

    audience:
      string

    objective:
      string

    tone:
      string
  }

  evidence: {
    scenes:
      ShortSceneEvidence[]

    transcriptSegments:
      ShortTranscriptEvidence[]

    existingSceneCandidates:
      Array<{
        id: string
        sceneIds: string[]
        titles: string[]
        inMs: number
        outMs: number
        durationMs: number
      }>
  }

  readiness: {
    ready:
      boolean

    anchoredSceneCount:
      number

    transcriptSegmentCount:
      number

    issues:
      ShortIntelligenceIssue[]
  }

  policy: {
    reviewOnly:
      true

    noAutomaticExport:
      true

    noViralityGuarantee:
      true

    noTrendClaimWithoutEvidence:
      true
  }
}


interface ParsedTranscript {
  transcriptAssetId:
    string

  sourceAssetId:
    string

  transcript:
    SttTranscript
}


function timelineDurationMs(
  project: KinaouProject
): number {
  return project.tracks
    .filter(
      track =>
        !track.muted
    )
    .flatMap(
      track =>
        track.clips
    )
    .reduce(
      (
        maximum,
        clip
      ) =>
        Math.max(
          maximum,
          clip.startMs
          + clip.durationMs
        ),
      0
    )
}


function sceneEvidence(
  project: KinaouProject
): ShortSceneEvidence[] {
  const visualClips =
    project.tracks
      .filter(
        track =>
          !track.muted
          && visualTrackTypes.has(
            track.type
          )
      )
      .flatMap(
        track =>
          track.clips
      )

  return project.storyboard.map(
    scene => {
      const matches =
        visualClips.filter(
          clip =>
            clip.sceneId
            === scene.id
        )

      if (!matches.length) {
        return {
          sceneId:
            scene.id,

          title:
            scene.title,

          description:
            scene.description,

          ...(scene.narration
            !== undefined
            ? {
                narration:
                  scene.narration
              }
            : {}),

          durationMs:
            scene.durationMs,

          anchored:
            false
        }
      }

      return {
        sceneId:
          scene.id,

        title:
          scene.title,

        description:
          scene.description,

        ...(scene.narration
          !== undefined
          ? {
              narration:
                scene.narration
            }
          : {}),

        durationMs:
          scene.durationMs,

        anchored:
          true,

        inMs:
          Math.min(
            ...matches.map(
              clip =>
                clip.startMs
            )
          ),

        outMs:
          Math.max(
            ...matches.map(
              clip =>
                clip.startMs
                + clip.durationMs
            )
          )
      }
    }
  )
}


function parsedTranscripts(
  project: KinaouProject
): {
  valid: ParsedTranscript[]
  invalidCount: number
} {
  const valid:
    ParsedTranscript[] = []

  let invalidCount =
    0

  for (
    const asset
    of project.assets
  ) {
    if (
      asset.kind
      !== 'document'
    ) {
      continue
    }

    const sourceAssetId =
      typeof asset.metadata
        .sourceAssetId
        === 'string'
        ? asset.metadata
          .sourceAssetId
        : ''

    if (
      !sourceAssetId
      || asset.metadata
        .transcript
        === undefined
    ) {
      continue
    }

    try {
      valid.push({
        transcriptAssetId:
          asset.id,

        sourceAssetId,

        transcript:
          parseSttTranscript(
            asset.metadata
              .transcript
          )
      })
    } catch {
      invalidCount +=
        1
    }
  }

  return {
    valid,
    invalidCount
  }
}


function transcriptEvidence(
  project: KinaouProject,
  transcripts:
    ParsedTranscript[]
): ShortTranscriptEvidence[] {
  const result:
    ShortTranscriptEvidence[] = []

  for (
    const entry
    of transcripts
  ) {
    const sourceAsset =
      project.assets.find(
        asset =>
          asset.id
          === entry.sourceAssetId
      )

    if (
      !sourceAsset
      || (
        sourceAsset.kind
        !== 'audio'
        && sourceAsset.kind
        !== 'video'
      )
    ) {
      continue
    }

    const sourceAssetName =
      String(
        sourceAsset.metadata
          .name
        ?? sourceAsset.id
      )

    for (
      const track
      of project.tracks
    ) {
      if (
        track.muted
      ) {
        continue
      }

      for (
        const clip
        of track.clips
      ) {
        if (
          clip.assetId
          !== entry.sourceAssetId
        ) {
          continue
        }

        const sourceClipStartMs =
          clip.sourceOffsetMs

        const sourceClipEndMs =
          clip.sourceOffsetMs
          + (
            clip.durationMs
            * clip.speed
          )

        entry.transcript
          .segments
          .forEach(
            (
              segment,
              segmentIndex
            ) => {
              const overlapStartMs =
                Math.max(
                  segment.startMs,
                  sourceClipStartMs
                )

              const overlapEndMs =
                Math.min(
                  segment.endMs,
                  sourceClipEndMs
                )

              if (
                overlapEndMs
                <= overlapStartMs
              ) {
                return
              }

              const projectedStartMs =
                Math.max(
                  clip.startMs,
                  Math.round(
                    clip.startMs
                    + (
                      overlapStartMs
                      - sourceClipStartMs
                    )
                    / clip.speed
                  )
                )

              const projectedEndMs =
                Math.min(
                  clip.startMs
                  + clip.durationMs,

                  Math.round(
                    clip.startMs
                    + (
                      overlapEndMs
                      - sourceClipStartMs
                    )
                    / clip.speed
                  )
                )

              if (
                projectedEndMs
                <= projectedStartMs
              ) {
                return
              }

              result.push({
                id:
                  `${entry.transcriptAssetId}:${clip.id}:${segmentIndex}`,

                transcriptAssetId:
                  entry.transcriptAssetId,

                sourceAssetId:
                  entry.sourceAssetId,

                sourceAssetName,

                trackId:
                  track.id,

                trackName:
                  track.name,

                clipId:
                  clip.id,

                ...(clip.sceneId
                  ? {
                      sceneId:
                        clip.sceneId
                    }
                  : {}),

                sourceStartMs:
                  overlapStartMs,

                sourceEndMs:
                  overlapEndMs,

                startMs:
                  projectedStartMs,

                endMs:
                  projectedEndMs,

                text:
                  segment.text.trim(),

                language:
                  entry.transcript
                    .language
              })
            }
          )
      }
    }
  }

  return result.sort(
    (
      a,
      b
    ) =>
      a.startMs
      - b.startMs
      || a.endMs
      - b.endMs
      || a.id.localeCompare(
        b.id
      )
  )
}


export function buildShortIntelligenceContext(
  project: KinaouProject,
  maximumDurationMs =
    projectShortExportMaximum(
      project
    )
): ShortIntelligenceContext {
  const maximumError =
    shortExportMaximumError(
      maximumDurationMs
    )

  if (maximumError) {
    throw new Error(
      maximumError
    )
  }

  const durationMs =
    timelineDurationMs(
      project
    )

  const scenes =
    sceneEvidence(
      project
    )

  const transcripts =
    parsedTranscripts(
      project
    )

  const transcriptSegments =
    transcriptEvidence(
      project,
      transcripts.valid
    )

  const profile =
    projectContentProfile(
      project
    )

  const issues:
    ShortIntelligenceIssue[] = []

  if (
    durationMs <= 0
  ) {
    issues.push({
      severity:
        'blocking',

      code:
        'timeline-empty',

      message:
        'The active timeline has no media duration.'
    })
  }

  if (
    transcriptSegments.length
      === 0
    && scenes.length
      === 0
  ) {
    issues.push({
      severity:
        'blocking',

      code:
        'content-evidence-missing',

      message:
        'No storyboard or timeline-mapped transcript evidence is available for Short selection.'
    })
  }

  if (
    transcriptSegments.length
      === 0
  ) {
    issues.push({
      severity:
        'warning',

      code:
        'transcript-missing',

      message:
        'No timeline-mapped transcript evidence is available; Short intelligence can only use storyboard evidence.'
    })
  }

  if (
    transcripts.invalidCount
      > 0
  ) {
    issues.push({
      severity:
        'warning',

      code:
        'transcript-invalid',

      message:
        `${transcripts.invalidCount} stored transcript asset(s) could not be parsed and were excluded.`
    })
  }

  if (
    transcriptSegments.length
      > SHORT_INTELLIGENCE_SEGMENT_LIMIT
  ) {
    issues.push({
      severity:
        'blocking',

      code:
        'transcript-too-large',

      message:
        `Timeline-mapped transcript evidence exceeds the ${SHORT_INTELLIGENCE_SEGMENT_LIMIT}-segment context limit.`
    })
  }

  for (
    const scene
    of scenes
  ) {
    if (
      !scene.anchored
    ) {
      issues.push({
        severity:
          'warning',

        code:
          'scene-unanchored',

        sceneId:
          scene.sceneId,

        message:
          `Storyboard scene "${scene.title}" is not anchored to an active visual timeline clip.`
      })
    }
  }

  if (
    durationMs > 0
    && maximumDurationMs
      > durationMs
  ) {
    issues.push({
      severity:
        'warning',

      code:
        'target-longer-than-source',

      message:
        'The configured Short maximum is longer than the current active timeline.'
    })
  }

  const existing =
    planShortExportRanges(
      project,
      maximumDurationMs
    )

  const context:
    ShortIntelligenceContext = {
      schemaVersion:
        1,

      project: {
        id:
          project.id,

        title:
          project.title,

        updatedAt:
          project.updatedAt,

        timelineDurationMs:
          durationMs
      },

      target: {
        maximumDurationMs,

        sourceLanguage:
          profile.sourceLanguage,

        outputLanguage:
          profile.outputLanguage,

        targetMarket:
          profile.targetMarket,

        audience:
          profile.audience,

        objective:
          profile.objective,

        tone:
          profile.tone
      },

      evidence: {
        scenes,

        transcriptSegments:
          transcriptSegments.slice(
            0,
            SHORT_INTELLIGENCE_SEGMENT_LIMIT
          ),

        existingSceneCandidates:
          existing.candidates.map(
            candidate => ({
              id:
                candidate.id,

              sceneIds:
                [...candidate.sceneIds],

              titles:
                [...candidate.titles],

              inMs:
                candidate.inMs,

              outMs:
                candidate.outMs,

              durationMs:
                candidate.durationMs
            })
          )
      },

      readiness: {
        ready:
          false,

        anchoredSceneCount:
          scenes.filter(
            scene =>
              scene.anchored
          ).length,

        transcriptSegmentCount:
          transcriptSegments.length,

        issues
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

  const serializedBytes =
    new TextEncoder()
      .encode(
        JSON.stringify(
          context
        )
      )
      .byteLength

  if (
    serializedBytes
      > SHORT_INTELLIGENCE_CONTEXT_MAX_BYTES
  ) {
    issues.push({
      severity:
        'blocking',

      code:
        'context-too-large',

      message:
        `Short intelligence context exceeds the ${SHORT_INTELLIGENCE_CONTEXT_MAX_BYTES}-byte safety limit.`
    })
  }

  context.readiness.ready =
    !issues.some(
      issue =>
        issue.severity
        === 'blocking'
    )

  return context
}
