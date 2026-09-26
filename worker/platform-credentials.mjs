const platforms =
  [
    'youtube',
    'instagram',
    'tiktok'
  ]


const environmentKeys = {
  youtube: {
    access:
      'KINAOU_YOUTUBE_ACCESS_TOKEN',

    refresh:
      'KINAOU_YOUTUBE_REFRESH_TOKEN',

    account:
      'KINAOU_YOUTUBE_ACCOUNT_LABEL',

    scopes:
      'KINAOU_YOUTUBE_SCOPES',

    expires:
      'KINAOU_YOUTUBE_TOKEN_EXPIRES_AT'
  },

  instagram: {
    access:
      'KINAOU_INSTAGRAM_ACCESS_TOKEN',

    refresh:
      'KINAOU_INSTAGRAM_REFRESH_TOKEN',

    account:
      'KINAOU_INSTAGRAM_ACCOUNT_LABEL',

    scopes:
      'KINAOU_INSTAGRAM_SCOPES',

    expires:
      'KINAOU_INSTAGRAM_TOKEN_EXPIRES_AT'
  },

  tiktok: {
    access:
      'KINAOU_TIKTOK_ACCESS_TOKEN',

    refresh:
      'KINAOU_TIKTOK_REFRESH_TOKEN',

    account:
      'KINAOU_TIKTOK_ACCOUNT_LABEL',

    scopes:
      'KINAOU_TIKTOK_SCOPES',

    expires:
      'KINAOU_TIKTOK_TOKEN_EXPIRES_AT'
  }
}


function platform(
  value
) {
  if (
    !platforms.includes(
      value
    )
  ) {
    throw new Error(
      'Unsupported platform credential'
    )
  }

  return value
}


function optionalSecret(
  value,
  label
) {
  if (
    value === undefined
    || value === null
    || String(value).trim()
      === ''
  ) {
    return undefined
  }

  const secret =
    String(value)
      .trim()

  if (
    secret.length > 20_000
  ) {
    throw new Error(
      `${label} exceeds the runtime secret limit`
    )
  }

  if (
    /[\r\n]/.test(
      secret
    )
  ) {
    throw new Error(
      `${label} cannot contain line breaks`
    )
  }

  return secret
}


function optionalText(
  value,
  maximum
) {
  if (
    value === undefined
    || value === null
    || String(value).trim()
      === ''
  ) {
    return undefined
  }

  const normalized =
    String(value)
      .trim()

  if (
    normalized.length
    > maximum
  ) {
    throw new Error(
      'Credential metadata exceeds its limit'
    )
  }

  return normalized
}


function scopes(
  value
) {
  if (
    value === undefined
    || value === null
    || String(value).trim()
      === ''
  ) {
    return []
  }

  const result =
    []

  const seen =
    new Set()

  for (
    const raw
    of String(value)
      .split(
        /[\s,]+/
      )
  ) {
    const scope =
      raw.trim()

    if (!scope) {
      continue
    }

    if (
      scope.length > 200
    ) {
      throw new Error(
        'Credential scope exceeds 200 characters'
      )
    }

    if (
      seen.has(
        scope
      )
    ) {
      continue
    }

    seen.add(
      scope
    )

    result.push(
      scope
    )
  }

  if (
    result.length > 50
  ) {
    throw new Error(
      'Credential scope list exceeds 50 entries'
    )
  }

  return result
}


function expiresAt(
  value
) {
  const normalized =
    optionalText(
      value,
      100
    )

  if (!normalized) {
    return undefined
  }

  const date =
    new Date(
      normalized
    )

  if (
    !Number.isFinite(
      date.getTime()
    )
    || date.toISOString()
      !== normalized
  ) {
    throw new Error(
      'Credential expiry must be a canonical ISO timestamp'
    )
  }

  return normalized
}


/*
 * This is worker-internal secret material.
 *
 * It must never be returned through HTTP, written into projects,
 * publish packages, backups, attempts or receipts.
 */
export function resolvePlatformCredentialSecrets(
  platformValue,
  env = process.env
) {
  const id =
    platform(
      platformValue
    )

  const keys =
    environmentKeys[
      id
    ]

  const accessToken =
    optionalSecret(
      env[
        keys.access
      ],
      'Access token'
    )

  const refreshToken =
    optionalSecret(
      env[
        keys.refresh
      ],
      'Refresh token'
    )

  if (
    !accessToken
    && !refreshToken
  ) {
    return null
  }

  return {
    platform:
      id,

    provider:
      'environment',

    ...(accessToken
      ? {
          accessToken
        }
      : {}),

    ...(refreshToken
      ? {
          refreshToken
        }
      : {}),

    ...(optionalText(
      env[
        keys.account
      ],
      200
    )
      ? {
          accountLabel:
            optionalText(
              env[
                keys.account
              ],
              200
            )
        }
      : {}),

    scopes:
      scopes(
        env[
          keys.scopes
        ]
      ),

    ...(expiresAt(
      env[
        keys.expires
      ]
    )
      ? {
          expiresAt:
            expiresAt(
              env[
                keys.expires
              ]
            )
        }
      : {})
  }
}


/*
 * Safe public projection.
 *
 * Only availability metadata leaves the worker process.
 * No token value and no credential environment variable name is exposed.
 */
export function publicPlatformCredentialStatus(
  platformValue,
  env = process.env
) {
  const id =
    platform(
      platformValue
    )

  const secret =
    resolvePlatformCredentialSecrets(
      id,
      env
    )

  if (!secret) {
    return {
      platform:
        id,

      provider:
        'environment',

      state:
        'missing',

      accessTokenAvailable:
        false,

      refreshTokenAvailable:
        false,

      scopes:
        []
    }
  }

  return {
    platform:
      id,

    provider:
      'environment',

    state:
      'available',

    accessTokenAvailable:
      Boolean(
        secret.accessToken
      ),

    refreshTokenAvailable:
      Boolean(
        secret.refreshToken
      ),

    ...(secret.accountLabel
      ? {
          accountLabel:
            secret.accountLabel
        }
      : {}),

    scopes: [
      ...secret.scopes
    ],

    ...(secret.expiresAt
      ? {
          expiresAt:
            secret.expiresAt
        }
      : {})
  }
}


export function listPublicPlatformCredentialStatuses(
  env = process.env
) {
  return platforms.map(
    id =>
      publicPlatformCredentialStatus(
        id,
        env
      )
  )
}
