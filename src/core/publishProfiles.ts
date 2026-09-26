import {
  z
} from 'zod'

import type {
  ExportReceipt
} from './exportHistory'

import type {
  TargetFormat
} from './render'


export const publishPlacementSchema =
  z.enum([
    'youtube-video',
    'youtube-short',
    'instagram-reel',
    'instagram-feed',
    'tiktok-video',
    'generic'
  ])


export type PublishPlacement =
  z.infer<
    typeof publishPlacementSchema
  >


export interface PublishPlacementProfile {
  id:
    PublishPlacement

  platform:
    'youtube'
    | 'instagram'
    | 'tiktok'
    | 'generic'

  label:
    string

  formats:
    readonly TargetFormat[]

  preferredFormat:
    TargetFormat

  minimumDurationMs:
    number

  maximumDurationMs:
    number
    | null

  title: {
    required:
      boolean

    maximumCharacters:
      number
  }

  description: {
    maximumCharacters:
      number
  }

  tags: {
    maximumCount:
      number

    maximumCharactersEach:
      number
  }
}


/*
 * Product-level delivery contracts.
 *
 * These are intentionally conservative KINAOU profiles, not claims that a
 * third-party platform will accept every file matching them forever.
 *
 * Platform APIs and limits can change independently. A later capability may
 * refresh platform facts, but render/publish behavior must remain deterministic
 * even when offline.
 */
export const publishPlacementProfiles:
  Record<
    PublishPlacement,
    PublishPlacementProfile
  > = {
    'youtube-video': {
      id:
        'youtube-video',

      platform:
        'youtube',

      label:
        'YouTube Video',

      formats: [
        'landscape',
        'vertical',
        'square'
      ],

      preferredFormat:
        'landscape',

      minimumDurationMs:
        1,

      maximumDurationMs:
        null,

      title: {
        required:
          true,

        maximumCharacters:
          100
      },

      description: {
        maximumCharacters:
          5000
      },

      tags: {
        maximumCount:
          30,

        maximumCharactersEach:
          80
      }
    },

    'youtube-short': {
      id:
        'youtube-short',

      platform:
        'youtube',

      label:
        'YouTube Short',

      formats: [
        'vertical',
        'square'
      ],

      preferredFormat:
        'vertical',

      minimumDurationMs:
        1,

      maximumDurationMs:
        180_000,

      title: {
        required:
          true,

        maximumCharacters:
          100
      },

      description: {
        maximumCharacters:
          5000
      },

      tags: {
        maximumCount:
          30,

        maximumCharactersEach:
          80
      }
    },

    'instagram-reel': {
      id:
        'instagram-reel',

      platform:
        'instagram',

      label:
        'Instagram Reel',

      formats: [
        'vertical'
      ],

      preferredFormat:
        'vertical',

      minimumDurationMs:
        1,

      maximumDurationMs:
        180_000,

      title: {
        required:
          false,

        maximumCharacters:
          200
      },

      description: {
        maximumCharacters:
          2200
      },

      tags: {
        maximumCount:
          30,

        maximumCharactersEach:
          80
      }
    },

    'instagram-feed': {
      id:
        'instagram-feed',

      platform:
        'instagram',

      label:
        'Instagram Feed Video',

      formats: [
        'square',
        'vertical'
      ],

      preferredFormat:
        'square',

      minimumDurationMs:
        1,

      maximumDurationMs:
        60_000,

      title: {
        required:
          false,

        maximumCharacters:
          200
      },

      description: {
        maximumCharacters:
          2200
      },

      tags: {
        maximumCount:
          30,

        maximumCharactersEach:
          80
      }
    },

    'tiktok-video': {
      id:
        'tiktok-video',

      platform:
        'tiktok',

      label:
        'TikTok Video',

      formats: [
        'vertical'
      ],

      preferredFormat:
        'vertical',

      minimumDurationMs:
        1,

      maximumDurationMs:
        600_000,

      title: {
        required:
          false,

        maximumCharacters:
          200
      },

      description: {
        maximumCharacters:
          2200
      },

      tags: {
        maximumCount:
          30,

        maximumCharactersEach:
          80
      }
    },

    generic: {
      id:
        'generic',

      platform:
        'generic',

      label:
        'Generic handoff',

      formats: [
        'landscape',
        'vertical',
        'square'
      ],

      preferredFormat:
        'landscape',

      minimumDurationMs:
        1,

      maximumDurationMs:
        null,

      title: {
        required:
          true,

        maximumCharacters:
          200
      },

      description: {
        maximumCharacters:
          5000
      },

      tags: {
        maximumCount:
          30,

        maximumCharactersEach:
          80
      }
    }
  }


