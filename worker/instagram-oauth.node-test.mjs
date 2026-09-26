import test from 'node:test'
import assert from 'node:assert/strict'

import {
  INSTAGRAM_AUTHORIZATION_ENDPOINT,
  INSTAGRAM_REQUIRED_SCOPES,
  buildInstagramAuthorizationUrl,
  createInstagramOAuthState,
  discoverInstagramProfessionalAccount,
  exchangeInstagramAuthorizationCode,
  exchangeInstagramLongLivedToken,
  refreshInstagramLongLivedToken
} from './instagram-oauth.mjs'


const CLIENT_ID =
  'instagram-app-id'


const CLIENT_SECRET =
  'worker-only-app-secret'


const REDIRECT_URI =
  'https://oauth.example/kinaou/instagram/callback'


test(
  'builds Instagram-only authorization with state and publishing scopes without exposing app secret',
  () => {
    const state =
      createInstagramOAuthState(
        size =>
          Buffer.alloc(
            size,
            7
          )
      )


    const raw =
      buildInstagramAuthorizationUrl({
        clientId:
          CLIENT_ID,

        redirectUri:
          REDIRECT_URI,

        state
      })


    const url =
      new URL(
        raw
      )


    assert.equal(
      `${url.origin}${url.pathname}`,
      INSTAGRAM_AUTHORIZATION_ENDPOINT
    )


    assert.equal(
      url.searchParams
        .get(
          'client_id'
        ),
      CLIENT_ID
    )


    assert.equal(
      url.searchParams
        .get(
          'redirect_uri'
        ),
      REDIRECT_URI
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
          'scope'
        ),
      INSTAGRAM_REQUIRED_SCOPES
        .join(
          ','
        )
    )


    assert.equal(
      url.searchParams
        .get(
          'enable_fb_login'
        ),
      '0'
    )


    assert.equal(
      url.searchParams
        .get(
          'state'
        ),
      state
    )


    assert.doesNotMatch(
      raw,
      /worker-only-app-secret/
    )


    assert.throws(
      () =>
        buildInstagramAuthorizationUrl({
          clientId:
            CLIENT_ID,

          redirectUri:
            'http://127.0.0.1:43117/callback',

          state
        }),
      /HTTPS redirect/
    )
  }
)


test(
  'exchanges authorization code worker-side and validates publishing permission when returned',
  async () => {
    let capturedBody =
      ''


    const result =
      await exchangeInstagramAuthorizationCode({
        clientId:
          CLIENT_ID,

        clientSecret:
          CLIENT_SECRET,

        redirectUri:
          REDIRECT_URI,

        code:
          'single-use-code',

        fetchImpl:
          async (
            input,
            init
          ) => {
            assert.equal(
              String(
                input
              ),
              'https://api.instagram.com/oauth/access_token'
            )

            assert.equal(
              init?.method,
              'POST'
            )

            capturedBody =
              String(
                init?.body
              )

            return new Response(
              JSON.stringify({
                access_token:
                  'short-lived-token',

                user_id:
                  '17841400000000000',

                permissions:
                  'instagram_business_basic,instagram_business_content_publish'
              }),
              {
                status:
                  200
              }
            )
          }
      })


    const body =
      new URLSearchParams(
        capturedBody
      )


    assert.equal(
      body.get(
        'client_secret'
      ),
      CLIENT_SECRET
    )


    assert.equal(
      body.get(
        'code'
      ),
      'single-use-code'
    )


    assert.equal(
      result.userId,
      '17841400000000000'
    )


    assert.deepEqual(
      result.scopes,
      INSTAGRAM_REQUIRED_SCOPES
    )


    assert.equal(
      result.accessToken,
      'short-lived-token'
    )


    await assert.rejects(
      exchangeInstagramAuthorizationCode({
        clientId:
          CLIENT_ID,

        clientSecret:
          CLIENT_SECRET,

        redirectUri:
          REDIRECT_URI,

        code:
          'code',

        fetchImpl:
          async () =>
            new Response(
              JSON.stringify({
                access_token:
                  'token',

                permissions:
                  'instagram_business_basic'
              }),
              {
                status:
                  200
              }
            )
      }),
      /missing a required publishing permission/
    )
  }
)


