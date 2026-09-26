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


describe(
  'Instagram publish WorkerClient',
  () => {
    it(
      'submits one explicit Reel request and validates the receipt',
      async () => {
        const request = {
          schemaVersion:
            1 as const,

          projectId:
            'instagram-project',

          packagePath:
            'KINAOU/Renders/reel_instagram.publish.json',

          platform:
            'instagram' as const,

          placement:
            'instagram-reel' as const,

          media: {
            path:
              'KINAOU/Renders/reel.mp4',

            sizeBytes:
              4096,

            sha256:
              'a'.repeat(
                64
              )
          },

          metadata: {
            title:
              'Reviewed Reel',

            description:
              'Explicit publishing.',

            tags: [
              'KINAOU'
            ]
          },

          verifiedAt:
            '2026-09-26T21:00:00.000Z',

          requestId:
            '11111111-1111-4111-8111-111111111111',

          approval: {
            kind:
              'explicit-human' as const,

            confirmedAt:
              '2026-09-26T21:01:00.000Z'
          }
        }


        const attemptId =
          '22222222-2222-4222-8222-222222222222'


        const client =
          new WorkerClient({
            baseUrl:
              'http://127.0.0.1:43117',

            token:
              'worker-token',

            fetchImpl:
              async (
                _input,
                init
              ) => {
                expect(
                  JSON.parse(
                    String(
                      init?.body
                    )
                  )
                ).toEqual({
                  request,
                  attemptId
                })


                return jsonResponse(
                  {
                    ok:
                      true,

                    type:
                      'instagram-publish-receipt',

                    receipt: {
                      schemaVersion:
                        1,

                      receiptId:
                        '33333333-3333-4333-8333-333333333333',

                      requestId:
                        request.requestId,

                      attemptId,

                      platform:
                        'instagram',

                      placement:
                        'instagram-reel',

                      adapter: {
                        id:
                          'instagram-platform-api',

                        version:
                          '0.1.0'
                      },

                      sourceSha256:
                        request.media
                          .sha256,

                      remote: {
                        id:
                          'instagram-media-1'
                      },

                      publishedAt:
                        '2026-09-26T21:05:00.000Z'
                    }
                  },
                  201
                )
              }
          })


        const result =
          await client
            .publishInstagram(
              request,
              attemptId
            )


        expect(
          'remote'
          in result
        ).toBe(
          true
        )


        if (
          !(
            'remote'
            in result
          )
        ) {
          throw new Error(
            'Expected completed Instagram publish receipt'
          )
        }


        expect(
          result.remote.id
        ).toBe(
          'instagram-media-1'
        )


        expect(
          JSON.stringify(
            result
          )
        ).not.toMatch(
          /access.?token|delivery.?url|signature=/i
        )
      }
    )
  }
)


describe(
  'Instagram pending publication WorkerClient',
  () => {
    it(
      'returns and explicitly resumes the same signed pending container',
      async () => {
        const pending = {
          schemaVersion:
            1 as const,

          kind:
            'instagram-publish-pending' as const,

          requestId:
            '11111111-1111-4111-8111-111111111111',

          attemptId:
            '22222222-2222-4222-8222-222222222222',

          platform:
            'instagram' as const,

          placement:
            'instagram-reel' as const,

          media: {
            path:
              'KINAOU/Renders/reel.mp4',

            sizeBytes:
              4096,

            sha256:
              'a'.repeat(
                64
              )
          },

          containerId:
            'container-1',

          issuedAt:
            '2026-09-26T21:02:00.000Z',

          signature:
            'b'.repeat(
              64
            )
        }


        const request = {
          schemaVersion:
            1 as const,

          projectId:
            'instagram-project',

          packagePath:
            'KINAOU/Renders/reel_instagram.publish.json',

          platform:
            'instagram' as const,

          placement:
            'instagram-reel' as const,

          media:
            pending.media,

          metadata: {
            title:
              'Reviewed Reel',

            description:
              'Explicit publishing.',

            tags:
              [
                'KINAOU'
              ]
          },

          verifiedAt:
            '2026-09-26T21:00:00.000Z',

          requestId:
            pending.requestId,

          approval: {
            kind:
              'explicit-human' as const,

            confirmedAt:
              '2026-09-26T21:01:00.000Z'
          }
        }


        let calls =
          0


        const client =
          new WorkerClient({
            baseUrl:
              'http://127.0.0.1:43117',

            token:
              'worker-token',

            fetchImpl:
              async (
                input
              ) => {
                calls +=
                  1

                if (
                  String(
                    input
                  ).endsWith(
                    '/publish/instagram'
                  )
                ) {
                  return jsonResponse(
                    {
                      ok:
                        true,

                      type:
                        'instagram-publish-pending',

                      pending
                    },
                    202
                  )
                }


                return jsonResponse(
                  {
                    ok:
                      true,

                    type:
                      'instagram-publish-receipt',

                    receipt: {
                      schemaVersion:
                        1,

                      receiptId:
                        '33333333-3333-4333-8333-333333333333',

                      requestId:
                        pending.requestId,

                      attemptId:
                        pending.attemptId,

                      platform:
                        'instagram',

                      placement:
                        'instagram-reel',

                      adapter: {
                        id:
                          'instagram-platform-api',

                        version:
                          '0.1.0'
                      },

                      sourceSha256:
                        pending.media
                          .sha256,

                      remote: {
                        id:
                          'instagram-media-1'
                      },

                      publishedAt:
                        '2026-09-26T21:05:00.000Z'
                    }
                  },
                  201
                )
              }
          })


        const first =
          await client
            .publishInstagram(
              request,
              pending.attemptId
            )


        expect(
          'kind'
          in first
        ).toBe(
          true
        )


        if (
          !(
            'kind'
            in first
          )
        ) {
          throw new Error(
            'Expected pending Instagram publication'
          )
        }


        const resumed =
          await client
            .resumeInstagramPublish(
              first
            )


        expect(
          'remote'
          in resumed
        ).toBe(
          true
        )


        expect(
          calls
        ).toBe(
          2
        )
      }
    )
  }
)
