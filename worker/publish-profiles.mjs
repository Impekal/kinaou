const placements =
  new Set([
    'youtube-video',
    'youtube-short',
    'instagram-reel',
    'instagram-feed',
    'tiktok-video',
    'generic'
  ])


export const publishPlacementProfiles = {
  'youtube-video': {
    id:
      'youtube-video',

    platform:
      'youtube',

    preferredFormat:
      'landscape',

    formats:
      [
        'landscape',
        'vertical',
        'square'
      ],

    minimumDurationMs:
      1,

    maximumDurationMs:
      null,

    titleMaximum:
      100,

    descriptionMaximum:
      5000,

    tagMaximumCount:
      30,

    tagMaximumCharacters:
      80
  },

  'youtube-short': {
    id:
      'youtube-short',

    platform:
      'youtube',

    preferredFormat:
      'vertical',

    formats:
      [
        'vertical',
        'square'
      ],

    minimumDurationMs:
      1,

    maximumDurationMs:
      180_000,

    titleMaximum:
      100,

    descriptionMaximum:
      5000,

    tagMaximumCount:
      30,

    tagMaximumCharacters:
      80
  },

  'instagram-reel': {
    id:
      'instagram-reel',

    platform:
      'instagram',

    preferredFormat:
      'vertical',

    formats:
      [
        'vertical'
      ],

    minimumDurationMs:
      1,

    maximumDurationMs:
      180_000,

    titleMaximum:
      200,

    descriptionMaximum:
      2200,

    tagMaximumCount:
      30,

    tagMaximumCharacters:
      80
  },

  'instagram-feed': {
    id:
      'instagram-feed',

    platform:
      'instagram',

    preferredFormat:
      'square',

    formats:
      [
        'square',
        'vertical'
      ],

    minimumDurationMs:
      1,

    maximumDurationMs:
      60_000,

    titleMaximum:
      200,

    descriptionMaximum:
      2200,

    tagMaximumCount:
      30,

    tagMaximumCharacters:
      80
  },

  'tiktok-video': {
    id:
      'tiktok-video',

    platform:
      'tiktok',

    preferredFormat:
      'vertical',

    formats:
      [
        'vertical'
      ],

    minimumDurationMs:
      1,

    maximumDurationMs:
      600_000,

    titleMaximum:
      200,

    descriptionMaximum:
      2200,

    tagMaximumCount:
      30,

    tagMaximumCharacters:
      80
  },

  generic: {
    id:
      'generic',

    platform:
      'generic',

    preferredFormat:
      'landscape',

    formats:
      [
        'landscape',
        'vertical',
        'square'
      ],

    minimumDurationMs:
      1,

    maximumDurationMs:
      null,

    titleMaximum:
      200,

    descriptionMaximum:
      5000,

    tagMaximumCount:
      30,

    tagMaximumCharacters:
      80
  }
}


export function validatePublishPlacement(
  value
) {
  if (
    typeof value !== 'string'
    || !placements.has(
      value
    )
  ) {
    throw new Error(
      'Publish placement is not supported'
    )
  }

  return value
}


function length(
  value
) {
  return [
    ...value
  ].length
}


export function reviewPublishPlacement(
  receipt,
  placement,
  metadata
) {
  const id =
    validatePublishPlacement(
      placement
    )

  const profile =
    publishPlacementProfiles[
      id
    ]

  const issues =
    []

  if (
    !profile.formats.includes(
      receipt.format
    )
  ) {
    issues.push(
      'format'
    )
  }

  if (
    receipt.durationMs
    < profile.minimumDurationMs
  ) {
    issues.push(
      'duration-minimum'
    )
  }

  if (
    profile.maximumDurationMs
      !== null
    && receipt.durationMs
      > profile.maximumDurationMs
  ) {
    issues.push(
      'duration-maximum'
    )
  }

  if (
    length(
      metadata.title.trim()
    )
    > profile.titleMaximum
  ) {
    issues.push(
      'title-length'
    )
  }

  if (
    length(
      metadata.description.trim()
    )
    > profile.descriptionMaximum
  ) {
    issues.push(
      'description-length'
    )
  }

  if (
    metadata.tags.length
    > profile.tagMaximumCount
  ) {
    issues.push(
      'tag-count'
    )
  }

  if (
    metadata.tags.some(
      tag =>
        length(
          tag
        )
        > profile.tagMaximumCharacters
    )
  ) {
    issues.push(
      'tag-length'
    )
  }

  return {
    placement:
      id,

    platform:
      profile.platform,

    preferredFormat:
      profile.preferredFormat,

    ready:
      issues.length
      === 0,

    issues
  }
}
