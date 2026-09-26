import test from 'node:test'
import assert from 'node:assert/strict'

import {
  YOUTUBE_UPLOAD_SCOPE
} from './youtube-oauth.mjs'

import {
  createYouTubeOAuthRuntime
} from './youtube-oauth-runtime.mjs'


test(
  'completes real loopback callback, stores only refresh token and keeps access token in memory',
  {
    timeout:
      15_000
  },
  async () => {
    let storedRefreshToken =
      null

    let clock =
      new Date(
        '2026-09-26T18:00:00.000Z'
      )


    const keychain = {
      async storeRefreshToken(
        value
      ) {
        storedRefreshToken =
          value
      },

      async readRefreshToken() {
        return storedRefreshToken
      },

      async deleteRefreshToken() {
        storedRefreshToken =
          null
      }
    }


    let tokenCalls =
      0


    const runtime =
      createYouTubeOAuthRuntime({
        clientId:
          'client.apps.googleusercontent.com',

        keychain,

        now:
          () =>
            new Date(
              clock
            ),

        randomUUID:
          () =>
            '11111111-1111-4111-8111-111111111111',

        fetchImpl:
          async (
            input,
            init
          ) => {
            tokenCalls +=
              1

            const body =
              new URLSearchParams(
                String(
                  init.body
                )
              )

            if (
              body.get(
                'grant_type'
              )
              === 'authorization_code'
            ) {
              return new Response(
                JSON.stringify({
                  access_token:
                    'initial-access-secret',

                  refresh_token:
                    'stored-refresh-secret',

                  expires_in:
                    3600,

                  token_type:
                    'Bearer',

                  scope:
                    YOUTUBE_UPLOAD_SCOPE
                }),
                {
                  status:
                    200
                }
              )
            }


            assert.equal(
              body.get(
                'grant_type'
              ),
              'refresh_token'
            )

            assert.equal(
              body.get(
                'refresh_token'
              ),
              'stored-refresh-secret'
            )

            return new Response(
              JSON.stringify({
                access_token:
                  'refreshed-access-secret',

                expires_in:
                  3600,

                token_type:
                  'Bearer',

                scope:
                  YOUTUBE_UPLOAD_SCOPE
              }),
              {
                status:
                  200
              }
            )
          }
      })


    const started =
      await runtime
        .start()


    assert.equal(
      started.state,
      'awaiting-user'
    )

    assert.equal(
      started.sessionId,
      '11111111-1111-4111-8111-111111111111'
    )


    const authorization =
      new URL(
        started.authorizationUrl
      )


    assert.equal(
      authorization
        .searchParams
        .get(
          'access_type'
        ),
      'offline'
    )

    assert.equal(
      authorization
        .searchParams
        .get(
          'scope'
        ),
      YOUTUBE_UPLOAD_SCOPE
    )


    const redirectUri =
      authorization
        .searchParams
        .get(
          'redirect_uri'
        )

    const state =
      authorization
        .searchParams
        .get(
          'state'
        )


    assert.ok(
      redirectUri
    )

    assert.ok(
      state
    )


    const callback =
      new URL(
        redirectUri
      )

    callback.searchParams.set(
      'code',
      'authorization-code'
    )

    callback.searchParams.set(
      'state',
      state
    )


    const callbackResponse =
      await fetch(
        callback
      )

    assert.equal(
      callbackResponse.status,
      200
    )


    assert.equal(
      storedRefreshToken,
      'stored-refresh-secret'
    )


    const connected =
      await runtime
        .status()

    assert.equal(
      connected.state,
      'connected'
    )

    assert.equal(
      JSON.stringify(
        connected
      ).includes(
        'initial-access-secret'
      ),
      false
    )

    assert.equal(
      JSON.stringify(
        connected
      ).includes(
        'stored-refresh-secret'
      ),
      false
    )


    const initial =
      await runtime
        .resolveCredential()

    assert.equal(
      initial.accessToken,
      'initial-access-secret'
    )

    assert.equal(
      tokenCalls,
      1
    )


    clock =
      new Date(
        '2026-09-26T20:00:00.000Z'
      )


    const refreshed =
      await runtime
        .resolveCredential()

    assert.equal(
      refreshed.accessToken,
      'refreshed-access-secret'
    )

    assert.equal(
      tokenCalls,
      2
    )


    const publicCredential =
      await runtime
        .credentialStatus()

    assert.equal(
      publicCredential.provider,
      'system-keychain'
    )

    assert.equal(
      publicCredential
        .refreshTokenAvailable,
      true
    )

    assert.doesNotMatch(
      JSON.stringify(
        publicCredential
      ),
      /stored-refresh-secret|refreshed-access-secret/
    )


    await runtime
      .disconnect()

    assert.equal(
      storedRefreshToken,
      null
    )

    assert.deepEqual(
      await runtime.status(),
      {
        state:
          'idle'
      }
    )
  }
)


test(
  'rejects wrong OAuth state without exchanging credentials',
  {
    timeout:
      15_000
  },
  async () => {
    let exchanges =
      0


    const runtime =
      createYouTubeOAuthRuntime({
        clientId:
          'client.apps.googleusercontent.com',

        keychain: {
          async storeRefreshToken() {},
          async readRefreshToken() {
            return null
          },
          async deleteRefreshToken() {}
        },

        fetchImpl:
          async () => {
            exchanges +=
              1

            throw new Error(
              'must not exchange'
            )
          }
      })


    const started =
      await runtime.start()

    const authorization =
      new URL(
        started.authorizationUrl
      )

    const callback =
      new URL(
        authorization
          .searchParams
          .get(
            'redirect_uri'
          )
      )

    callback.searchParams.set(
      'code',
      'authorization-code'
    )

    callback.searchParams.set(
      'state',
      'wrong-state'
    )


    const response =
      await fetch(
        callback
      )

    assert.equal(
      response.status,
      400
    )

    assert.equal(
      exchanges,
      0
    )


    await runtime.cancel()
  }
)
