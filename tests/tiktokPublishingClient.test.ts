import {
  describe,
  expect,
  it
} from 'vitest'

import {
  WorkerClient
} from '../src/core/workerClient'


function jsonResponse(
  value:
    unknown,

  status =
    200
) {
  return new Response(
    JSON.stringify(
      value
    ),
    {
      status,

      headers: {
        'content-type':
          'application/json'
      }
    }
  )
}


describe(
  'TikTok OAuth WorkerClient',
  () => {
    it(
      'controls explicit TikTok OAuth through authenticated localhost without exposing credentials',
      async () => {
        const calls:
          Array<{
            url:
              string

            method:
              string

            authorization:
              string | null

            body:
              string
              | null
          }> =
            []


        const sessionId =
          '11111111-1111-4111-8111-111111111111'


        const client =
          new WorkerClient({
            baseUrl:
              'http://127.0.0.1:43117',

            token:
              'local-worker-token',

            fetchImpl:
              async (
                input,
                init
              ) => {
                const url =
                  String(
                    input
                  )

                const method =
                  init?.method
                  ?? 'GET'

                const headers =
                  new Headers(
                    init?.headers
                  )


                calls.push({
                  url,
                  method,
                  authorization:
                    headers.get(
                      'authorization'
                    ),

                  body:
                    typeof init?.body
                      === 'string'
                      ? init.body
                      : null
                })


                if (
                  url.endsWith(
                    '/publish/tiktok/oauth/start'
                  )
                ) {
                  return jsonResponse(
                    {
                      ok:
                        true,

                      type:
                        'tiktok-oauth-session',

                      session: {
                        sessionId,

                        state:
                          'awaiting-user',

                        createdAt:
                          '2026-09-27T00:30:00.000Z',

                        expiresAt:
                          '2026-09-27T00:40:00.000Z',

                        authorizationUrl:
                          'https://www.tiktok.com/v2/auth/authorize/?client_key=client&scope=video.publish'
                      }
                    },
                    201
                  )
                }


                if (
                  url.endsWith(
                    '/publish/tiktok/oauth/status'
                  )
                ) {
                  return jsonResponse({
                    ok:
                      true,

                    type:
                      'tiktok-oauth-session',

                    session: {
                      sessionId,

                      state:
                        'connected',

                      createdAt:
                        '2026-09-27T00:30:00.000Z',

                      expiresAt:
                        '2026-09-27T00:40:00.000Z',

                      connectedAt:
                        '2026-09-27T00:31:00.000Z',

                      openId:
                        'open-id-1'
                    }
                  })
                }


                if (
                  url.endsWith(
                    '/publish/tiktok/oauth/cancel'
                  )
                ) {
                  return jsonResponse({
                    ok:
                      true,

                    type:
                      'tiktok-oauth-session',

                    session: {
                      sessionId,

                      state:
                        'cancelled',

                      createdAt:
                        '2026-09-27T00:30:00.000Z',

                      expiresAt:
                        '2026-09-27T00:40:00.000Z'
                    }
                  })
                }


                if (
                  url.endsWith(
                    '/publish/tiktok/disconnect'
                  )
                ) {
                  return jsonResponse({
                    ok:
                      true,

                    type:
                      'tiktok-oauth-session',

                    session: {
                      state:
                        'idle'
                    }
                  })
                }


                throw new Error(
                  `Unexpected request: ${method} ${url}`
                )
              }
          })


        const started =
          await client
            .startTikTokOAuth()


        expect(
          started.state
        ).toBe(
          'awaiting-user'
        )


        const connected =
          await client
            .tiktokOAuthStatus()


        expect(
          connected.state
        ).toBe(
          'connected'
        )


        if (
          connected.state
            !== 'connected'
        ) {
          throw new Error(
            'Expected connected TikTok session'
          )
        }


        expect(
          connected.openId
        ).toBe(
          'open-id-1'
        )


        const cancelled =
          await client
            .cancelTikTokOAuth()


        expect(
          cancelled.state
        ).toBe(
          'cancelled'
        )


        const disconnected =
          await client
            .disconnectTikTok()


        expect(
          disconnected
        ).toEqual({
          state:
            'idle'
        })


        expect(
          calls
        ).toHaveLength(
          4
        )


        for (
          const call
          of calls
        ) {
          expect(
            call.authorization
          ).toBe(
            'Bearer local-worker-token'
          )
        }


        const serialized =
          JSON.stringify({
            started,
            connected,
            cancelled,
            disconnected,
            calls
          })


        expect(
          serialized
        ).not.toMatch(
          /access-secret|refresh-secret|client-secret/
        )
      }
    )
  }
)