test(
  'exchanges short-lived token for long-lived token without returning app secret',
  async () => {
    let requestUrl


    const result =
      await exchangeInstagramLongLivedToken({
        clientSecret:
          CLIENT_SECRET,

        shortLivedAccessToken:
          'short-lived-token',

        fetchImpl:
          async input => {
            requestUrl =
              new URL(
                String(
                  input
                )
              )

            return new Response(
              JSON.stringify({
                access_token:
                  'long-lived-token',

                token_type:
                  'bearer',

                expires_in:
                  5_184_000
              }),
              {
                status:
                  200
              }
            )
          }
      })


    assert.equal(
      requestUrl.origin,
      'https://graph.instagram.com'
    )


    assert.equal(
      requestUrl.pathname,
      '/access_token'
    )


    assert.equal(
      requestUrl.searchParams
        .get(
          'grant_type'
        ),
      'ig_exchange_token'
    )


    assert.equal(
      requestUrl.searchParams
        .get(
          'client_secret'
        ),
      CLIENT_SECRET
    )


    assert.equal(
      requestUrl.searchParams
        .get(
          'access_token'
        ),
      'short-lived-token'
    )


    assert.deepEqual(
      result,
      {
        accessToken:
          'long-lived-token',

        expiresIn:
          5_184_000,

        tokenType:
          'bearer'
      }
    )


    assert.doesNotMatch(
      JSON.stringify(
        result
      ),
      /worker-only-app-secret|short-lived-token/
    )
  }
)


test(
  'refreshes a long-lived Instagram token explicitly and exactly once',
  async () => {
    let calls =
      0


    const result =
      await refreshInstagramLongLivedToken({
        accessToken:
          'current-long-lived-token',

        fetchImpl:
          async input => {
            calls +=
              1

            const url =
              new URL(
                String(
                  input
                )
              )

            assert.equal(
              url.pathname,
              '/refresh_access_token'
            )

            assert.equal(
              url.searchParams
                .get(
                  'grant_type'
                ),
              'ig_refresh_token'
            )

            assert.equal(
              url.searchParams
                .get(
                  'access_token'
                ),
              'current-long-lived-token'
            )

            return new Response(
              JSON.stringify({
                access_token:
                  'rotated-long-lived-token',

                token_type:
                  'bearer',

                expires_in:
                  5_184_000
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


    assert.equal(
      result.accessToken,
      'rotated-long-lived-token'
    )
  }
)


test(
  'discovers the connected professional account using bearer auth and no token in URL',
  async () => {
    let capturedUrl


    const account =
      await discoverInstagramProfessionalAccount({
        accessToken:
          'worker-only-instagram-token',

        version:
          'v99.0',

        fetchImpl:
          async (
            input,
            init
          ) => {
            capturedUrl =
              new URL(
                String(
                  input
                )
              )

            assert.equal(
              new Headers(
                init?.headers
              ).get(
                'authorization'
              ),
              'Bearer worker-only-instagram-token'
            )

            return new Response(
              JSON.stringify({
                id:
                  '17841400000000000',

                username:
                  'kinaou_creator',

                name:
                  'KINAOU Creator',

                profile_picture_url:
                  'https://cdn.example/profile.jpg'
              }),
              {
                status:
                  200
              }
            )
          }
      })


    assert.equal(
      capturedUrl.origin,
      'https://graph.instagram.com'
    )


    assert.equal(
      capturedUrl.pathname,
      '/v99.0/me'
    )


    assert.equal(
      capturedUrl.searchParams
        .get(
          'fields'
        ),
      'id,username,name,profile_picture_url'
    )


    assert.equal(
      capturedUrl.searchParams
        .has(
          'access_token'
        ),
      false
    )


    assert.deepEqual(
      account,
      {
        platform:
          'instagram',

        accountId:
          '17841400000000000',

        username:
          'kinaou_creator',

        accountLabel:
          '@kinaou_creator',

        name:
          'KINAOU Creator',

        profilePictureUrl:
          'https://cdn.example/profile.jpg'
      }
    )


    assert.doesNotMatch(
      JSON.stringify(
        account
      ),
      /worker-only-instagram-token/
    )
  }
)
