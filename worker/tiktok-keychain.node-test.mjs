import test from 'node:test'
import assert from 'node:assert/strict'

import {
  KINAOU_TIKTOK_KEYCHAIN_SERVICE,
  KINAOU_TIKTOK_METADATA_ACCOUNT,
  KINAOU_TIKTOK_REFRESH_ACCOUNT,
  createTikTokMacCredentialStore
} from './tiktok-keychain.mjs'


function inMemoryRunner() {
  const values =
    new Map()

  const calls =
    []


  return {
    calls,

    async run({
      action,
      service,
      account,
      input
    }) {
      calls.push({
        action,
        service,
        account,
        input
      })


      const key =
        `${service}:${account}`


      if (
        action === 'store'
      ) {
        values.set(
          key,
          input
        )

        return {
          code:
            0,

          args: [
            'swift',
            'helper.swift',
            action,
            service,
            account
          ],

          stdout:
            '',

          stderr:
            ''
        }
      }


      if (
        action === 'read'
      ) {
        if (
          !values.has(
            key
          )
        ) {
          return {
            code:
              44,

            args:
              [],

            stdout:
              '',

            stderr:
              ''
          }
        }


        return {
          code:
            0,

          args:
            [],

          stdout:
            values.get(
              key
            ),

          stderr:
            ''
        }
      }


      if (
        action === 'delete'
      ) {
        values.delete(
          key
        )

        return {
          code:
            0,

          args:
            [],

          stdout:
            '',

          stderr:
            ''
        }
      }


      throw new Error(
        'Unexpected helper action'
      )
    }
  }
}


test(
  'stores TikTok refresh token separately from metadata without token in argv',
  async () => {
    const helper =
      inMemoryRunner()


    const store =
      createTikTokMacCredentialStore({
        platform:
          'darwin',

        runHelper:
          helper.run
      })


    await store
      .storeCredential({
        refreshToken:
          'worker-only-refresh-token',

        metadata: {
          openId:
            'open-id-1',

          scopes: [
            'video.publish'
          ],

          refreshExpiresAt:
            '2027-09-27T00:20:00.000Z'
        }
      })


    const stored =
      await store
        .readCredential()


    assert.equal(
      stored.refreshToken,
      'worker-only-refresh-token'
    )


    assert.equal(
      stored.metadata.openId,
      'open-id-1'
    )


    const tokenCall =
      helper.calls.find(
        call =>
          call.action === 'store'
          && call.account
            === KINAOU_TIKTOK_REFRESH_ACCOUNT
      )


    assert.ok(
      tokenCall
    )


    assert.equal(
      tokenCall.service,
      KINAOU_TIKTOK_KEYCHAIN_SERVICE
    )


    assert.equal(
      tokenCall.input,
      'worker-only-refresh-token'
    )


    /*
     * runHelper receives secret input separately from helper metadata.
     * action/service/account are the values used to construct argv.
     */
    assert.doesNotMatch(
      JSON.stringify({
        action:
          tokenCall.action,

        service:
          tokenCall.service,

        account:
          tokenCall.account
      }),
      /worker-only-refresh-token/
    )


    assert.equal(
      tokenCall.input,
      'worker-only-refresh-token'
    )


    assert.ok(
      helper.calls.some(
        call =>
          call.action === 'store'
          && call.account
            === KINAOU_TIKTOK_METADATA_ACCOUNT
      )
    )
  }
)


test(
  'deletes both TikTok Keychain entries',
  async () => {
    const helper =
      inMemoryRunner()


    const store =
      createTikTokMacCredentialStore({
        platform:
          'darwin',

        runHelper:
          helper.run
      })


    await store
      .storeCredential({
        refreshToken:
          'refresh-token',

        metadata: {
          openId:
            'open-id',

          scopes: [
            'video.publish'
          ],

          refreshExpiresAt:
            '2027-09-27T00:20:00.000Z'
        }
      })


    await store
      .deleteCredential()


    assert.equal(
      await store
        .readCredential(),
      null
    )
  }
)


test(
  'refuses TikTok Keychain access outside macOS',
  async () => {
    const store =
      createTikTokMacCredentialStore({
        platform:
          'linux'
      })


    await assert.rejects(
      store.readCredential(),
      /Darwin/
    )
  }
)
