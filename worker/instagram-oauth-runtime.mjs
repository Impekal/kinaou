import crypto from 'node:crypto'

import {
  INSTAGRAM_REQUIRED_SCOPES,
  buildInstagramAuthorizationUrl,
  createInstagramOAuthState,
  discoverInstagramProfessionalAccount,
  exchangeInstagramAuthorizationCode,
  exchangeInstagramLongLivedToken
} from './instagram-oauth.mjs'


const SESSION_LIFETIME_MS =
  10 * 60 * 1000


const TOKEN_SAFETY_MS =
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
      `${label} is invalid`
    )
  }

  return value
}


function configuration({
  clientId,
  clientSecret,
  redirectUri,
  apiVersion
}) {
  return {
    clientId:
      requiredText(
        clientId,
        'KINAOU_INSTAGRAM_CLIENT_ID',
        500
      ),

    clientSecret:
      requiredText(
        clientSecret,
        'KINAOU_INSTAGRAM_CLIENT_SECRET'
      ),

    redirectUri:
      requiredText(
        redirectUri,
        'KINAOU_INSTAGRAM_REDIRECT_URI',
        1000
      ),

    apiVersion:
      requiredText(
        apiVersion,
        'KINAOU_INSTAGRAM_API_VERSION',
        30
      )
  }
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
      /client[_ -]?secret/gi,
      '[credential]'
    )
    .replace(
      /authorization[_ -]?code/gi,
      '[authorization]'
    )
    .slice(
      0,
      500
    )
}


function validateEnvelope(
  value
) {
  if (
    !value
    || typeof value !== 'object'
    || Array.isArray(
      value
    )
  ) {
    throw new Error(
      'Instagram callback broker envelope is required'
    )
  }


  const allowed =
    new Set([
      'schemaVersion',
      'sessionId',
      'state',
      'code'
    ])


  for (
    const key
    of Object.keys(
      value
    )
  ) {
    if (
      !allowed.has(
        key
      )
    ) {
      throw new Error(
        'Instagram callback broker envelope contains unsupported fields'
      )
    }
  }


  if (
    value.schemaVersion !== 1
  ) {
    throw new Error(
      'Instagram callback broker envelope schemaVersion must be 1'
    )
  }


  return {
    schemaVersion:
      1,

    sessionId:
      requiredText(
        value.sessionId,
        'Instagram OAuth session id',
        100
      ),

    state:
      requiredText(
        value.state,
        'Instagram OAuth state',
        500
      ),

    code:
      requiredText(
        value.code,
        'Instagram authorization code',
        20_000
      )
  }
}


export const instagramCallbackBrokerDescriptor = {
  schemaVersion:
    1,

  transport:
    'https',

  callbackDelivery:
    'explicit-envelope',

  automaticPolling:
    false,

  payloadFields: [
    'sessionId',
    'state',
    'code'
  ]
}


