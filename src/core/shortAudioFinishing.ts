import {
  z
} from 'zod'

import {
  defaultAudioDucking,
  validateAudioDucking,
  type AudioDuckingSettings
} from './audioDucking'

import {
  defaultLoudnessNormalization,
  validateLoudnessNormalization,
  type LoudnessNormalizationSettings
} from './audioLoudness'

import {
  parseProject,
  type KinaouProject
} from './project'

import {
  projectShortDerivativeLineage
} from './shortDerivative'

import {
  projectShortDerivativeMaterialization
} from './shortDerivativeMaterialize'

import type {
  PersistentVersionHistory
} from './versioning'


const storedAudioDuckingSchema =
  z.object({
    enabled:
      z.boolean(),

    reductionDb:
      z.number(),

    attackMs:
      z.number(),

    releaseMs:
      z.number()
  })
  .strict()


const storedLoudnessSchema =
  z.object({
    enabled:
      z.boolean(),

    targetLufs:
      z.number(),

    truePeakDb:
      z.number(),

    loudnessRange:
      z.number()
  })
  .strict()


const storedShortAudioFinishingSchema =
  z.object({
    schemaVersion:
      z.literal(1),

    updatedAt:
      z.string()
        .datetime(),

    audioDucking:
      storedAudioDuckingSchema,

    loudnessNormalization:
      storedLoudnessSchema
  })
  .strict()


export interface ShortAudioFinishingProfile {
  audioDucking:
    AudioDuckingSettings

  loudnessNormalization:
    LoudnessNormalizationSettings
}


export interface ShortAudioFinishingWarning {
  code:
    | 'ducking-without-music'
    | 'ducking-without-speech'

  message:
    string
}


export interface ShortAudioFinishingReview {
  projectKey:
    string

  current:
    ShortAudioFinishingProfile

  proposed:
    ShortAudioFinishingProfile

  warnings:
    ShortAudioFinishingWarning[]
}


function cloneProfile(
  value:
    ShortAudioFinishingProfile
): ShortAudioFinishingProfile {
  return {
    audioDucking: {
      ...value.audioDucking
    },

    loudnessNormalization: {
      ...value.loudnessNormalization
    }
  }
}


function normalizedProfile(
  input:
    ShortAudioFinishingProfile
): ShortAudioFinishingProfile {
  return {
    audioDucking: {
      ...validateAudioDucking(
        {
          ...input.audioDucking
        }
      )
    },

    loudnessNormalization: {
      ...validateLoudnessNormalization(
        {
          ...input
            .loudnessNormalization
        }
      )
    }
  }
}


function assertMaterializedShort(
  project:
    KinaouProject
) {
  if (
    !projectShortDerivativeLineage(
      project
    )
  ) {
    throw new Error(
      'Audio finishing is available only for derivative Short projects'
    )
  }

  if (
    !projectShortDerivativeMaterialization(
      project
    )
  ) {
    throw new Error(
      'The derivative Short must be materialized before audio finishing'
    )
  }
}


export function shortAudioFinishingProjectKey(
  project:
    KinaouProject
): string {
  return JSON.stringify(
    project
  )
}


export function defaultShortAudioFinishingProfile():
  ShortAudioFinishingProfile {
  return {
    audioDucking: {
      ...defaultAudioDucking
    },

    loudnessNormalization: {
      ...defaultLoudnessNormalization
    }
  }
}


export function projectShortAudioFinishing(
  project:
    KinaouProject
): ShortAudioFinishingProfile {
  const parsed =
    storedShortAudioFinishingSchema
      .safeParse(
        project.metadata
          .shortAudioFinishing
      )

  if (!parsed.success) {
    return defaultShortAudioFinishingProfile()
  }

  try {
    return normalizedProfile({
      audioDucking:
        parsed.data
          .audioDucking,

      loudnessNormalization:
        parsed.data
          .loudnessNormalization
    })
  } catch {
    return defaultShortAudioFinishingProfile()
  }
}


