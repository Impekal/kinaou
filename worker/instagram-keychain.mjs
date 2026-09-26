import {
  createMacKeychainStore
} from './platform-keychain.mjs'


export const KINAOU_INSTAGRAM_KEYCHAIN_SERVICE =
  'com.impekal.kinaou.instagram.oauth'


export const KINAOU_INSTAGRAM_TOKEN_ACCOUNT =
  'long-lived-access-token'


export const KINAOU_INSTAGRAM_METADATA_ACCOUNT =
  'account-metadata'


function requiredText(
  value,
  label,
  maximum = 500
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


function accessToken(
  value
) {
  const token =
    requiredText(
      value,
      'Instagram access token',
      20_000
    )

  if (
    /[\r\n]/.test(
      token
    )
  ) {
    throw new Error(
      'Instagram access token cannot contain line breaks'
    )
  }

  return token
}


function canonicalIso(
  value,
  label
) {
  const text =
    requiredText(
      value,
      label,
      100
    )

  const date =
    new Date(
      text
    )

  if (
    !Number.isFinite(
      date.getTime()
    )
    || date.toISOString()
      !== text
  ) {
    throw new Error(
      `${label} must be a canonical ISO timestamp`
    )
  }

  return text
}


function uniqueScopes(
  value
) {
  if (
    !Array.isArray(
      value
    )
    || value.length > 50
  ) {
    throw new Error(
      'Instagram scope metadata is invalid'
    )
  }

  const result =
    value.map(
      scope =>
        requiredText(
          scope,
          'Instagram scope',
          200
        )
    )

  if (
    new Set(
      result
    ).size !== result.length
  ) {
    throw new Error(
      'Instagram scopes must be unique'
    )
  }

  return result
}


export function normalizeInstagramCredentialMetadata(
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
      'Instagram credential metadata is required'
    )
  }

  const accountId =
    requiredText(
      value.accountId,
      'Instagram account id',
      300
    )

  const username =
    requiredText(
      value.username,
      'Instagram username',
      200
    )

  const accountLabel =
    value.accountLabel === undefined
      ? `@${username}`
      : requiredText(
          value.accountLabel,
          'Instagram account label',
          200
        )

  const expiresAt =
    canonicalIso(
      value.expiresAt,
      'Instagram token expiry'
    )

  const scopes =
    uniqueScopes(
      value.scopes ?? []
    )

  return {
    accountId,
    username,
    accountLabel,
    expiresAt,
    scopes
  }
}


export function createInstagramMacCredentialStore({
  platform =
    process.platform,

  runHelper
} = {}) {
  const tokenStore =
    createMacKeychainStore({
      platform,

      service:
        KINAOU_INSTAGRAM_KEYCHAIN_SERVICE,

      account:
        KINAOU_INSTAGRAM_TOKEN_ACCOUNT,

      ...(runHelper
        ? {
            runHelper
          }
        : {})
    })


  const metadataStore =
    createMacKeychainStore({
      platform,

      service:
        KINAOU_INSTAGRAM_KEYCHAIN_SERVICE,

      account:
        KINAOU_INSTAGRAM_METADATA_ACCOUNT,

      ...(runHelper
        ? {
            runHelper
          }
        : {})
    })


  return {
    async storeCredential({
      accessToken:
        rawToken,

      metadata:
        rawMetadata
    }) {
      const token =
        accessToken(
          rawToken
        )

      const metadata =
        normalizeInstagramCredentialMetadata(
          rawMetadata
        )

      const serializedMetadata =
        JSON.stringify(
          metadata
        )

      /*
       * Both values travel to the native helper only through stdin.
       * Nothing sensitive is placed in process argv.
       */
      await tokenStore
        .storeRefreshToken(
          token
        )

      try {
        await metadataStore
          .storeRefreshToken(
            serializedMetadata
          )

      } catch (
        error
      ) {
        /*
         * Avoid leaving a usable token behind when its binding metadata
         * could not be persisted.
         */
        await tokenStore
          .deleteRefreshToken()
          .catch(
            () => {}
          )

        throw error
      }
    },


    async readCredential() {
      const [
        token,
        serializedMetadata
      ] =
        await Promise.all([
          tokenStore
            .readRefreshToken(),

          metadataStore
            .readRefreshToken()
        ])


      if (
        token === null
        && serializedMetadata === null
      ) {
        return null
      }


      if (
        token === null
        || serializedMetadata === null
      ) {
        throw new Error(
          'Instagram Keychain credential is incomplete'
        )
      }


      let parsed

      try {
        parsed =
          JSON.parse(
            serializedMetadata
          )
      } catch {
        throw new Error(
          'Instagram Keychain metadata is invalid'
        )
      }


      return {
        accessToken:
          accessToken(
            token
          ),

        metadata:
          normalizeInstagramCredentialMetadata(
            parsed
          )
      }
    },


    async deleteCredential() {
      await Promise.all([
        tokenStore
          .deleteRefreshToken(),

        metadataStore
          .deleteRefreshToken()
      ])
    }
  }
}
