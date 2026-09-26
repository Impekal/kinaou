import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createHash
} from 'node:crypto'

import {
  TIKTOK_AUTHORIZATION_ENDPOINT,
  TIKTOK_TOKEN_ENDPOINT,
  TIKTOK_VIDEO_PUBLISH_SCOPE,
  buildTikTokAuthorizationUrl,
  createTikTokOAuthState,
  createTikTokPkce,
  exchangeTikTokAuthorizationCode,
  refreshTikTokAccessToken
} from './tiktok-oauth.mjs'


test(
  'builds TikTok Desktop OAuth with loopback, state, hexadecimal PKCE and only video.publish',
  () => {
    const bytes =
      size =>
        Buffer.alloc(
          size,
          7
        )


    const pkce =
      createTikTokPkce(
        bytes
      )


    assert.equal(
      pkce.method,
      'S256'
    )


    assert.ok(
      pkce.verifier.length >= 43
    )


    assert.match(
      pkce.challenge,
      /^[a-f0-9]{64}$/
    )


    assert.equal(
      pkce.challenge,
      createHash(
        'sha256'
      )
        .update(
          pkce.verifier,
          'ascii'
        )
        .digest(
          'hex'
        )
    )


    const state =
      createTikTokOAuthState(
        bytes
      )


    const authorizationUrl =
      buildTikTokAuthorizationUrl({
        clientKey:
          'tiktok-client-key',

        redirectUri:
          'http://127.0.0.1:49152/oauth/tiktok/callback',

        state,

        codeChallenge:
          pkce.challenge
      })


    const url =
      new URL(
        authorizationUrl
      )


    assert.equal(
      url.origin
      + url.pathname,
      TIKTOK_AUTHORIZATION_ENDPOINT
    )


    assert.equal(
      url.searchParams.get(
        'client_key'
      ),
      'tiktok-client-key'
    )


    assert.equal(
      url.searchParams.get(
        'scope'
      ),
      TIKTOK_VIDEO_PUBLISH_SCOPE
    )


    assert.equal(
      url.searchParams.get(
        'response_type'
      ),
      'code'
    )


    assert.equal(
      url.searchParams.get(
        'code_challenge'
      ),
      pkce.challenge
    )


    assert.equal(
      url.searchParams.get(
        'code_challenge_method'
      ),
      'S256'
    )


    assert.equal(
      url.searchParams.get(
        'state'
      ),
      state
    )


    assert.equal(
      url.searchParams.has(
        'client_secret'
      ),
      false
    )
  }
)


test(
  'rejects non-loopback TikTok desktop redirects',
  () => {
    assert.throws(
      () =>
        buildTikTokAuthorizationUrl({
          clientKey:
            'client',

          redirectUri:
            'https://example.com/oauth/callback',

          state:
            'state',

          codeChallenge:
            'a'.repeat(
              64
            )
        }),
      /loopback/
    )
  }
)


test(
  'exchanges TikTok authorization code worker-side with client secret and PKCE',
  async () => {
    const verifier =
      'v'.repeat(
        64
      )


    let calls =
      0


    const result =
      await exchangeTikTokAuthorizationCode({
        clientKey:
          'client-key',

        clientSecret:
          'worker-only-client-secret',

        redirectUri:
          'http://127.0.0.1:49152/oauth/tiktok/callback',

        code:
          'authorization-code',

        codeVerifier:
          verifier,

        fetchImpl:
          async (
            input,
            init
          ) => {
            calls +=
              1


            assert.equal(
              String(
                input
              ),
              TIKTOK_TOKEN_ENDPOINT
            )


            const body =
              new URLSearchParams(
                String(
                  init.body
                )
              )


            assert.equal(
              body.get(
                'client_key'
              ),
              'client-key'
            )


            assert.equal(
              body.get(
                'client_secret'
              ),
              'worker-only-client-secret'
            )


            assert.equal(
              body.get(
                'code_verifier'
              ),
              verifier
            )


            assert.equal(
              body.get(
                'grant_type'
              ),
              'authorization_code'
            )


            return new Response(
              JSON.stringify({
                access_token:
                  'access-secret',

                refresh_token:
                  'refresh-secret',

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


    assert.equal(
      calls,
      1
    )


    assert.deepEqual(
      result,
      {
        accessToken:
          'access-secret',

        refreshToken:
          'refresh-secret',

        expiresIn:
          86_400,

        refreshExpiresIn:
          31_536_000,

        openId:
          'open-id-1',

        scopes: [
          'video.publish'
        ],

        tokenType:
          'Bearer'
      }
    )
  }
)


test(
  'rejects OAuth exchange without video.publish',
  async () => {
    await assert.rejects(
      exchangeTikTokAuthorizationCode({
        clientKey:
          'client-key',

        clientSecret:
          'client-secret',

        redirectUri:
          'http://127.0.0.1:49152/oauth/tiktok/callback',

        code:
          'code',

        codeVerifier:
          'v'.repeat(
            64
          ),

        fetchImpl:
          async () =>
            new Response(
              JSON.stringify({
                access_token:
                  'access-secret',

                refresh_token:
                  'refresh-secret',

                expires_in:
                  86_400,

                refresh_expires_in:
                  31_536_000,

                open_id:
                  'open-id',

                scope:
                  'user.info.basic',

                token_type:
                  'Bearer'
              }),
              {
                status:
                  200
              }
            )
      }),
      /video\.publish/
    )
  }
)


test(
  'refreshes TikTok credentials once and accepts refresh-token rotation',
  async () => {
    const result =
      await refreshTikTokAccessToken({
        clientKey:
          'client-key',

        clientSecret:
          'client-secret',

        refreshToken:
          'old-refresh-token',

        fetchImpl:
          async (
            input,
            init
          ) => {
            assert.equal(
              String(
                input
              ),
              TIKTOK_TOKEN_ENDPOINT
            )


            const body =
              new URLSearchParams(
                String(
                  init.body
                )
              )


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
              'old-refresh-token'
            )


            return new Response(
              JSON.stringify({
                access_token:
                  'new-access-token',

                refresh_token:
                  'rotated-refresh-token',

                expires_in:
                  86_400,

                refresh_expires_in:
                  31_536_000,

                open_id:
                  'open-id',

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


    assert.equal(
      result.accessToken,
      'new-access-token'
    )


    assert.equal(
      result.refreshToken,
      'rotated-refresh-token'
    )
  }
)