function audioWarnings(
  project:
    KinaouProject,

  profile:
    ShortAudioFinishingProfile
): ShortAudioFinishingWarning[] {
  if (
    !profile.audioDucking
      .enabled
  ) {
    return []
  }

  const activeTracks =
    project.tracks.filter(
      track =>
        !track.muted
        && track.clips.length > 0
    )

  const hasMusic =
    activeTracks.some(
      track =>
        track.type
        === 'music'
    )

  const hasSpeech =
    activeTracks.some(
      track =>
        track.type
          === 'voice'
        || track.type
          === 'dialog'
    )

  const warnings:
    ShortAudioFinishingWarning[] =
      []

  if (!hasMusic) {
    warnings.push({
      code:
        'ducking-without-music',

      message:
        'Music ducking is enabled, but the Short has no active music clips.'
    })
  }

  if (!hasSpeech) {
    warnings.push({
      code:
        'ducking-without-speech',

      message:
        'Music ducking is enabled, but the Short has no active voice or dialogue clips.'
    })
  }

  return warnings
}


export function reviewShortAudioFinishing(
  project:
    KinaouProject,

  proposed:
    ShortAudioFinishingProfile
): ShortAudioFinishingReview {
  assertMaterializedShort(
    project
  )

  const current =
    projectShortAudioFinishing(
      project
    )

  const normalized =
    normalizedProfile(
      proposed
    )

  if (
    JSON.stringify(
      current
    )
    === JSON.stringify(
      normalized
    )
  ) {
    throw new Error(
      'Short audio finishing proposal contains no changes'
    )
  }

  return {
    projectKey:
      shortAudioFinishingProjectKey(
        project
      ),

    current:
      cloneProfile(
        current
      ),

    proposed:
      cloneProfile(
        normalized
      ),

    warnings:
      audioWarnings(
        project,
        normalized
      )
  }
}


export function applyShortAudioFinishing(
  project:
    KinaouProject,

  profile:
    ShortAudioFinishingProfile,

  now =
    new Date()
): KinaouProject {
  assertMaterializedShort(
    project
  )

  const normalized =
    normalizedProfile(
      profile
    )

  const timestamp =
    now.toISOString()

  return parseProject({
    ...project,

    updatedAt:
      timestamp,

    metadata: {
      ...project.metadata,

      shortAudioFinishing: {
        schemaVersion:
          1,

        updatedAt:
          timestamp,

        audioDucking: {
          ...normalized
            .audioDucking
        },

        loudnessNormalization: {
          ...normalized
            .loudnessNormalization
        }
      }
    }
  })
}


export function commitShortAudioFinishingReview(
  project:
    KinaouProject,

  review:
    ShortAudioFinishingReview,

  history:
    Pick<
      PersistentVersionHistory,
      'snapshot'
    >,

  persist:
    (
      project:
        KinaouProject
    ) => void,

  now =
    new Date()
): KinaouProject {
  if (
    review.projectKey
    !== shortAudioFinishingProjectKey(
      project
    )
  ) {
    throw new Error(
      'The Short changed after audio finishing review. Review the settings again before applying.'
    )
  }

  /*
   * Revalidate the proposed settings against the current project before
   * consuming a history slot.
   */
  const revalidated =
    reviewShortAudioFinishing(
      project,
      review.proposed
    )

  const next =
    applyShortAudioFinishing(
      project,
      revalidated.proposed,
      now
    )

  history.snapshot(
    project,
    'Before Short audio finishing',
    'system'
  )

  persist(
    next
  )

  return next
}


export function projectUsesShortAudioFinishing(
  project:
    KinaouProject
): boolean {
  return Boolean(
    projectShortDerivativeLineage(
      project
    )
    && projectShortDerivativeMaterialization(
      project
    )
  )
}


export function resolveShortRenderAudioSettings(
  project:
    KinaouProject,

  fallback:
    ShortAudioFinishingProfile
): ShortAudioFinishingProfile {
  if (
    projectUsesShortAudioFinishing(
      project
    )
  ) {
    return projectShortAudioFinishing(
      project
    )
  }

  return normalizedProfile(
    fallback
  )
}
