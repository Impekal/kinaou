import test from 'node:test'
import assert from 'node:assert/strict'

import {
  GOOGLE_AUTHORIZATION_ENDPOINT,
  GOOGLE_TOKEN_ENDPOINT,
  YOUTUBE_UPLOAD_SCOPE,
  buildYouTubeAuthorizationUrl,
  createYouTubeOAuthState,
  createYouTubePkce,
  exchangeYouTubeAuthorizationCode,
  refreshYouTubeAccessToken
} from './youtube-oauth.mjs'


test(
  'builds installed-app OAuth using loopback, PKCE S256 and only youtube.upload',
  () => {
    const bytes =
      size =>
        Buffer.alloc(
          size,
          7
        )

    const pkce =
      createYouTubePkce(
        bytes
      )

    assert.equal(
      pkce.method,
      'S256'
    )

    assert.ok(
      pkce.verifier.length
      >= 43
    )

    assert.notEqual(
      pkce.challenge,
      pkce.verifier
    )

    const state =
      createYouTubeOAuthState(
        bytes
      )

    const authorizationUrl =
      buildYouTubeAuthorizationUrl({
        clientId:
          'client.apps.googleusercontent.com',

        redirectUri:
          'http://127.0.0.1:49152/',

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
      GOOGLE_AUTHORIZATION_ENDPOINT
    )

    assert.equal(
      url.searchParams
        .get(
          'scope'
        ),
      YOUTUBE_UPLOAD_SCOPE
    )

    assert.equal(
      url.searchParams
        .get(
          'response_type'
        ),
      'code'
    )

    assert.equal(
      url.searchParams
        .get(
          'access_type'
        ),
      'offline'
    )

    assert.equal(
      url.searchParams
        .get(
          'prompt'
        ),
      'consent'
    )

    assert.equal(
      url.searchParams
        .get(
          'code_challenge_method'
        ),
      'S256'
    )

    assert.equal(
      url.searchParams
        .get(
          'redirect_uri'
        ),
      'http://127.0.0.1:49152/'
    )

    assert.equal(
      url.searchParams
        .get(
          'state'
        ),
      state
    )

    assert.equal(
      url.searchParams
        .has(
          'client_secret'
        ),
      false
    )
  }
)


test(
  'rejects non-loopback redirects',
  () => {
    assert.throws(
      () =>
        buildYouTubeAuthorizationUrl({
          clientId:
            'client.apps.googleusercontent.com',

          redirectUri:
            'https://example.com/callback',

          state:
            'state',

          codeChallenge:
            'challenge'
        }),
      /loopback/
    )
  }
)


test(
  'exchanges an authorization code with PKCE and validates granted upload scope',
  async () => {
    const verifier =
      'v'.repeat(
        64
      )

    let calls =
      0

    const result =
      await exchangeYouTubeAuthorizationCode({
        clientId:
          'client.apps.googleusercontent.com',

        redirectUri:
          'http://127.0.0.1:49152/',

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
              GOOGLE_TOKEN_ENDPOINT
            )

            assert.equal(
              init.method,
              'POST'
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
              'authorization_code'
            )

            assert.equal(
              body.get(
                'code_verifier'
              ),
              verifier
            )

            assert.equal(
              body.has(
                'client_secret'
              ),
              false
            )

            return new Response(
              JSON.stringify({
                access_token:
                  'access-secret',

                refresh_token:
                  'refresh-secret',

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
          3600,

        scopes: [
          YOUTUBE_UPLOAD_SCOPE
        ],

        tokenType:
          'Bearer'
      }
    )
  }
)


test(
  'rejects code exchange without youtube.upload grant',
  async () => {
    await assert.rejects(
      exchangeYouTubeAuthorizationCode({
        clientId:
          'client.apps.googleusercontent.com',

        redirectUri:
          'http://127.0.0.1:49152/',

        code:
          'authorization-code',

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
                  3600,

                token_type:
                  'Bearer',

                scope:
                  'https://www.googleapis.com/auth/youtube.readonly'
              }),
              {
                status:
                  200
              }
            )
      }),
      /youtube\.upload/
    )
  }
)


test(
  'refreshes an access token without exposing the refresh token elsewhere',
  async () => {
    const refreshSecret =
      'refresh-secret'

    const result =
      await refreshYouTubeAccessToken({
        clientId:
          'client.apps.googleusercontent.com',

        refreshToken:
          refreshSecret,

        fetchImpl:
          async (
            input,
            init
          ) => {
            assert.equal(
              String(
                input
              ),
              GOOGLE_TOKEN_ENDPOINT
            )

            const body =
              new URLSearchParams(
                String(
                  init.body
                )
              )

            assert.equal(
              body.get(
                'refresh_token'
              ),
              refreshSecret
            )

            assert.equal(
              body.get(
                'grant_type'
              ),
              'refresh_token'
            )

            return new Response(
              JSON.stringify({
                access_token:
                  'new-access-secret',

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

    assert.equal(
      result.accessToken,
      'new-access-secret'
    )

    assert.equal(
      'refreshToken'
      in result,
      false
    )
  }
)
