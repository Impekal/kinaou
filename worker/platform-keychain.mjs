import {
  spawn
} from 'node:child_process'

import {
  fileURLToPath
} from 'node:url'


export const KINAOU_YOUTUBE_KEYCHAIN_SERVICE =
  'com.impekal.kinaou.youtube.oauth'


export const KINAOU_YOUTUBE_KEYCHAIN_ACCOUNT =
  'refresh-token'


const helperPath =
  fileURLToPath(
    new URL(
      './keychain-helper.swift',
      import.meta.url
    )
  )


function secret(
  value
) {
  if (
    typeof value !== 'string'
    || !value.trim()
    || value !== value.trim()
    || value.length > 20_000
    || /[\r\n]/.test(
      value
    )
  ) {
    throw new Error(
      'Keychain secret is invalid'
    )
  }

  return value
}


function metadata(
  value,
  label
) {
  if (
    typeof value !== 'string'
    || !value.trim()
    || value !== value.trim()
    || value.length > 300
  ) {
    throw new Error(
      `${label} is invalid`
    )
  }

  return value
}


export function defaultKeychainHelperRunner({
  action,
  service,
  account,
  input = ''
}) {
  return new Promise(
    (
      resolve,
      reject
    ) => {
      const args = [
        'swift',
        helperPath,
        action,
        service,
        account
      ]

      /*
       * Deliberately do not place the secret in argv.
       * Store receives it only over stdin.
       */
      const child =
        spawn(
          '/usr/bin/xcrun',
          args,
          {
            stdio: [
              'pipe',
              'pipe',
              'pipe'
            ]
          }
        )

      const stdout =
        []

      const stderr =
        []

      child.stdout.on(
        'data',
        chunk => {
          stdout.push(
            chunk
          )
        }
      )

      child.stderr.on(
        'data',
        chunk => {
          stderr.push(
            chunk
          )
        }
      )

      child.on(
        'error',
        reject
      )

      child.on(
        'close',
        code => {
          resolve({
            code:
              code ?? 1,

            args,

            stdout:
              Buffer
                .concat(
                  stdout
                )
                .toString(
                  'utf8'
                ),

            stderr:
              Buffer
                .concat(
                  stderr
                )
                .toString(
                  'utf8'
                )
          })
        }
      )

      child.stdin.end(
        input
      )
    }
  )
}


export function createMacKeychainStore({
  platform =
    process.platform,

  service =
    KINAOU_YOUTUBE_KEYCHAIN_SERVICE,

  account =
    KINAOU_YOUTUBE_KEYCHAIN_ACCOUNT,

  runHelper =
    defaultKeychainHelperRunner
} = {}) {
  const normalizedService =
    metadata(
      service,
      'Keychain service'
    )

  const normalizedAccount =
    metadata(
      account,
      'Keychain account'
    )


  function requireMac() {
    if (
      platform !== 'darwin'
    ) {
      throw new Error(
        'macOS Keychain is available only on Darwin'
      )
    }
  }


  async function invoke(
    action,
    input = ''
  ) {
    requireMac()

    const result =
      await runHelper({
        action,
        service:
          normalizedService,
        account:
          normalizedAccount,
        input
      })

    if (
      result.code === 44
      && action === 'read'
    ) {
      return null
    }

    if (
      result.code !== 0
    ) {
      throw new Error(
        result.stderr.trim()
        || `Keychain helper failed with code ${result.code}`
      )
    }

    return result.stdout
  }


  return {
    async storeRefreshToken(
      value
    ) {
      const normalized =
        secret(
          value
        )

      await invoke(
        'store',
        normalized
      )
    },


    async readRefreshToken() {
      const value =
        await invoke(
          'read'
        )

      if (
        value === null
      ) {
        return null
      }

      return secret(
        value
      )
    },


    async hasRefreshToken() {
      return Boolean(
        await this
          .readRefreshToken()
      )
    },


    async deleteRefreshToken() {
      await invoke(
        'delete'
      )
    }
  }
}