export type PublishPlacementIssueCode =
  | 'format'
  | 'duration-minimum'
  | 'duration-maximum'
  | 'title-required'
  | 'title-length'
  | 'description-length'
  | 'tag-count'
  | 'tag-length'


export interface PublishPlacementIssue {
  code:
    PublishPlacementIssueCode

  message:
    string
}


export interface PublishPlacementReview {
  placement:
    PublishPlacement

  platform:
    PublishPlacementProfile['platform']

  ready:
    boolean

  preferredFormat:
    TargetFormat

  issues:
    PublishPlacementIssue[]
}


export interface PublishPlacementMetadata {
  title:
    string

  description:
    string

  tags:
    string[]
}


function characterLength(
  value:
    string
): number {
  return [
    ...value
  ].length
}


export function publishPlacementProfile(
  placement:
    PublishPlacement
): PublishPlacementProfile {
  const id =
    publishPlacementSchema.parse(
      placement
    )

  return publishPlacementProfiles[
    id
  ]
}


export function defaultPublishPlacementForPlatform(
  platform:
    PublishPlacementProfile['platform'],

  format?:
    TargetFormat
): PublishPlacement {
  if (
    platform === 'youtube'
  ) {
    return format === 'vertical'
      || format === 'square'
      ? 'youtube-short'
      : 'youtube-video'
  }

  if (
    platform === 'instagram'
  ) {
    return format === 'vertical'
      ? 'instagram-reel'
      : 'instagram-feed'
  }

  if (
    platform === 'tiktok'
  ) {
    return 'tiktok-video'
  }

  return 'generic'
}


export function reviewPublishPlacement(
  receipt:
    ExportReceipt,

  placement:
    PublishPlacement,

  metadata:
    PublishPlacementMetadata
): PublishPlacementReview {
  const profile =
    publishPlacementProfile(
      placement
    )

  const issues:
    PublishPlacementIssue[] =
      []

  if (
    !profile.formats.includes(
      receipt.format
    )
  ) {
    issues.push({
      code:
        'format',

      message:
        `${profile.label} does not accept the selected KINAOU ${receipt.format} delivery profile.`
    })
  }

  if (
    receipt.durationMs
    < profile.minimumDurationMs
  ) {
    issues.push({
      code:
        'duration-minimum',

      message:
        `${profile.label} requires a duration of at least ${profile.minimumDurationMs} ms.`
    })
  }

  if (
    profile.maximumDurationMs
      !== null
    && receipt.durationMs
      > profile.maximumDurationMs
  ) {
    issues.push({
      code:
        'duration-maximum',

      message:
        `${profile.label} exceeds the configured KINAOU duration limit of ${profile.maximumDurationMs} ms.`
    })
  }

  const title =
    metadata.title.trim()

  if (
    profile.title.required
    && !title
  ) {
    issues.push({
      code:
        'title-required',

      message:
        `${profile.label} requires a title.`
    })
  }

  if (
    characterLength(
      title
    )
    > profile.title
      .maximumCharacters
  ) {
    issues.push({
      code:
        'title-length',

      message:
        `${profile.label} title exceeds ${profile.title.maximumCharacters} characters.`
    })
  }

  const description =
    metadata.description.trim()

  if (
    characterLength(
      description
    )
    > profile.description
      .maximumCharacters
  ) {
    issues.push({
      code:
        'description-length',

      message:
        `${profile.label} description exceeds ${profile.description.maximumCharacters} characters.`
    })
  }

  if (
    metadata.tags.length
    > profile.tags
      .maximumCount
  ) {
    issues.push({
      code:
        'tag-count',

      message:
        `${profile.label} exceeds the configured limit of ${profile.tags.maximumCount} tags.`
    })
  }

  if (
    metadata.tags.some(
      tag =>
        characterLength(
          tag
        )
        > profile.tags
          .maximumCharactersEach
    )
  ) {
    issues.push({
      code:
        'tag-length',

      message:
        `${profile.label} contains a tag longer than ${profile.tags.maximumCharactersEach} characters.`
    })
  }

  return {
    placement:
      profile.id,

    platform:
      profile.platform,

    ready:
      issues.length
      === 0,

    preferredFormat:
      profile.preferredFormat,

    issues
  }
}
