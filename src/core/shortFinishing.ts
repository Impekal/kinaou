import {
  defaultAudioDucking
} from './audioDucking'

import {
  defaultLoudnessNormalization
} from './audioLoudness'

import type {
  KinaouProject,
  TimelineTrack
} from './project'

import {
  projectFormatReframing,
  projectTargetFormat
} from './render'

import {
  projectShortDerivativeLineage
} from './shortDerivative'

import {
  projectShortDerivativeMaterialization
} from './shortDerivativeMaterialize'


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


const speechTrackTypes =
  new Set<
    TimelineTrack['type']
  >([
    'voice',
    'dialog'
  ])


export type ShortFinishingIssueCode =
  | 'not-short-derivative'
  | 'not-materialized'
  | 'timeline-empty'
  | 'visual-missing'
  | 'asset-missing'
  | 'asset-offline'
  | 'captions-missing'
  | 'speech-missing'


export interface ShortFinishingIssue {
  code:
    ShortFinishingIssueCode

  severity:
    'blocking'
    | 'warning'

  message:
    string

  assetId?:
    string
}


export interface ShortFinishingContext {
  schemaVersion:
    1

  project: {
    id:
      string

    title:
      string

    updatedAt:
      string

    durationMs:
      number

    targetFormat:
      ReturnType<
        typeof projectTargetFormat
      >
  }

  counts: {
    activeClipCount:
      number

    visualClipCount:
      number

    speechClipCount:
      number

    musicClipCount:
      number

    captionClipCount:
      number
  }

  reframing:
    ReturnType<
      typeof projectFormatReframing
    >

  capabilities: {
    formatReframing:
      true

    captionTextEditing:
      true

    captionLayoutStyling:
      false

    audioDucking:
      true

    loudnessNormalization:
      true
  }

  audioDefaults: {
    ducking:
      typeof defaultAudioDucking

    loudnessNormalization:
      typeof defaultLoudnessNormalization
  }

  readiness: {
    ready:
      boolean

    issues:
      ShortFinishingIssue[]
  }

  policy: {
    reviewOnly:
      true

    projectMutation:
      false

    automaticExport:
      false

    automaticPublish:
      false
  }
}


export function buildShortFinishingContext(
  project:
    KinaouProject
): ShortFinishingContext {
  const issues:
    ShortFinishingIssue[] = []

  const lineage =
    projectShortDerivativeLineage(
      project
    )

  const materialization =
    projectShortDerivativeMaterialization(
      project
    )

  if (!lineage) {
    issues.push({
      code:
        'not-short-derivative',

      severity:
        'blocking',

      message:
        'Short finishing is available only for derivative Short projects.'
    })
  }

  if (
    lineage
    && !materialization
  ) {
    issues.push({
      code:
        'not-materialized',

      severity:
        'blocking',

      message:
        'The derivative Short must be materialized before finishing.'
    })
  }

  const activeTracks =
    project.tracks.filter(
      track =>
        !track.muted
    )

  const activeClips =
    activeTracks.flatMap(
      track =>
        track.clips.map(
          clip => ({
            track,
            clip
          })
        )
    )

  if (!activeClips.length) {
    issues.push({
      code:
        'timeline-empty',

      severity:
        'blocking',

      message:
        'The Short timeline has no active clips.'
    })
  }

  const visualClips =
    activeClips.filter(
      item =>
        visualTrackTypes.has(
          item.track.type
        )
    )

  const speechClips =
    activeClips.filter(
      item =>
        speechTrackTypes.has(
          item.track.type
        )
    )

  const musicClips =
    activeClips.filter(
      item =>
        item.track.type
        === 'music'
    )

  const captionClips =
    activeClips.filter(
      item =>
        item.track.type
        === 'caption'
    )

  if (
    activeClips.length
    && !visualClips.length
  ) {
    issues.push({
      code:
        'visual-missing',

      severity:
        'blocking',

      message:
        'The Short has no active visual clips.'
    })
  }

  if (!captionClips.length) {
    issues.push({
      code:
        'captions-missing',

      severity:
        'warning',

      message:
        'The Short currently has no active captions.'
    })
  }

  if (!speechClips.length) {
    issues.push({
      code:
        'speech-missing',

      severity:
        'warning',

      message:
        'The Short currently has no active voice or dialogue clips.'
    })
  }

  const assets =
    new Map(
      project.assets.map(
        asset => [
          asset.id,
          asset
        ]
      )
    )

  const missingAssets =
    new Set<string>()

  const offlineAssets =
    new Set<string>()

  for (
    const {
      clip
    }
    of activeClips
  ) {
    const asset =
      assets.get(
        clip.assetId
      )

    if (!asset) {
      missingAssets.add(
        clip.assetId
      )

      continue
    }

    if (asset.offline) {
      offlineAssets.add(
        asset.id
      )
    }
  }

  for (
    const assetId
    of [...missingAssets]
      .sort()
  ) {
    issues.push({
      code:
        'asset-missing',

      severity:
        'blocking',

      assetId,

      message:
        `Short clip references a missing asset: ${assetId}`
    })
  }

  for (
    const assetId
    of [...offlineAssets]
      .sort()
  ) {
    issues.push({
      code:
        'asset-offline',

      severity:
        'blocking',

      assetId,

      message:
        `Short asset is offline: ${assetId}`
    })
  }

  const durationMs =
    activeClips.reduce(
      (
        maximum,
        item
      ) =>
        Math.max(
          maximum,
          item.clip.startMs
          + item.clip.durationMs
        ),
      0
    )

  const format =
    projectTargetFormat(
      project
    )

  return {
    schemaVersion:
      1,

    project: {
      id:
        project.id,

      title:
        project.title,

      updatedAt:
        project.updatedAt,

      durationMs,

      targetFormat:
        format
    },

    counts: {
      activeClipCount:
        activeClips.length,

      visualClipCount:
        visualClips.length,

      speechClipCount:
        speechClips.length,

      musicClipCount:
        musicClips.length,

      captionClipCount:
        captionClips.length
    },

    reframing:
      projectFormatReframing(
        project,
        format
      ),

    capabilities: {
      formatReframing:
        true,

      captionTextEditing:
        true,

      /*
       * Current KINAOU caption rendering supports text/timing,
       * but no persisted visual caption-style contract yet.
       */
      captionLayoutStyling:
        false,

      audioDucking:
        true,

      loudnessNormalization:
        true
    },

    audioDefaults: {
      ducking:
        {
          ...defaultAudioDucking
        },

      loudnessNormalization:
        {
          ...defaultLoudnessNormalization
        }
    },

    readiness: {
      ready:
        !issues.some(
          issue =>
            issue.severity
            === 'blocking'
        ),

      issues
    },

    policy: {
      reviewOnly:
        true,

      projectMutation:
        false,

      automaticExport:
        false,

      automaticPublish:
        false
    }
  }
}
