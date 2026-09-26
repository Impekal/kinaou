import {
  describe,
  expect,
  it
} from 'vitest'

import {
  WorkerClient
} from '../src/core/workerClient'


function jsonResponse(
  body:
    unknown,
  status =
    200
) {
  return new Response(
    JSON.stringify(
      body
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
  'Instagram OAuth WorkerClient',
  () => {
    it(
      'controls explicit Instagram OAuth without exposing credentials',
      async () => {
        const requests:
          Array<{
            url:
              string

            method:
              string

            body:
              string
          }> =
            []


        const client =
          new WorkerClient({
            baseUrl:
              'http://127.0.0.1:43117',

            token:
              'worker-token',

            fetchImpl:
              async (
                input,
                init
              ) => {
                const url =
                  String(
                    input
                  )

                requests.push({
                  url,

                  method:
                    init?.method
                    ?? 'GET',

                  body:
                    init?.body
                      ? String(
                          init.body
                        )
                      : ''
                })


                expect(
                  new Headers(
                    init?.headers
                  ).get(
                    'authorization'
                  )
                ).toBe(
                  'Bearer worker-token'
                )


                if (
                  url.endsWith(
                    '/oauth/start'
                  )
                ) {
                  return jsonResponse(
                    {
                      ok:
                        true,

                      type:
                        'instagram-oauth-session',

                      session: {
                        sessionId:
                          '11111111-1111-4111-8111-111111111111',

                        state:
                          'awaiting-user',

                        createdAt:
                          '2026-09-26T21:00:00.000Z',

                        expiresAt:
                          '2026-09-26T21:10:00.000Z',

                        authorizationUrl:
                          'https://www.instagram.com/oauth/authorize?client_id=test'
                      }
                    },
                    201
                  )
                }


                if (
                  url.endsWith(
                    '/oauth/status'
                  )
                ) {
                  return jsonResponse({
                    ok:
                      true,

                    type:
                      'instagram-oauth-session',

                    session: {
                      sessionId:
                        '11111111-1111-4111-8111-111111111111',

                      state:
                        'connected',

                      createdAt:
                        '2026-09-26T21:00:00.000Z',

                      expiresAt:
                        '2026-11-25T21:01:00.000Z',

                      connectedAt:
                        '2026-09-26T21:01:00.000Z',

                      account: {
                        accountId:
                          '17841400000000000',

                        username:
                          'kinaou_creator',

                        accountLabel:
                          '@kinaou_creator'
                      }
                    }
                  })
                }


                if (
                  url.endsWith(
                    '/oauth/complete'
                  )
                ) {
                  const body =
                    JSON.parse(
                      String(
                        init?.body
                      )
                    )

                  expect(
                    body
                  ).toEqual({
                    schemaVersion:
                      1,

                    sessionId:
                      '11111111-1111-4111-8111-111111111111',

                    state:
                      'csrf-state',

                    code:
                      'single-use-code'
                  })


                  return jsonResponse({
                    ok:
                      true,

                    type:
                      'instagram-oauth-session',

                    session: {
                      sessionId:
                        '11111111-1111-4111-8111-111111111111',

                      state:
                        'connected',

                      createdAt:
                        '2026-09-26T21:00:00.000Z',

                      expiresAt:
                        '2026-11-25T21:01:00.000Z',

                      connectedAt:
                        '2026-09-26T21:01:00.000Z',

                      account: {
                        accountId:
                          '17841400000000000',

                        username:
                          'kinaou_creator',

                        accountLabel:
                          '@kinaou_creator'
                      }
                    }
                  })
                }


                return jsonResponse({
                  ok:
                    true,

                  type:
                    'instagram-oauth-session',

                  session: {
                    state:
                      'idle'
                  }
                })
              }
          })


        expect(
          (
            await client
              .startInstagramOAuth()
          ).state
        ).toBe(
          'awaiting-user'
        )


        expect(
          (
            await client
              .instagramOAuthStatus()
          ).state
        ).toBe(
          'connected'
        )


        const completed =
          await client
            .completeInstagramOAuth({
              schemaVersion:
                1,

              sessionId:
                '11111111-1111-4111-8111-111111111111',

              state:
                'csrf-state',

              code:
                'single-use-code'
            })


        expect(
          completed.state
        ).toBe(
          'connected'
        )


        expect(
          (
            await client
              .cancelInstagramOAuth()
          ).state
        ).toBe(
          'idle'
        )


        expect(
          (
            await client
              .disconnectInstagram()
          ).state
        ).toBe(
          'idle'
        )


        const serialized =
          JSON.stringify(
            requests
          )


        expect(
          serialized
        ).not.toMatch(
          /client.?secret|long-token|short-token/i
        )
      }
    )
  }
)
