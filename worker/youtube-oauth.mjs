import {
  createHash,
  randomBytes
} from 'node:crypto'


export const YOUTUBE_UPLOAD_SCOPE =
  'https://www.googleapis.com/auth/youtube.upload'


export const GOOGLE_AUTHORIZATION_ENDPOINT =
  'https://accounts.google.com/o/oauth2/v2/auth'


export const GOOGLE_TOKEN_ENDPOINT =
  'https://oauth2.googleapis.com/token'


function requiredText(
  value,
  label,
  maximum = 20_000
) {
  if (
    typeof value !== 'string'
    || !value.trim()
    || value !== value.trim()
    || value.length > maximum
  ) {
    throw new Error(
      `${label} is invalid`
    )
  }

  return value
}


function canonicalLoopbackRedirect(
  value
) {
  const raw =
    requiredText(
      value,
      'OAuth redirect URI',
      500
    )

  const url =
    new URL(
      raw
    )

  const hostname =
    url.hostname
      .toLowerCase()

  if (
    url.protocol !== 'http:'
    || ![
      '127.0.0.1',
      '[::1]',
      '::1'
    ].includes(
      hostname
    )
    || !url.port
    || url.username
    || url.password
    || url.search
    || url.hash
  ) {
    throw new Error(
      'YouTube OAuth requires a loopback HTTP redirect with an explicit port'
    )
  }

  return url.toString()
}


function base64Url(
  value
) {
  return Buffer
    .from(
      value
    )
    .toString(
      'base64url'
    )
}


export function createYouTubePkce(
  bytes =
    randomBytes
) {
  const verifier =
    base64Url(
      bytes(
        64
      )
    )

  if (
    verifier.length < 43
    || verifier.length > 128
  ) {
    throw new Error(
      'Generated PKCE verifier is outside the OAuth specification limits'
    )
  }

  const challenge =
    createHash(
      'sha256'
    )
      .update(
        verifier,
        'ascii'
      )
      .digest(
        'base64url'
      )

  return {
    verifier,
    challenge,
    method:
      'S256'
  }
}


export function createYouTubeOAuthState(
  bytes =
    randomBytes
) {
  return base64Url(
    bytes(
      32
    )
  )
}


export function buildYouTubeAuthorizationUrl({
  clientId,
  redirectUri,
  state,
  codeChallenge
}) {
  const id =
    requiredText(
      clientId,
      'Google OAuth client ID',
      500
    )

  const redirect =
    canonicalLoopbackRedirect(
      redirectUri
    )

  const csrfState =
    requiredText(
      state,
      'OAuth state',
      500
    )

  const challenge =
    requiredText(
      codeChallenge,
      'PKCE challenge',
      500
    )

  const url =
    new URL(
      GOOGLE_AUTHORIZATION_ENDPOINT
    )

  url.searchParams.set(
    'client_id',
    id
  )

  url.searchParams.set(
    'redirect_uri',
    redirect
  )

  url.searchParams.set(
    'response_type',
    'code'
  )

  url.searchParams.set(
    'scope',
    YOUTUBE_UPLOAD_SCOPE
  )

  /*
   * KINAOU stores the refresh token outside the project so the worker can
   * obtain short-lived access tokens without asking the user to reconnect
   * for every explicit upload.
   */
  url.searchParams.set(
    'access_type',
    'offline'
  )

  /*
   * Connecting YouTube is an explicit user action. Request consent here so
   * reconnecting can yield a fresh offline grant when an earlier refresh
   * token is unavailable or has been revoked.
   */
  url.searchParams.set(
    'prompt',
    'consent'
  )

  url.searchParams.set(
    'state',
    csrfState
  )

  url.searchParams.set(
    'code_challenge',
    challenge
  )

  url.searchParams.set(
    'code_challenge_method',
    'S256'
  )

  return url.toString()
}


function parseScopes(
  value
) {
  if (
    typeof value !== 'string'
    || !value.trim()
  ) {
    throw new Error(
      'Google OAuth response did not include granted scopes'
    )
  }

  return [
    ...new Set(
      value
        .trim()
        .split(
          /\s+/
        )
        .filter(
          Boolean
        )
    )
  ]
}


