export type AvatarRenderQuality =
  | 'preview'
  | 'final'

export type AvatarRenderBackend =
  | 'local-preview'
  | 'local-generative'
  | 'cloud-byok'

export interface AvatarRenderAvailability {
  localPreview:
    boolean
  localGenerative:
    boolean
  cloudByok:
    boolean
  userProvidedCloudCredential:
    boolean
}

export interface AvatarRenderSelection {
  quality:
    AvatarRenderQuality
  backend:
    AvatarRenderBackend

  /**
   * KINAOU must never become responsible
   * for recurring inference charges.
   */
  inferenceBilling:
    'none'
    | 'user'

  reason:
    string
}

export function chooseAvatarRenderBackend(
  quality: AvatarRenderQuality,
  availability: AvatarRenderAvailability
): AvatarRenderSelection {
  if (quality === 'preview') {
    if (!availability.localPreview) {
      throw new Error(
        'Local Avatar preview runtime is unavailable'
      )
    }

    return {
      quality,
      backend:
        'local-preview',
      inferenceBilling:
        'none',
      reason:
        'Preview rendering is local-first and must not incur remote inference cost'
    }
  }

  if (
    availability.localGenerative
  ) {
    return {
      quality,
      backend:
        'local-generative',
      inferenceBilling:
        'none',
      reason:
        'Final rendering prefers the installed local photoreal generative engine'
    }
  }

  if (
    availability.cloudByok
    && availability
      .userProvidedCloudCredential
  ) {
    return {
      quality,
      backend:
        'cloud-byok',
      inferenceBilling:
        'user',
      reason:
        'Optional cloud rendering uses only credentials supplied by the user'
    }
  }

  throw new Error(
    'No final-quality Avatar render backend is available'
  )
}

export function assertNoPlatformInferenceCost(
  selection: AvatarRenderSelection
): AvatarRenderSelection {
  if (
    selection.backend
      === 'cloud-byok'
    && selection.inferenceBilling
      !== 'user'
  ) {
    throw new Error(
      'Cloud Avatar rendering must be billed directly to the user'
    )
  }

  if (
    selection.backend
      !== 'cloud-byok'
    && selection.inferenceBilling
      !== 'none'
  ) {
    throw new Error(
      'Local Avatar rendering must not declare inference billing'
    )
  }

  return selection
}
