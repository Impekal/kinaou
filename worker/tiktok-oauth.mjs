import {
  createHash,
  randomBytes
} from 'node:crypto'


export const TIKTOK_VIDEO_PUBLISH_SCOPE =
  'video.publish'


export const TIKTOK_AUTHORIZATION_ENDPOINT =
  'https://www.tiktok.com/v2/auth/authorize/'


export const TIKTOK_TOKEN_ENDPOINT =
  'https://open.tiktokapis.com/v2/oauth/token/'


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


function requiredSecret(
  value,
  label
) {
  const secret =
    requiredText(
      value,
      label,
      20_000
    )

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


export function canonicalTikTokLoopbackRedirect(
  value
) {
  const raw =
    requiredText(
      value,
      'TikTok OAuth redirect URI',
      500
    )

  let url

  try {
    url =
      new URL(
        raw
      )
  } catch {
    throw new Error(
      'TikTok OAuth redirect URI is invalid'
    )
  }


  const hostname =
    url.hostname
      .toLowerCase()


  if (
    ![
      'http:',
      'https:'
    ].includes(
      url.protocol
    )
    || ![
      '127.0.0.1',
      'localhost'
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
      'TikTok Desktop OAuth requires a localhost or 127.0.0.1 loopback redirect with an explicit port'
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


export function createTikTokPkce(
  bytes =
    randomBytes
) {
  /*
   * base64url uses only a subset of the RFC unreserved characters TikTok
   * accepts for desktop code_verifier values.
   */
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
      'Generated TikTok PKCE verifier is outside the supported limits'
    )
  }


  /*
   * TikTok Desktop Login Kit explicitly documents the S256 challenge as
   * hexadecimal SHA-256, rather than base64url.
   */
  const challenge =
    createHash(
      'sha256'
    )
      .update(
        verifier,
        'ascii'
      )
      .digest(
        'hex'
      )


  return {
    verifier,
    challenge,
    method:
      'S256'
  }
}


export function createTikTokOAuthState(
  bytes =
    randomBytes
) {
  return base64Url(
    bytes(
      32
    )
  )
}


export function buildTikTokAuthorizationUrl({
  clientKey,
  redirectUri,
  state,
  codeChallenge
}) {
  const key =
    requiredText(
      clientKey,
      'TikTok client key',
      500
    )


  const redirect =
    canonicalTikTokLoopbackRedirect(
      redirectUri
    )


  const csrfState =
    requiredText(
      state,
      'TikTok OAuth state',
      500
    )


  const challenge =
    requiredText(
      codeChallenge,
      'TikTok PKCE challenge',
      128
    )


  if (
    !/^[a-f0-9]{64}$/.test(
      challenge
    )
  ) {
    throw new Error(
      'TikTok PKCE challenge must be a hexadecimal SHA-256 digest'
    )
  }


  const url =
    new URL(
      TIKTOK_AUTHORIZATION_ENDPOINT
    )


  url.searchParams.set(
    'client_key',
    key
  )

  url.searchParams.set(
    'response_type',
    'code'
  )

  url.searchParams.set(
    'scope',
    TIKTOK_VIDEO_PUBLISH_SCOPE
  )

  url.searchParams.set(
    'redirect_uri',
    redirect
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
      'TikTok OAuth response did not include granted scopes'
    )
  }


  const scopes =
    [
      ...new Set(
        value
          .split(
            ','
          )
          .map(
            scope =>
              scope.trim()
          )
          .filter(
            Boolean
          )
      )
    ]


  if (
    !scopes.includes(
      TIKTOK_VIDEO_PUBLISH_SCOPE
    )
  ) {
    throw new Error(
      'TikTok OAuth grant does not include video.publish'
    )
  }


  return scopes
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
      'Invalid TikTok OAuth token response'
    )
  }


  const accessToken =
    requiredSecret(
      value.access_token,
      'TikTok access token'
    )


  if (
    value.token_type !== 'Bearer'
  ) {
    throw new Error(
      'TikTok OAuth token type must be Bearer'
    )
  }


  if (
    !Number.isInteger(
      value.expires_in
    )
    || value.expires_in <= 0
  ) {
    throw new Error(
      'TikTok access token expiry is invalid'
    )
  }


  const openId =
    requiredText(
      value.open_id,
      'TikTok open id',
      500
    )


  const scopes =
    parseScopes(
      value.scope
    )


  let refreshToken

  if (
    value.refresh_token
      !== undefined
  ) {
    refreshToken =
      requiredSecret(
        value.refresh_token,
        'TikTok refresh token'
      )
  }


  if (
    requireRefreshToken
    && !refreshToken
  ) {
    throw new Error(
      'TikTok OAuth exchange did not return a refresh token'
    )
  }


  if (
    !Number.isInteger(
      value.refresh_expires_in
    )
    || value.refresh_expires_in <= 0
  ) {
    throw new Error(
      'TikTok refresh token expiry is invalid'
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

    refreshExpiresIn:
      value.refresh_expires_in,

    openId,

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
      typeof payload
        ?.error_description === 'string'
        ? payload.error_description
        : typeof payload
            ?.error === 'string'
          ? payload.error
          : `HTTP ${response.status}`


    throw new Error(
      `${label} failed: ${detail}`
    )
  }


  return payload
}


