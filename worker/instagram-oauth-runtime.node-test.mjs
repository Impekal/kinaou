import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createInstagramOAuthRuntime,
  instagramCallbackBrokerDescriptor
} from './instagram-oauth-runtime.mjs'


function memoryStore() {
  let value =
    null


  return {
    async storeCredential(
      credential
    ) {
      value =
        structuredClone(
          credential
        )
    },

    async readCredential() {
      return value
        ? structuredClone(
            value
          )
        : null
    },

    async deleteCredential() {
      value =
        null
    }
  }
}


function instagramFetch(
  calls
) {
  return async (
    input,
    init
  ) => {
    const url =
      new URL(
        String(
          input
        )
      )

    calls.push({
      url:
        url.toString(),

      method:
        init?.method,

      authorization:
        new Headers(
          init?.headers
        ).get(
          'authorization'
        ),

      body:
        init?.body
          ? String(
              init.body
            )
          : ''
    })


    if (
      url.hostname
        === 'api.instagram.com'
    ) {
      return new Response(
        JSON.stringify({
          access_token:
            'short-token',

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


    if (
      url.pathname
        === '/access_token'
    ) {
      return new Response(
        JSON.stringify({
          access_token:
            'long-token',

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


    if (
      url.pathname
        === '/v99.0/me'
    ) {
      return new Response(
        JSON.stringify({
          id:
            '17841400000000000',

          username:
            'kinaou_creator',

          name:
            'KINAOU Creator'
        }),
        {
          status:
            200
        }
      )
    }


    throw new Error(
      `Unexpected request: ${url}`
    )
  }
}


test(
  'defines an explicit HTTPS callback broker envelope and no automatic polling',
  () => {
    assert.deepEqual(
      instagramCallbackBrokerDescriptor,
      {
        schemaVersion:
          1,

        transport:
          'https',

        callbackDelivery:
          'explicit-envelope',

        automaticPolling:
          false,

        payloadFields: [
          'sessionId',
          'state',
          'code'
        ]
      }
    )
  }
)


test(
  'completes explicit broker callback, persists only long-lived credential and returns no secret publicly',
  async () => {
    const calls =
      []

    const store =
      memoryStore()

    let now =
      new Date(
        '2026-09-26T21:00:00.000Z'
      )


    const runtime =
      createInstagramOAuthRuntime({
        clientId:
          'instagram-app-id',

        clientSecret:
          'worker-only-app-secret',

        redirectUri:
          'https://oauth.example/kinaou/instagram/callback',

        apiVersion:
          'v99.0',

        credentialStore:
          store,

        fetchImpl:
          instagramFetch(
            calls
          ),

        now:
          () =>
            now,

        randomUUID:
          () =>
            '11111111-1111-4111-8111-111111111111',

        randomBytes:
          size =>
            Buffer.alloc(
              size,
              9
            )
      })


    const started =
      await runtime.start()


    assert.equal(
      started.state,
      'awaiting-user'
    )


    assert.ok(
      started.authorizationUrl
    )


    assert.doesNotMatch(
      JSON.stringify(
        started
      ),
      /worker-only-app-secret|short-token|long-token/
    )


    const authUrl =
      new URL(
        started.authorizationUrl
      )

    const state =
      authUrl.searchParams
        .get(
          'state'
        )


    now =
      new Date(
        '2026-09-26T21:01:00.000Z'
      )


    const connected =
      await runtime.complete({
        schemaVersion:
          1,

        sessionId:
          started.sessionId,

        state,

        code:
          'single-use-code'
      })


    assert.equal(
      connected.state,
      'connected'
    )


    assert.equal(
      connected.account
        .accountLabel,
      '@kinaou_creator'
    )


    assert.doesNotMatch(
      JSON.stringify(
        connected
      ),
      /single-use-code|worker-only-app-secret|short-token|long-token/
    )


    const stored =
      await store
        .readCredential()


    assert.equal(
      stored.accessToken,
      'long-token'
    )


    assert.equal(
      stored.metadata
        .accountId,
      '17841400000000000'
    )


    const credential =
      await runtime
        .resolveCredential()


    assert.deepEqual(
      credential,
      {
        platform:
          'instagram',

        accessToken:
          'long-token',

        accountId:
          '17841400000000000'
      }
    )


    const status =
      await runtime
        .credentialStatus()


    assert.equal(
      status.state,
      'available'
    )


    assert.equal(
      status.accountLabel,
      '@kinaou_creator'
    )


    assert.doesNotMatch(
      JSON.stringify(
        status
      ),
      /long-token/
    )


    assert.equal(
      calls.length,
      3
    )
  }
)


test(
  'rejects wrong broker state before every Meta token call',
  async () => {
    const calls =
      []

    const runtime =
      createInstagramOAuthRuntime({
        clientId:
          'instagram-app-id',

        clientSecret:
          'worker-only-app-secret',

        redirectUri:
          'https://oauth.example/kinaou/instagram/callback',

        apiVersion:
          'v99.0',

        credentialStore:
          memoryStore(),

        fetchImpl:
          instagramFetch(
            calls
          ),

        randomUUID:
          () =>
            '11111111-1111-4111-8111-111111111111',

        randomBytes:
          size =>
            Buffer.alloc(
              size,
              4
            )
      })


    const started =
      await runtime.start()


    await assert.rejects(
      runtime.complete({
        schemaVersion:
          1,

        sessionId:
          started.sessionId,

        state:
          'wrong-state',

        code:
          'code'
      }),
      /state does not match/
    )


    assert.equal(
      calls.length,
      0
    )
  }
)


test(
  'does not refresh an expired Instagram token automatically',
  async () => {
    const store =
      memoryStore()


    await store.storeCredential({
      accessToken:
        'expired-token',

      metadata: {
        accountId:
          'account',

        username:
          'creator',

        accountLabel:
          '@creator',

        expiresAt:
          '2026-09-26T21:00:30.000Z',

        scopes:
          []
      }
    })


    const runtime =
      createInstagramOAuthRuntime({
        clientId:
          'instagram-app-id',

        clientSecret:
          'worker-only-app-secret',

        redirectUri:
          'https://oauth.example/kinaou/instagram/callback',

        apiVersion:
          'v99.0',

        credentialStore:
          store,

        now:
          () =>
            new Date(
              '2026-09-26T21:00:00.000Z'
            )
      })


    await assert.rejects(
      runtime.resolveCredential(),
      /explicit reconnect or refresh/
    )


    const status =
      await runtime
        .credentialStatus()


    assert.equal(
      status.state,
      'missing'
    )


    assert.equal(
      status.accessTokenAvailable,
      false
    )
  }
)


test(
  'disconnect deletes persisted Instagram credential',
  async () => {
    const store =
      memoryStore()


    await store.storeCredential({
      accessToken:
        'token',

      metadata: {
        accountId:
          'account',

        username:
          'creator',

        accountLabel:
          '@creator',

        expiresAt:
          '2026-11-25T21:00:00.000Z',

        scopes:
          []
      }
    })


    const runtime =
      createInstagramOAuthRuntime({
        clientId:
          'instagram-app-id',

        clientSecret:
          'worker-only-app-secret',

        redirectUri:
          'https://oauth.example/kinaou/instagram/callback',

        apiVersion:
          'v99.0',

        credentialStore:
          store
      })


    assert.deepEqual(
      await runtime.disconnect(),
      {
        state:
          'idle'
      }
    )


    assert.equal(
      await store
        .readCredential(),
      null
    )
  }
)
