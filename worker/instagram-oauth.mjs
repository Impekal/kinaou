import {
  randomBytes
} from 'node:crypto'


export const INSTAGRAM_AUTHORIZATION_ENDPOINT =
  'https://www.instagram.com/oauth/authorize'


export const INSTAGRAM_TOKEN_ENDPOINT =
  'https://api.instagram.com/oauth/access_token'


export const INSTAGRAM_GRAPH_ORIGIN =
  'https://graph.instagram.com'


export const INSTAGRAM_REQUIRED_SCOPES = [
  'instagram_business_basic',
  'instagram_business_content_publish'
]


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


function secret(
  value,
  label
) {
  const normalized =
    requiredText(
      value,
      label,
      20_000
    )

  if (
    /[\r\n]/.test(
      normalized
    )
  ) {
    throw new Error(
      `${label} cannot contain line breaks`
    )
  }

  return normalized
}


function canonicalHttpsRedirect(
  value
) {
  const raw =
    requiredText(
      value,
      'Instagram OAuth redirect URI',
      1000
    )

  const url =
    new URL(
      raw
    )

  if (
    url.protocol !== 'https:'
    || url.username
    || url.password
    || url.hash
  ) {
    throw new Error(
      'Instagram OAuth requires an explicit HTTPS redirect URI'
    )
  }

  return url.toString()
}


function bareHttpsOrigin(
  value
) {
  const raw =
    requiredText(
      value,
      'Instagram Graph origin',
      500
    )

  const url =
    new URL(
      raw
    )

  if (
    url.protocol !== 'https:'
    || url.username
    || url.password
    || url.pathname !== '/'
    || url.search
    || url.hash
  ) {
    throw new Error(
      'Instagram Graph origin must be a bare HTTPS origin'
    )
  }

  return url.origin
}


function apiVersion(
  value
) {
  const version =
    requiredText(
      value,
      'Instagram API version',
      30
    )

  if (
    !/^v[0-9]+\.[0-9]+$/
      .test(
        version
      )
  ) {
    throw new Error(
      'Instagram API version must use vN.N format'
    )
  }

  return version
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


export function createInstagramOAuthState(
  bytes =
    randomBytes
) {
  const state =
    base64Url(
      bytes(
        32
      )
    )

  if (
    state.length < 32
    || state.length > 200
  ) {
    throw new Error(
      'Generated Instagram OAuth state is invalid'
    )
  }

  return state
}


export function buildInstagramAuthorizationUrl({
  clientId,
  redirectUri,
  state
}) {
  const id =
    requiredText(
      clientId,
      'Instagram App ID',
      500
    )

  const redirect =
    canonicalHttpsRedirect(
      redirectUri
    )

  const csrfState =
    requiredText(
      state,
      'Instagram OAuth state',
      500
    )

  const url =
    new URL(
      INSTAGRAM_AUTHORIZATION_ENDPOINT
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
    INSTAGRAM_REQUIRED_SCOPES
      .join(
        ','
      )
  )

  /*
   * Keep this flow on Instagram Login rather than silently falling
   * through to Facebook Login.
   */
  url.searchParams.set(
    'enable_fb_login',
    '0'
  )

  url.searchParams.set(
    'state',
    csrfState
  )

  return url.toString()
}


function safeRemoteDetail(
  value,
  secrets = []
) {
  let result =
    typeof value === 'string'
      ? value
      : String(
          value
        )

  for (
    const credential
    of secrets
  ) {
    if (
      typeof credential === 'string'
      && credential
    ) {
      result =
        result
          .split(
            credential
          )
          .join(
            '[credential]'
          )
    }
  }

  return result
    .replace(
      /access[_ -]?token/gi,
      '[credential]'
    )
    .replace(
      /client[_ -]?secret/gi,
      '[credential]'
    )
    .slice(
      0,
      500
    )
}


async function readJsonResponse(
  response,
  label,
  secrets = []
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
      payload?.error_message
      ?? payload?.error
        ?.message
      ?? payload?.error_description
      ?? payload?.error
      ?? `HTTP ${response.status}`

    throw new Error(
      `${label} failed: ${
        safeRemoteDetail(
          detail,
          secrets
        )
      }`
    )
  }

  return payload
}


