import http from 'node:http'
import crypto from 'node:crypto'

import {
  TIKTOK_VIDEO_PUBLISH_SCOPE,
  buildTikTokAuthorizationUrl,
  createTikTokOAuthState,
  createTikTokPkce,
  exchangeTikTokAuthorizationCode,
  refreshTikTokAccessToken
} from './tiktok-oauth.mjs'


const SESSION_LIFETIME_MS =
  10 * 60 * 1000


const ACCESS_TOKEN_SAFETY_MS =
  60 * 1000


const REFRESH_TOKEN_SAFETY_MS =
  60 * 1000


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
      `${label} is not configured`
    )
  }

  return value
}


function requiredClientKey(
  value
) {
  return requiredText(
    value,
    'KINAOU_TIKTOK_CLIENT_KEY',
    500
  )
}


function requiredClientSecret(
  value
) {
  return requiredText(
    value,
    'KINAOU_TIKTOK_CLIENT_SECRET',
    20_000
  )
}


function redact(
  message,
  secrets
) {
  let result =
    message


  for (
    const secret
    of secrets
  ) {
    if (
      typeof secret === 'string'
      && secret
    ) {
      result =
        result.split(
          secret
        ).join(
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
      /refresh[_ -]?token/gi,
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


function publicError(
  error,
  secrets
) {
  return redact(
    error instanceof Error
      ? error.message
      : String(
          error
        ),
    secrets
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


export function createTikTokOAuthRuntime({
  clientKey,
  clientSecret,

  credentialStore,

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
    !credentialStore
    || typeof credentialStore
      .storeCredential !== 'function'
    || typeof credentialStore
      .readCredential !== 'function'
    || typeof credentialStore
      .deleteCredential !== 'function'
  ) {
    throw new Error(
      'TikTok OAuth runtime requires a credential store'
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


  function runtimeSecrets() {
    return [
      clientSecret,

      access?.token
    ]
  }


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

      ...(session.openId
        ? {
            openId:
              session.openId
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

        authorizationUrl:
          undefined,

        error:
          publicError(
            error,
            runtimeSecrets()
          )
      }
    }


    await closeServer()
  }


  async function start() {
    requiredClientKey(
      clientKey
    )

    requiredClientSecret(
      clientSecret
    )


    if (
      session?.state === 'awaiting-user'
    ) {
      throw new Error(
        'A TikTok OAuth session is already active'
      )
    }


    await closeServer()


    const pkce =
      createTikTokPkce()


    const state =
      createTikTokOAuthState()


    const sessionId =
      randomUUID()


    const createdAtDate =
      now()


    const createdAt =
      createdAtDate
        .toISOString()


    const expiresAt =
      new Date(
        createdAtDate.getTime()
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
              request.method !== 'GET'
              || requestUrl.pathname
                !== '/oauth/tiktok/callback'
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
                'KINAOU TikTok',
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
                'KINAOU TikTok',
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
              const description =
                requestUrl
                  .searchParams
                  .get(
                    'error_description'
                  )


              throw new Error(
                `TikTok OAuth returned ${
                  description
                  ?? remoteError
                }`
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
                'TikTok OAuth callback did not contain an authorization code'
              )
            }


            const tokens =
              await exchangeTikTokAuthorizationCode({
                fetchImpl,

                clientKey:
                  requiredClientKey(
                    clientKey
                  ),

                clientSecret:
                  requiredClientSecret(
                    clientSecret
                  ),

                redirectUri:
                  session.redirectUri,

                code,

                codeVerifier:
                  pkce.verifier
              })


            const obtainedAt =
              now()


            await credentialStore
              .storeCredential({
                refreshToken:
                  tokens.refreshToken,

                metadata: {
                  openId:
                    tokens.openId,

                  scopes:
                    tokens.scopes,

                  refreshExpiresAt:
                    new Date(
                      obtainedAt.getTime()
                      + (
                        tokens
                          .refreshExpiresIn
                        * 1000
                      )
                    )
                      .toISOString()
                }
              })


            access = {
              token:
                tokens.accessToken,

              openId:
                tokens.openId,

              scopes:
                tokens.scopes,

              expiresAtMs:
                obtainedAt.getTime()
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
                  .toISOString(),

              openId:
                tokens.openId
            }


            htmlResponse(
              response,
              200,
              'TikTok connected',
              'KINAOU can now prepare explicit TikTok publishing.'
            )


            await closeServer()

          } catch (
            error
          ) {
            htmlResponse(
              response,
              400,
              'TikTok connection failed',
              'KINAOU could not complete the TikTok connection.'
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
      || typeof address === 'string'
    ) {
      await closeServer()

      throw new Error(
        'Could not allocate TikTok OAuth loopback port'
      )
    }


    const redirectUri =
      `http://127.0.0.1:${address.port}/oauth/tiktok/callback`


    const authorizationUrl =
      buildTikTokAuthorizationUrl({
        clientKey:
          requiredClientKey(
            clientKey
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


  async function status() {
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


    await credentialStore
      .deleteCredential()


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
          'tiktok',

        accessToken:
          access.token,

        openId:
          access.openId,

        scopes:
          access.scopes
      }
    }


    const stored =
      await credentialStore
        .readCredential()


    if (!stored) {
      throw new Error(
        'TikTok is not connected'
      )
    }


    const refreshExpiry =
      new Date(
        stored.metadata
          .refreshExpiresAt
      )
        .getTime()


    if (
      (
        refreshExpiry
        - REFRESH_TOKEN_SAFETY_MS
      ) <= currentTime
    ) {
      throw new Error(
        'TikTok refresh credential has expired; reconnect TikTok'
      )
    }


    /*
     * Refresh only as part of an explicit action that needs a credential.
     * There is no background refresh loop.
     */
    const refreshed =
      await refreshTikTokAccessToken({
        fetchImpl,

        clientKey:
          requiredClientKey(
            clientKey
          ),

        clientSecret:
          requiredClientSecret(
            clientSecret
          ),

        refreshToken:
          stored.refreshToken
      })


    if (
      refreshed.openId
        !== stored.metadata.openId
    ) {
      throw new Error(
        'TikTok refreshed credential belongs to a different account'
      )
    }


    const refreshedAt =
      now()


    await credentialStore
      .storeCredential({
        refreshToken:
          refreshed.refreshToken,

        metadata: {
          openId:
            refreshed.openId,

          scopes:
            refreshed.scopes,

          refreshExpiresAt:
            new Date(
              refreshedAt.getTime()
              + (
                refreshed
                  .refreshExpiresIn
                * 1000
              )
            )
              .toISOString()
        }
      })


    access = {
      token:
        refreshed.accessToken,

      openId:
        refreshed.openId,

      scopes:
        refreshed.scopes,

      expiresAtMs:
        refreshedAt.getTime()
        + (
          refreshed.expiresIn
          * 1000
        )
    }


    return {
      platform:
        'tiktok',

      accessToken:
        refreshed.accessToken,

      openId:
        refreshed.openId,

      scopes:
        refreshed.scopes
    }
  }


  async function credentialStatus() {
    const stored =
      await credentialStore
        .readCredential()


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


    const refreshAvailable =
      Boolean(
        stored
        && (
          new Date(
            stored.metadata
              .refreshExpiresAt
          )
            .getTime()
          - REFRESH_TOKEN_SAFETY_MS
        ) > currentTime
      )


    if (
      !accessAvailable
      && !refreshAvailable
    ) {
      return {
        platform:
          'tiktok',

        provider:
          'system-keychain',

        state:
          'missing',

        accessTokenAvailable:
          false,

        refreshTokenAvailable:
          false,

        scopes:
          stored?.metadata.scopes
          ?? []
      }
    }


    return {
      platform:
        'tiktok',

      provider:
        'system-keychain',

      state:
        'available',

      accessTokenAvailable:
        accessAvailable,

      refreshTokenAvailable:
        refreshAvailable,

      scopes:
        stored?.metadata.scopes
        ?? access?.scopes
        ?? [],

      ...(accessAvailable
        ? {
            expiresAt:
              new Date(
                access.expiresAtMs
              )
                .toISOString()
          }
        : {})
    }
  }


  return {
    start,
    status,
    cancel,
    disconnect,
    resolveCredential,
    credentialStatus
  }
}
