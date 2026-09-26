import test from 'node:test'
import assert from 'node:assert/strict'

import {
  KINAOU_INSTAGRAM_KEYCHAIN_SERVICE,
  KINAOU_INSTAGRAM_METADATA_ACCOUNT,
  KINAOU_INSTAGRAM_TOKEN_ACCOUNT,
  createInstagramMacCredentialStore
} from './instagram-keychain.mjs'


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

            args: [],
            stdout:
              '',

            stderr:
              ''
          }
        }

        return {
          code:
            0,

          args: [],
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

          args: [],
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
  'stores long-lived token and account metadata as separate Keychain items without putting token in argv',
  async () => {
    const helper =
      inMemoryRunner()


    const store =
      createInstagramMacCredentialStore({
        platform:
          'darwin',

        runHelper:
          helper.run
      })


    await store
      .storeCredential({
        accessToken:
          'worker-only-instagram-token',

        metadata: {
          accountId:
            '17841400000000000',

          username:
            'kinaou_creator',

          accountLabel:
            '@kinaou_creator',

          expiresAt:
            '2026-11-25T23:00:00.000Z',

          scopes: [
            'instagram_business_basic',
            'instagram_business_content_publish'
          ]
        }
      })


    const stored =
      await store
        .readCredential()


    assert.equal(
      stored.accessToken,
      'worker-only-instagram-token'
    )


    assert.equal(
      stored.metadata
        .accountId,
      '17841400000000000'
    )


    assert.equal(
      stored.metadata
        .username,
      'kinaou_creator'
    )


    const tokenStoreCall =
      helper.calls.find(
        call =>
          call.action
            === 'store'
          && call.account
            === KINAOU_INSTAGRAM_TOKEN_ACCOUNT
      )


    assert.ok(
      tokenStoreCall
    )


    assert.equal(
      tokenStoreCall.service,
      KINAOU_INSTAGRAM_KEYCHAIN_SERVICE
    )


    assert.equal(
      tokenStoreCall.input,
      'worker-only-instagram-token'
    )


    assert.doesNotMatch(
      JSON.stringify(
        tokenStoreCall
      ),
      /args.*worker-only-instagram-token/
    )


    assert.ok(
      helper.calls.some(
        call =>
          call.action
            === 'store'
          && call.account
            === KINAOU_INSTAGRAM_METADATA_ACCOUNT
      )
    )
  }
)


test(
  'disconnect deletes both Instagram Keychain entries',
  async () => {
    const helper =
      inMemoryRunner()


    const store =
      createInstagramMacCredentialStore({
        platform:
          'darwin',

        runHelper:
          helper.run
      })


    await store
      .storeCredential({
        accessToken:
          'token',

        metadata: {
          accountId:
            'account',

          username:
            'creator',

          expiresAt:
            '2026-11-25T23:00:00.000Z',

          scopes:
            []
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
  'refuses Instagram Keychain access outside macOS',
  async () => {
    const store =
      createInstagramMacCredentialStore({
        platform:
          'linux'
      })


    await assert.rejects(
      store.readCredential(),
      /Darwin/
    )
  }
)