function firstTokenRecord(
  value
) {
  if (
    value
    && typeof value === 'object'
    && !Array.isArray(
      value
    )
    && Array.isArray(
      value.data
    )
  ) {
    if (
      value.data.length !== 1
      || !value.data[0]
      || typeof value.data[0]
        !== 'object'
      || Array.isArray(
        value.data[0]
      )
    ) {
      throw new Error(
        'Instagram token response contains invalid data'
      )
    }

    return value.data[0]
  }

  if (
    !value
    || typeof value !== 'object'
    || Array.isArray(
      value
    )
  ) {
    throw new Error(
      'Instagram token response is invalid'
    )
  }

  return value
}


function permissionList(
  value
) {
  if (
    value === undefined
    || value === null
    || value === ''
  ) {
    return null
  }

  const raw =
    Array.isArray(
      value
    )
      ? value
      : String(
          value
        ).split(
          /[\s,]+/
        )

  const permissions =
    [
      ...new Set(
        raw
          .map(
            item =>
              String(
                item
              ).trim()
          )
          .filter(
            Boolean
          )
      )
    ]

  if (
    permissions.some(
      permission =>
        permission.length > 200
    )
  ) {
    throw new Error(
      'Instagram permission response is invalid'
    )
  }

  return permissions
}


function parseShortLivedTokenResponse(
  value
) {
  const record =
    firstTokenRecord(
      value
    )

  const accessToken =
    secret(
      record.access_token,
      'Instagram short-lived access token'
    )

  const permissions =
    permissionList(
      record.permissions
    )

  /*
   * Meta does not consistently include granted permissions in every
   * response shape. When present, however, KINAOU refuses a grant that
   * is already known to be insufficient for publishing.
   */
  if (
    permissions
    && INSTAGRAM_REQUIRED_SCOPES
      .some(
        scope =>
          !permissions.includes(
            scope
          )
      )
  ) {
    throw new Error(
      'Instagram OAuth grant is missing a required publishing permission'
    )
  }

  const userId =
    record.user_id === undefined
      ? undefined
      : String(
          record.user_id
        ).trim()

  return {
    accessToken,

    ...(userId
      ? {
          userId
        }
      : {}),

    ...(permissions
      ? {
          scopes:
            permissions
        }
      : {})
  }
}


function parseLongLivedTokenResponse(
  value,
  label
) {
  if (
    !value
    || typeof value !== 'object'
    || Array.isArray(
      value
    )
  ) {
    throw new Error(
      `${label} response is invalid`
    )
  }

  const accessToken =
    secret(
      value.access_token,
      `${label} access token`
    )

  if (
    !Number.isSafeInteger(
      value.expires_in
    )
    || value.expires_in <= 0
  ) {
    throw new Error(
      `${label} expiry is invalid`
    )
  }

  return {
    accessToken,

    expiresIn:
      value.expires_in,

    ...(typeof value.token_type === 'string'
      && value.token_type.trim()
      ? {
          tokenType:
            value.token_type
              .trim()
        }
      : {})
  }
}


