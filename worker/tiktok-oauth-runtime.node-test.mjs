import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createTikTokOAuthRuntime
} from './tiktok-oauth-runtime.mjs'


test(
  'completes TikTok loopback OAuth, keeps access token in memory and rotates stored refresh token on demand',
  {
    timeout:
      15_000
  },
  async () => {
    let stored =
      null


    let clock =
      new Date(
        '2026-09-27T00:20:00.000Z'
      )


    const credentialStore = {
      async storeCredential(
        value
      ) {
        stored =
          structuredClone(
            value
          )
      },

      async readCredential() {
        return stored
          ? structuredClone(
              stored
            )
          : null
      },

      async deleteCredential() {
        stored =
          null
      }
    }


    let tokenCalls =
      0


    const runtime =
      createTikTokOAuthRuntime({
        clientKey:
          'client-key',

        clientSecret:
          'worker-only-client-secret',

        credentialStore,

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
            _input,
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


            assert.equal(
              body.get(
                'client_secret'
              ),
              'worker-only-client-secret'
            )


            if (
              body.get(
                'grant_type'
              )
                === 'authorization_code'
            ) {
              assert.ok(
                body.get(
                  'code_verifier'
                )
              )


              return new Response(
                JSON.stringify({
                  access_token:
                    'initial-access-secret',

                  refresh_token:
                    'initial-refresh-secret',

                  expires_in:
                    86_400,

                  refresh_expires_in:
                    31_536_000,

                  open_id:
                    'open-id-1',

                  scope:
                    'video.publish',

                  token_type:
                    'Bearer'
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
              'initial-refresh-secret'
            )


            return new Response(
              JSON.stringify({
                access_token:
                  'refreshed-access-secret',

                refresh_token:
                  'rotated-refresh-secret',

                expires_in:
                  86_400,

                refresh_expires_in:
                  31_536_000,

                open_id:
                  'open-id-1',

                scope:
                  'video.publish',

                token_type:
                  'Bearer'
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
          'scope'
        ),
      'video.publish'
    )


    assert.equal(
      authorization
        .searchParams
        .has(
          'client_secret'
        ),
      false
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
      stored.refreshToken,
      'initial-refresh-secret'
    )


    assert.equal(
      JSON.stringify(
        stored
      ).includes(
        'initial-access-secret'
      ),
      false
    )


    const connected =
      await runtime
        .status()


    assert.equal(
      connected.state,
      'connected'
    )


    assert.equal(
      connected.openId,
      'open-id-1'
    )


    assert.doesNotMatch(
      JSON.stringify(
        connected
      ),
      /initial-access-secret|initial-refresh-secret|worker-only-client-secret/
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
        '2026-09-28T00:22:00.000Z'
      )


    const refreshed =
      await runtime
        .resolveCredential()


    assert.equal(
      refreshed.accessToken,
      'refreshed-access-secret'
    )


    assert.equal(
      stored.refreshToken,
      'rotated-refresh-secret'
    )


    assert.equal(
      tokenCalls,
      2
    )


    const publicStatus =
      await runtime
        .credentialStatus()


    assert.equal(
      publicStatus.platform,
      'tiktok'
    )


    assert.equal(
      publicStatus.state,
      'available'
    )


    assert.equal(
      publicStatus.refreshTokenAvailable,
      true
    )


    assert.doesNotMatch(
      JSON.stringify(
        publicStatus
      ),
      /refreshed-access-secret|rotated-refresh-secret|worker-only-client-secret/
    )


    await runtime
      .disconnect()


    assert.equal(
      stored,
      null
    )


    assert.deepEqual(
      await runtime
        .status(),
      {
        state:
          'idle'
      }
    )
  }
)


test(
  'rejects wrong TikTok OAuth state before token exchange',
  {
    timeout:
      15_000
  },
  async () => {
    let exchanges =
      0


    const runtime =
      createTikTokOAuthRuntime({
        clientKey:
          'client-key',

        clientSecret:
          'client-secret',

        credentialStore: {
          async storeCredential() {},

          async readCredential() {
            return null
          },

          async deleteCredential() {}
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
      await runtime
        .start()


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


    await runtime
      .cancel()
  }
)


test(
  'does not refresh TikTok credentials in the background',
  async () => {
    let refreshCalls =
      0


    const runtime =
      createTikTokOAuthRuntime({
        clientKey:
          'client-key',

        clientSecret:
          'client-secret',

        credentialStore: {
          async storeCredential() {},

          async readCredential() {
            return {
              refreshToken:
                'stored-refresh-token',

              metadata: {
                openId:
                  'open-id',

                scopes: [
                  'video.publish'
                ],

                refreshExpiresAt:
                  '2027-09-27T00:20:00.000Z'
              }
            }
          },

          async deleteCredential() {}
        },

        now:
          () =>
            new Date(
              '2026-09-27T00:20:00.000Z'
            ),

        fetchImpl:
          async () => {
            refreshCalls +=
              1

            throw new Error(
              'refresh should occur only on explicit credential resolution'
            )
          }
      })


    const status =
      await runtime
        .credentialStatus()


    assert.equal(
      status.refreshTokenAvailable,
      true
    )


    assert.equal(
      refreshCalls,
      0
    )
  }
)