export function createInstagramOAuthRuntime({
  clientId,
  clientSecret,
  redirectUri,
  apiVersion,

  credentialStore,

  fetchImpl =
    fetch,

  now =
    () =>
      new Date(),

  randomUUID =
    () =>
      crypto.randomUUID(),

  randomBytes =
    crypto.randomBytes
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
      'Instagram OAuth runtime requires a credential store'
    )
  }


  let session =
    null


  function currentTime() {
    return now()
      .getTime()
  }


  function expireAwaitingSession() {
    if (
      session?.state
        === 'awaiting-user'
      && new Date(
        session.expiresAt
      ).getTime()
        <= currentTime()
    ) {
      session = {
        ...session,

        state:
          'expired',

        authorizationUrl:
          undefined,

        oauthState:
          undefined
      }
    }
  }


  function publicSession() {
    expireAwaitingSession()


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

      ...(session.account
        ? {
            account:
              session.account
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


  async function start() {
    expireAwaitingSession()


    if (
      session?.state
        === 'awaiting-user'
    ) {
      throw new Error(
        'Instagram OAuth already has an active session'
      )
    }


    const config =
      configuration({
        clientId,
        clientSecret,
        redirectUri,
        apiVersion
      })


    const sessionId =
      randomUUID()

    const oauthState =
      createInstagramOAuthState(
        randomBytes
      )

    const createdAt =
      now()
        .toISOString()

    const expiresAt =
      new Date(
        currentTime()
        + SESSION_LIFETIME_MS
      )
        .toISOString()


    const authorizationUrl =
      buildInstagramAuthorizationUrl({
        clientId:
          config.clientId,

        redirectUri:
          config.redirectUri,

        state:
          oauthState
      })


    session = {
      sessionId,

      state:
        'awaiting-user',

      createdAt,
      expiresAt,
      oauthState,
      authorizationUrl
    }


    return publicSession()
  }


  async function complete(
    envelopeValue
  ) {
    expireAwaitingSession()


    const envelope =
      validateEnvelope(
        envelopeValue
      )


    if (
      !session
      || session.state
        !== 'awaiting-user'
    ) {
      throw new Error(
        'Instagram OAuth has no active session'
      )
    }


    if (
      envelope.sessionId
        !== session.sessionId
    ) {
      throw new Error(
        'Instagram OAuth session id does not match'
      )
    }


    if (
      envelope.state
        !== session.oauthState
    ) {
      throw new Error(
        'Instagram OAuth state does not match'
      )
    }


    const config =
      configuration({
        clientId,
        clientSecret,
        redirectUri,
        apiVersion
      })


    try {
      const shortLived =
        await exchangeInstagramAuthorizationCode({
          fetchImpl,

          clientId:
            config.clientId,

          clientSecret:
            config.clientSecret,

          redirectUri:
            config.redirectUri,

          code:
            envelope.code
        })


      const longLived =
        await exchangeInstagramLongLivedToken({
          fetchImpl,

          clientSecret:
            config.clientSecret,

          shortLivedAccessToken:
            shortLived.accessToken
        })


      const account =
        await discoverInstagramProfessionalAccount({
          fetchImpl,

          accessToken:
            longLived.accessToken,

          version:
            config.apiVersion
        })


      const connectedAt =
        now()
          .toISOString()


      const expiresAt =
        new Date(
          currentTime()
          + (
            longLived.expiresIn
            * 1000
          )
        )
          .toISOString()


      await credentialStore
        .storeCredential({
          accessToken:
            longLived.accessToken,

          metadata: {
            accountId:
              account.accountId,

            username:
              account.username,

            accountLabel:
              account.accountLabel,

            expiresAt,

            scopes:
              shortLived.scopes
              ?? []
          }
        })


      session = {
        sessionId:
          session.sessionId,

        state:
          'connected',

        createdAt:
          session.createdAt,

        expiresAt,

        connectedAt,

        account: {
          accountId:
            account.accountId,

          username:
            account.username,

          accountLabel:
            account.accountLabel,

          ...(account.name
            ? {
                name:
                  account.name
              }
            : {}),

          ...(account.profilePictureUrl
            ? {
                profilePictureUrl:
                  account.profilePictureUrl
              }
            : {})
        }
      }


      return publicSession()

    } catch (
      error
    ) {
      session = {
        sessionId:
          session.sessionId,

        state:
          'failed',

        createdAt:
          session.createdAt,

        expiresAt:
          session.expiresAt,

        error:
          publicError(
            error
          )
      }

      throw error
    }
  }


  async function cancel() {
    expireAwaitingSession()


    if (
      session?.state
        === 'awaiting-user'
    ) {
      session = {
        sessionId:
          session.sessionId,

        state:
          'cancelled',

        createdAt:
          session.createdAt,

        expiresAt:
          session.expiresAt
      }
    }


    return publicSession()
  }


  async function disconnect() {
    await credentialStore
      .deleteCredential()

    session =
      null

    return {
      state:
        'idle'
    }
  }


  async function resolveCredential() {
    const stored =
      await credentialStore
        .readCredential()


    if (!stored) {
      throw new Error(
        'Instagram is not connected'
      )
    }


    const expiry =
      new Date(
        stored.metadata
          .expiresAt
      ).getTime()


    if (
      expiry
      - TOKEN_SAFETY_MS
      <= currentTime()
    ) {
      throw new Error(
        'Instagram credential is expired or too close to expiry; explicit reconnect or refresh is required'
      )
    }


    return {
      platform:
        'instagram',

      accessToken:
        stored.accessToken,

      accountId:
        stored.metadata
          .accountId
    }
  }


  async function credentialStatus() {
    const stored =
      await credentialStore
        .readCredential()


    if (!stored) {
      return {
        platform:
          'instagram',

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


    const usable =
      new Date(
        stored.metadata
          .expiresAt
      ).getTime()
      - TOKEN_SAFETY_MS
      > currentTime()


    if (!usable) {
      return {
        platform:
          'instagram',

        provider:
          'system-keychain',

        state:
          'missing',

        accessTokenAvailable:
          false,

        refreshTokenAvailable:
          false,

        accountLabel:
          stored.metadata
            .accountLabel,

        scopes:
          stored.metadata
            .scopes,

        expiresAt:
          stored.metadata
            .expiresAt
      }
    }


    return {
      platform:
        'instagram',

      provider:
        'system-keychain',

      state:
        'available',

      accessTokenAvailable:
        true,

      refreshTokenAvailable:
        false,

      accountLabel:
        stored.metadata
          .accountLabel,

      scopes:
        stored.metadata
          .scopes,

      expiresAt:
        stored.metadata
          .expiresAt
    }
  }


  return {
    start,

    status:
      async () =>
        publicSession(),

    complete,

    cancel,

    disconnect,

    resolveCredential,

    credentialStatus
  }
}