export async function exchangeTikTokAuthorizationCode({
  fetchImpl =
    fetch,

  clientKey,
  clientSecret,
  redirectUri,
  code,
  codeVerifier,
  signal
}) {
  const key =
    requiredText(
      clientKey,
      'TikTok client key',
      500
    )


  const secret =
    requiredSecret(
      clientSecret,
      'TikTok client secret'
    )


  const redirect =
    canonicalTikTokLoopbackRedirect(
      redirectUri
    )


  const authorizationCode =
    requiredSecret(
      code,
      'TikTok authorization code'
    )


  const verifier =
    requiredText(
      codeVerifier,
      'TikTok PKCE verifier',
      128
    )


  if (
    verifier.length < 43
  ) {
    throw new Error(
      'TikTok PKCE verifier must contain at least 43 characters'
    )
  }


  const body =
    new URLSearchParams({
      client_key:
        key,

      client_secret:
        secret,

      code:
        authorizationCode,

      grant_type:
        'authorization_code',

      redirect_uri:
        redirect,

      code_verifier:
        verifier
    })


  const response =
    await fetchImpl(
      TIKTOK_TOKEN_ENDPOINT,
      {
        method:
          'POST',

        headers: {
          'content-type':
            'application/x-www-form-urlencoded',

          'cache-control':
            'no-cache'
        },

        body:
          body.toString(),

        signal
      }
    )


  return parseTokenResponse(
    await readJsonResponse(
      response,
      'TikTok OAuth code exchange'
    ),
    {
      requireRefreshToken:
        true
    }
  )
}


export async function refreshTikTokAccessToken({
  fetchImpl =
    fetch,

  clientKey,
  clientSecret,
  refreshToken,
  signal
}) {
  const body =
    new URLSearchParams({
      client_key:
        requiredText(
          clientKey,
          'TikTok client key',
          500
        ),

      client_secret:
        requiredSecret(
          clientSecret,
          'TikTok client secret'
        ),

      grant_type:
        'refresh_token',

      refresh_token:
        requiredSecret(
          refreshToken,
          'TikTok refresh token'
        )
    })


  const response =
    await fetchImpl(
      TIKTOK_TOKEN_ENDPOINT,
      {
        method:
          'POST',

        headers: {
          'content-type':
            'application/x-www-form-urlencoded',

          'cache-control':
            'no-cache'
        },

        body:
          body.toString(),

        signal
      }
    )


  return parseTokenResponse(
    await readJsonResponse(
      response,
      'TikTok OAuth token refresh'
    ),
    {
      /*
       * TikTok may rotate the refresh token. Require and persist the token
       * returned by every successful refresh.
       */
      requireRefreshToken:
        true
    }
  )
}
