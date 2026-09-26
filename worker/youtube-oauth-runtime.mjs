import http from 'node:http'

import crypto from 'node:crypto'

import {
  YOUTUBE_UPLOAD_SCOPE,
  buildYouTubeAuthorizationUrl,
  createYouTubeOAuthState,
  createYouTubePkce,
  exchangeYouTubeAuthorizationCode,
  refreshYouTubeAccessToken
} from './youtube-oauth.mjs'


const SESSION_LIFETIME_MS =
  10 * 60 * 1000


const ACCESS_TOKEN_SAFETY_MS =
  60 * 1000


function requiredClientId(
  value
) {
  if (
    typeof value !== 'string'
    || !value.trim()
    || value !== value.trim()
    || value.length > 500
  ) {
    throw new Error(
      'KINAOU_YOUTUBE_CLIENT_ID is not configured'
    )
  }

  return value
}


function publicError(
  error
) {
  const message =
    error instanceof Error
      ? error.message
      : String(
          error
        )

  return message
    .replace(
      /access[_ -]?token/gi,
      '[credential]'
    )
    .replace(
      /refresh[_ -]?token/gi,
      '[credential]'
    )
    .slice(
      0,
      500
    )
}


function htmlResponse(
  response,
  status,
  title,
  body
) {
  response.statusCode =
    status

  response.setHeader(
    'content-type',
    'text/html; charset=utf-8'
  )

  response.setHeader(
    'cache-control',
    'no-store'
  )

  response.end(
    `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${title}</title>
</head>
<body>
<h1>${title}</h1>
<p>${body}</p>
<p>You can close this window and return to KINAOU.</p>
</body>
</html>`
  )
}