function parseTokenResponse(
  value,
  {
    requireRefreshToken
  }
) {
  if (
    !value
    || typeof value !== 'object'
    || Array.isArray(
      value
    )
  ) {
    throw new Error(
      'Invalid Google OAuth token response'
    )
  }

  const accessToken =
    requiredText(
      value.access_token,
      'Google OAuth access token'
    )

  if (
    value.token_type !== 'Bearer'
  ) {
    throw new Error(
      'Google OAuth token type must be Bearer'
    )
  }

  if (
    !Number.isInteger(
      value.expires_in
    )
    || value.expires_in <= 0
  ) {
    throw new Error(
      'Google OAuth access token expiry is invalid'
    )
  }

  const scopes =
    parseScopes(
      value.scope
    )

  if (
    !scopes.includes(
      YOUTUBE_UPLOAD_SCOPE
    )
  ) {
    throw new Error(
      'Google OAuth grant does not include youtube.upload'
    )
  }

  let refreshToken

  if (
    value.refresh_token
    !== undefined
  ) {
    refreshToken =
      requiredText(
        value.refresh_token,
        'Google OAuth refresh token'
      )
  }

  if (
    requireRefreshToken
    && !refreshToken
  ) {
    throw new Error(
      'Installed YouTube OAuth exchange did not return a refresh token'
    )
  }

  return {
    accessToken,

    ...(refreshToken
      ? {
          refreshToken
        }
      : {}),

    expiresIn:
      value.expires_in,

    scopes,

    tokenType:
      'Bearer'
  }
}


async function readJsonResponse(
  response,
  label
) {
  const raw =
    await response.text()

  let payload

  try {
    payload =
      JSON.parse(
        raw
      )
  } catch {
    throw new Error(
      `${label} returned invalid JSON`
    )
  }

  if (
    !response.ok
  ) {
    const detail =
      typeof payload?.error_description
        === 'string'
        ? payload.error_description
        : typeof payload?.error
            === 'string'
          ? payload.error
          : `HTTP ${response.status}`

    throw new Error(
      `${label} failed: ${detail}`
    )
  }

  return payload
}


export async function exchangeYouTubeAuthorizationCode({
  fetchImpl =
    fetch,

  clientId,
  redirectUri,
  code,
  codeVerifier,
  signal
}) {
  const id =
    requiredText(
      clientId,
      'Google OAuth client ID',
      500
    )

  const redirect =
    canonicalLoopbackRedirect(
      redirectUri
    )

  const authorizationCode =
    requiredText(
      code,
      'Google OAuth authorization code'
    )

  const verifier =
    requiredText(
      codeVerifier,
      'PKCE code verifier',
      128
    )

  if (
    verifier.length < 43
  ) {
    throw new Error(
      'PKCE code verifier must contain at least 43 characters'
    )
  }

  const body =
    new URLSearchParams({
      client_id:
        id,

      code:
        authorizationCode,

      code_verifier:
        verifier,

      grant_type:
        'authorization_code',

      redirect_uri:
        redirect
    })

  const response =
    await fetchImpl(
      GOOGLE_TOKEN_ENDPOINT,
      {
        method:
          'POST',

        headers: {
          'content-type':
            'application/x-www-form-urlencoded'
        },

        body:
          body.toString(),

        signal
      }
    )

  return parseTokenResponse(
    await readJsonResponse(
      response,
      'Google OAuth code exchange'
    ),
    {
      requireRefreshToken:
        true
    }
  )
}


export async function refreshYouTubeAccessToken({
  fetchImpl =
    fetch,

  clientId,
  refreshToken,
  signal
}) {
  const body =
    new URLSearchParams({
      client_id:
        requiredText(
          clientId,
          'Google OAuth client ID',
          500
        ),

      refresh_token:
        requiredText(
          refreshToken,
          'Google OAuth refresh token'
        ),

      grant_type:
        'refresh_token'
    })

  const response =
    await fetchImpl(
      GOOGLE_TOKEN_ENDPOINT,
      {
        method:
          'POST',

        headers: {
          'content-type':
            'application/x-www-form-urlencoded'
        },

        body:
          body.toString(),

        signal
      }
    )

  return parseTokenResponse(
    await readJsonResponse(
      response,
      'Google OAuth token refresh'
    ),
    {
      requireRefreshToken:
        false
    }
  )
}