export async function exchangeInstagramAuthorizationCode({
  fetchImpl =
    fetch,

  clientId,
  clientSecret,
  redirectUri,
  code,
  signal
}) {
  const id =
    requiredText(
      clientId,
      'Instagram App ID',
      500
    )

  const appSecret =
    secret(
      clientSecret,
      'Instagram App Secret'
    )

  const redirect =
    canonicalHttpsRedirect(
      redirectUri
    )

  const authorizationCode =
    secret(
      code,
      'Instagram authorization code'
    )

  const body =
    new URLSearchParams({
      client_id:
        id,

      client_secret:
        appSecret,

      grant_type:
        'authorization_code',

      redirect_uri:
        redirect,

      code:
        authorizationCode
    })


  const response =
    await fetchImpl(
      INSTAGRAM_TOKEN_ENDPOINT,
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


  return parseShortLivedTokenResponse(
    await readJsonResponse(
      response,
      'Instagram OAuth code exchange',
      [
        appSecret,
        authorizationCode
      ]
    )
  )
}


export async function exchangeInstagramLongLivedToken({
  fetchImpl =
    fetch,

  clientSecret,
  shortLivedAccessToken,
  signal
}) {
  const appSecret =
    secret(
      clientSecret,
      'Instagram App Secret'
    )

  const shortToken =
    secret(
      shortLivedAccessToken,
      'Instagram short-lived access token'
    )

  const url =
    new URL(
      '/access_token',
      INSTAGRAM_GRAPH_ORIGIN
    )

  url.searchParams.set(
    'grant_type',
    'ig_exchange_token'
  )

  /*
   * Meta's Instagram token-exchange endpoint currently defines these as
   * query parameters. They are worker-only and must never be logged or
   * copied into projects, requests, attempts or receipts.
   */
  url.searchParams.set(
    'client_secret',
    appSecret
  )

  url.searchParams.set(
    'access_token',
    shortToken
  )


  const response =
    await fetchImpl(
      url,
      {
        method:
          'GET',

        signal
      }
    )


  return parseLongLivedTokenResponse(
    await readJsonResponse(
      response,
      'Instagram long-lived token exchange',
      [
        appSecret,
        shortToken
      ]
    ),
    'Instagram long-lived token'
  )
}


export async function refreshInstagramLongLivedToken({
  fetchImpl =
    fetch,

  accessToken,
  signal
}) {
  const currentToken =
    secret(
      accessToken,
      'Instagram long-lived access token'
    )

  const url =
    new URL(
      '/refresh_access_token',
      INSTAGRAM_GRAPH_ORIGIN
    )

  url.searchParams.set(
    'grant_type',
    'ig_refresh_token'
  )

  url.searchParams.set(
    'access_token',
    currentToken
  )


  const response =
    await fetchImpl(
      url,
      {
        method:
          'GET',

        signal
      }
    )


  return parseLongLivedTokenResponse(
    await readJsonResponse(
      response,
      'Instagram long-lived token refresh',
      [
        currentToken
      ]
    ),
    'Instagram refreshed token'
  )
}


export async function discoverInstagramProfessionalAccount({
  fetchImpl =
    fetch,

  accessToken,
  origin =
    INSTAGRAM_GRAPH_ORIGIN,

  version,
  signal
}) {
  const token =
    secret(
      accessToken,
      'Instagram access token'
    )

  const graph =
    bareHttpsOrigin(
      origin
    )

  const api =
    apiVersion(
      version
    )

  const url =
    new URL(
      `${graph}/${api}/me`
    )

  /*
   * Keep the discovery request deliberately small. These are public
   * identity fields required to show the connected professional account.
   */
  url.searchParams.set(
    'fields',
    'id,username,name,profile_picture_url'
  )


  const response =
    await fetchImpl(
      url,
      {
        method:
          'GET',

        headers: {
          authorization:
            `Bearer ${token}`
        },

        signal
      }
    )


  const payload =
    await readJsonResponse(
      response,
      'Instagram professional account discovery',
      [
        token
      ]
    )


  const accountId =
    requiredText(
      String(
        payload?.id
        ?? ''
      ),
      'Instagram professional account id',
      300
    )

  const username =
    requiredText(
      payload?.username,
      'Instagram professional account username',
      200
    )


  const name =
    typeof payload?.name === 'string'
      && payload.name.trim()
      ? payload.name
          .trim()
          .slice(
            0,
            300
          )
      : undefined


  const profilePictureUrl =
    typeof payload?.profile_picture_url
      === 'string'
      && payload.profile_picture_url
        .trim()
      ? payload.profile_picture_url
          .trim()
          .slice(
            0,
            5000
          )
      : undefined


  return {
    platform:
      'instagram',

    accountId,

    username,

    accountLabel:
      `@${username}`,

    ...(name
      ? {
          name
        }
      : {}),

    ...(profilePictureUrl
      ? {
          profilePictureUrl
        }
      : {})
  }
}