export function createYouTubeOAuthRuntime({
  clientId,

  keychain,

  fetchImpl =
    fetch,

  now =
    () =>
      new Date(),

  randomUUID =
    () =>
      crypto.randomUUID(),

  createServer =
    handler =>
      http.createServer(
        handler
      )
}) {
  if (
    !keychain
    || typeof keychain
      .storeRefreshToken
      !== 'function'
    || typeof keychain
      .readRefreshToken
      !== 'function'
    || typeof keychain
      .deleteRefreshToken
      !== 'function'
  ) {
    throw new Error(
      'YouTube OAuth runtime requires a credential store'
    )
  }


  let server =
    null

  let session =
    null

  let expiryTimer =
    null

  let access =
    null


  function clearTimer() {
    if (
      expiryTimer
    ) {
      clearTimeout(
        expiryTimer
      )

      expiryTimer =
        null
    }
  }


  async function closeServer() {
    clearTimer()

    if (
      !server
    ) {
      return
    }

    const active =
      server

    server =
      null

    await new Promise(
      resolve => {
        active.close(
          () =>
            resolve()
        )
      }
    ).catch(
      () => {}
    )
  }


  function publicSession() {
    if (!session) {
      return {
        state:
          'idle'
      }
    }

    return {
      sessionId:
        session.sessionId,

      state:
        session.state,

      createdAt:
        session.createdAt,

      expiresAt:
        session.expiresAt,

      ...(session.authorizationUrl
        ? {
            authorizationUrl:
              session.authorizationUrl
          }
        : {}),

      ...(session.connectedAt
        ? {
            connectedAt:
              session.connectedAt
          }
        : {}),

      ...(session.error
        ? {
            error:
              session.error
          }
        : {})
    }
  }


  async function failSession(
    error
  ) {
    if (
      session
    ) {
      session = {
        ...session,

        state:
          'failed',

        error:
          publicError(
            error
          )
      }
    }

    await closeServer()
  }


  async function start() {
    requiredClientId(
      clientId
    )

    if (
      session?.state
      === 'awaiting-user'
    ) {
      throw new Error(
        'A YouTube OAuth session is already active'
      )
    }

    await closeServer()

    const pkce =
      createYouTubePkce()

    const state =
      createYouTubeOAuthState()

    const sessionId =
      randomUUID()

    const createdAtDate =
      now()

    const createdAt =
      createdAtDate
        .toISOString()

    const expiresAt =
      new Date(
        createdAtDate
          .getTime()
        + SESSION_LIFETIME_MS
      )
        .toISOString()


    const callbackServer =
      createServer(
        async (
          request,
          response
        ) => {
          try {
            const requestUrl =
              new URL(
                request.url
                ?? '/',
                'http://127.0.0.1'
              )

            if (
              request.method
              !== 'GET'
              || requestUrl.pathname
              !== '/oauth/youtube/callback'
            ) {
              htmlResponse(
                response,
                404,
                'KINAOU',
                'Unknown OAuth callback.'
              )

              return
            }

            if (
              session?.state
              !== 'awaiting-user'
              || session.sessionId
              !== sessionId
            ) {
              htmlResponse(
                response,
                409,
                'KINAOU YouTube',
                'This OAuth session is no longer active.'
              )

              return
            }

            const returnedState =
              requestUrl
                .searchParams
                .get(
                  'state'
                )

            if (
              returnedState
              !== state
            ) {
              htmlResponse(
                response,
                400,
                'KINAOU YouTube',
                'OAuth state validation failed.'
              )

              return
            }

            const remoteError =
              requestUrl
                .searchParams
                .get(
                  'error'
                )

            if (
              remoteError
            ) {
              throw new Error(
                `Google OAuth returned ${remoteError}`
              )
            }

            const code =
              requestUrl
                .searchParams
                .get(
                  'code'
                )

            if (!code) {
              throw new Error(
                'Google OAuth callback did not contain an authorization code'
              )
            }

            const tokens =
              await exchangeYouTubeAuthorizationCode({
                fetchImpl,

                clientId:
                  requiredClientId(
                    clientId
                  ),

                redirectUri:
                  session.redirectUri,

                code,

                codeVerifier:
                  pkce.verifier
              })

            await keychain
              .storeRefreshToken(
                tokens.refreshToken
              )

            const obtainedAt =
              now()

            access = {
              token:
                tokens.accessToken,

              expiresAtMs:
                obtainedAt
                  .getTime()
                + (
                  tokens.expiresIn
                  * 1000
                )
            }

            session = {
              ...session,

              state:
                'connected',

              authorizationUrl:
                undefined,

              connectedAt:
                obtainedAt
                  .toISOString()
            }

            htmlResponse(
              response,
              200,
              'YouTube connected',
              'KINAOU can now perform explicit YouTube uploads.'
            )

            await closeServer()

          } catch (
            error
          ) {
            htmlResponse(
              response,
              400,
              'YouTube connection failed',
              'KINAOU could not complete the YouTube connection.'
            )

            await failSession(
              error
            )
          }
        }
      )


    await new Promise(
      (
        resolve,
        reject
      ) => {
        callbackServer.once(
          'error',
          reject
        )

        callbackServer.listen(
          0,
          '127.0.0.1',
          () => {
            callbackServer.removeListener(
              'error',
              reject
            )

            resolve()
          }
        )
      }
    )


    server =
      callbackServer


    const address =
      server.address()

    if (
      !address
      || typeof address
      === 'string'
    ) {
      await closeServer()

      throw new Error(
        'Could not allocate YouTube OAuth loopback port'
      )
    }


    const redirectUri =
      `http://127.0.0.1:${address.port}/oauth/youtube/callback`


    const authorizationUrl =
      buildYouTubeAuthorizationUrl({
        clientId:
          requiredClientId(
            clientId
          ),

        redirectUri,

        state,

        codeChallenge:
          pkce.challenge
      })


    session = {
      sessionId,

      state:
        'awaiting-user',

      createdAt,

      expiresAt,

      redirectUri,

      authorizationUrl
    }


    expiryTimer =
      setTimeout(
        () => {
          if (
            session?.sessionId
            === sessionId
            && session.state
            === 'awaiting-user'
          ) {
            session = {
              ...session,

              state:
                'expired',

              authorizationUrl:
                undefined
            }

            closeServer()
              .catch(
                () => {}
              )
          }
        },
        SESSION_LIFETIME_MS
      )

    expiryTimer.unref?.()


    return publicSession()
  }


  async function cancel() {
    if (
      session?.state
      === 'awaiting-user'
    ) {
      session = {
        ...session,

        state:
          'cancelled',

        authorizationUrl:
          undefined
      }
    }

    await closeServer()

    return publicSession()
  }


  async function disconnect() {
    await closeServer()

    await keychain
      .deleteRefreshToken()

    access =
      null

    session =
      null

    return {
      state:
        'idle'
    }
  }


  async function resolveCredential() {
    const currentTime =
      now()
        .getTime()

    if (
      access
      && (
        access.expiresAtMs
        - ACCESS_TOKEN_SAFETY_MS
      ) > currentTime
    ) {
      return {
        platform:
          'youtube',

        accessToken:
          access.token
      }
    }


    const refreshToken =
      await keychain
        .readRefreshToken()

    if (!refreshToken) {
      throw new Error(
        'YouTube is not connected'
      )
    }


    const refreshed =
      await refreshYouTubeAccessToken({
        fetchImpl,

        clientId:
          requiredClientId(
            clientId
          ),

        refreshToken
      })


    access = {
      token:
        refreshed.accessToken,

      expiresAtMs:
        currentTime
        + (
          refreshed.expiresIn
          * 1000
        )
    }


    return {
      platform:
        'youtube',

      accessToken:
        refreshed.accessToken
    }
  }


  async function credentialStatus() {
    const refreshToken =
      await keychain
        .readRefreshToken()

    const currentTime =
      now()
        .getTime()

    const accessAvailable =
      Boolean(
        access
        && (
          access.expiresAtMs
          - ACCESS_TOKEN_SAFETY_MS
        ) > currentTime
      )

    if (
      !refreshToken
      && !accessAvailable
    ) {
      return {
        platform:
          'youtube',

        provider:
          'system-keychain',

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
        'youtube',

      provider:
        'system-keychain',

      state:
        'available',

      accessTokenAvailable:
        accessAvailable,

      refreshTokenAvailable:
        Boolean(
          refreshToken
        ),

      scopes: [
        YOUTUBE_UPLOAD_SCOPE
      ],

      ...(accessAvailable
        ? {
            expiresAt:
              new Date(
                access
                  .expiresAtMs
              )
                .toISOString()
          }
        : {})
    }
  }


  return {
    start,

    status:
      async () =>
        publicSession(),

    cancel,

    disconnect,

    resolveCredential,

    credentialStatus
  }
}
