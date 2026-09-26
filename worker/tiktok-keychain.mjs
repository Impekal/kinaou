import {
  createMacKeychainStore
} from './platform-keychain.mjs'


export const KINAOU_TIKTOK_KEYCHAIN_SERVICE =
  'com.impekal.kinaou.tiktok.oauth'


export const KINAOU_TIKTOK_REFRESH_ACCOUNT =
  'refresh-token'


export const KINAOU_TIKTOK_METADATA_ACCOUNT =
  'credential-metadata'


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


function secret(
  value
) {
  const normalized =
    requiredText(
      value,
      'TikTok refresh token',
      20_000
    )


  if (
    /[\r\n]/.test(
      normalized
    )
  ) {
    throw new Error(
      'TikTok refresh token cannot contain line breaks'
    )
  }


  return normalized
}


function canonicalIso(
  value,
  label
) {
  const normalized =
    requiredText(
      value,
      label,
      100
    )


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
      `${label} must be a canonical ISO timestamp`
    )
  }


  return normalized
}


function scopes(
  value
) {
  if (
    !Array.isArray(
      value
    )
    || value.length > 50
  ) {
    throw new Error(
      'TikTok scopes are invalid'
    )
  }


  const normalized =
    value.map(
      scope =>
        requiredText(
          scope,
          'TikTok scope',
          200
        )
    )


  if (
    new Set(
      normalized
    ).size !== normalized.length
  ) {
    throw new Error(
      'TikTok scopes must be unique'
    )
  }


  if (
    !normalized.includes(
      'video.publish'
    )
  ) {
    throw new Error(
      'TikTok credential metadata must include video.publish'
    )
  }


  return normalized
}


export function normalizeTikTokCredentialMetadata(
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
      'TikTok credential metadata is required'
    )
  }


  return {
    openId:
      requiredText(
        value.openId,
        'TikTok open id',
        500
      ),

    scopes:
      scopes(
        value.scopes
      ),

    refreshExpiresAt:
      canonicalIso(
        value.refreshExpiresAt,
        'TikTok refresh expiry'
      )
  }
}


export function createTikTokMacCredentialStore({
  platform =
    process.platform,

  runHelper
} = {}) {
  const refreshStore =
    createMacKeychainStore({
      platform,

      service:
        KINAOU_TIKTOK_KEYCHAIN_SERVICE,

      account:
        KINAOU_TIKTOK_REFRESH_ACCOUNT,

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
        KINAOU_TIKTOK_KEYCHAIN_SERVICE,

      account:
        KINAOU_TIKTOK_METADATA_ACCOUNT,

      ...(runHelper
        ? {
            runHelper
          }
        : {})
    })


  return {
    async storeCredential({
      refreshToken,
      metadata
    }) {
      const normalizedRefreshToken =
        secret(
          refreshToken
        )


      const normalizedMetadata =
        normalizeTikTokCredentialMetadata(
          metadata
        )


      await refreshStore
        .storeRefreshToken(
          normalizedRefreshToken
        )


      try {
        await metadataStore
          .storeRefreshToken(
            JSON.stringify(
              normalizedMetadata
            )
          )

      } catch (
        error
      ) {
        await refreshStore
          .deleteRefreshToken()
          .catch(
            () => {}
          )

        throw error
      }
    },


    async readCredential() {
      const [
        refreshToken,
        serializedMetadata
      ] =
        await Promise.all([
          refreshStore
            .readRefreshToken(),

          metadataStore
            .readRefreshToken()
        ])


      if (
        refreshToken === null
        && serializedMetadata === null
      ) {
        return null
      }


      if (
        refreshToken === null
        || serializedMetadata === null
      ) {
        throw new Error(
          'TikTok Keychain credential is incomplete'
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
          'TikTok Keychain metadata is invalid'
        )
      }


      return {
        refreshToken:
          secret(
            refreshToken
          ),

        metadata:
          normalizeTikTokCredentialMetadata(
            parsed
          )
      }
    },


    async deleteCredential() {
      await Promise.all([
        refreshStore
          .deleteRefreshToken(),

        metadataStore
          .deleteRefreshToken()
      ])
    }
  }
}
