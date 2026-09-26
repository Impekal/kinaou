import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createMacKeychainStore
} from './platform-keychain.mjs'


test(
  'passes refresh token only through helper stdin and never argv',
  async () => {
    const calls =
      []

    let stored =
      null

    const store =
      createMacKeychainStore({
        platform:
          'darwin',

        runHelper:
          async call => {
            calls.push(
              structuredClone(
                call
              )
            )

            if (
              call.action
              === 'store'
            ) {
              stored =
                call.input

              return {
                code:
                  0,

                stdout:
                  '',

                stderr:
                  ''
              }
            }

            if (
              call.action
              === 'read'
            ) {
              if (
                stored === null
              ) {
                return {
                  code:
                    44,

                  stdout:
                    '',

                  stderr:
                    ''
                }
              }

              return {
                code:
                  0,

                stdout:
                  stored,

                stderr:
                  ''
              }
            }

            if (
              call.action
              === 'delete'
            ) {
              stored =
                null

              return {
                code:
                  0,

                stdout:
                  '',

                stderr:
                  ''
              }
            }

            throw new Error(
              'Unexpected helper call'
            )
          }
      })


    const secret =
      'worker-only-refresh-secret'

    await store
      .storeRefreshToken(
        secret
      )

    assert.equal(
      await store
        .readRefreshToken(),
      secret
    )

    assert.equal(
      await store
        .hasRefreshToken(),
      true
    )


    for (
      const call
      of calls
    ) {
      const visible =
        JSON.stringify({
          action:
            call.action,

          service:
            call.service,

          account:
            call.account
        })

      assert.doesNotMatch(
        visible,
        /worker-only-refresh-secret/
      )
    }


    const storeCall =
      calls.find(
        call =>
          call.action
          === 'store'
      )

    assert.equal(
      storeCall.input,
      secret
    )


    await store
      .deleteRefreshToken()

    assert.equal(
      await store
        .readRefreshToken(),
      null
    )
  }
)


test(
  'refuses keychain operations outside macOS',
  async () => {
    const store =
      createMacKeychainStore({
        platform:
          'linux',

        runHelper:
          async () => {
            throw new Error(
              'must not execute'
            )
          }
      })

    await assert.rejects(
      store.readRefreshToken(),
      /only on Darwin/
    )
  }
)
