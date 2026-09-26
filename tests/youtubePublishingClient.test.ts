import {
  describe,
  expect,
  it
} from 'vitest'

import {
  WorkerClient
} from '../src/core/workerClient'


function response(
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


const publishRequest = {
  schemaVersion:
    1 as const,

  projectId:
    'project-1',

  packagePath:
    'KINAOU/Renders/final_youtube.publish.json',

  platform:
    'youtube' as const,

  placement:
    'youtube-short' as const,

  media: {
    path:
      'KINAOU/Renders/final.mp4',

    sizeBytes:
      4096,

    sha256:
      'a'.repeat(
        64
      )
  },

  metadata: {
    title:
      'Reviewed Short',

    description:
      'Private upload.',

    tags: [
      'KINAOU'
    ]
  },

  verifiedAt:
    '2026-09-26T20:00:00.000Z',

  requestId:
    '11111111-1111-4111-8111-111111111111',

  approval: {
    kind:
      'explicit-human' as const,

    confirmedAt:
      '2026-09-26T20:01:00.000Z'
  }
}


describe(
  'YouTube worker client',
  () => {
    it(
      'controls OAuth using only safe public session data',
      async () => {
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
                  return response(
                    {
                      ok:
                        true,

                      type:
                        'youtube-oauth-session',

                      session: {
                        sessionId:
                          '44444444-4444-4444-8444-444444444444',

                        state:
                          'awaiting-user',

                        createdAt:
                          '2026-09-26T20:00:00.000Z',

                        expiresAt:
                          '2026-09-26T20:10:00.000Z',

                        authorizationUrl:
                          'https://accounts.google.com/o/oauth2/v2/auth?client_id=test'
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
                  return response({
                    ok:
                      true,

                    type:
                      'youtube-oauth-session',

                    session: {
                      sessionId:
                        '44444444-4444-4444-8444-444444444444',

                      state:
                        'connected',

                      createdAt:
                        '2026-09-26T20:00:00.000Z',

                      expiresAt:
                        '2026-09-26T20:10:00.000Z',

                      connectedAt:
                        '2026-09-26T20:02:00.000Z'
                    }
                  })
                }

                return response({
                  ok:
                    true,

                  type:
                    'youtube-oauth-session',

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
              .startYouTubeOAuth()
          ).state
        ).toBe(
          'awaiting-user'
        )

        expect(
          (
            await client
              .youtubeOAuthStatus()
          ).state
        ).toBe(
          'connected'
        )

        expect(
          (
            await client
              .cancelYouTubeOAuth()
          ).state
        ).toBe(
          'idle'
        )

        expect(
          (
            await client
              .disconnectYouTube()
          ).state
        ).toBe(
          'idle'
        )
      }
    )


    it(
      'submits one explicit publish request and validates its receipt',
      async () => {
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
                input,
                init
              ) => {
                expect(
                  String(
                    input
                  )
                ).toContain(
                  '/publish/youtube'
                )

                expect(
                  JSON.parse(
                    String(
                      init?.body
                    )
                  )
                ).toEqual({
                  request:
                    publishRequest,

                  attemptId
                })

                return response(
                  {
                    ok:
                      true,

                    type:
                      'youtube-publish-receipt',

                    receipt: {
                      schemaVersion:
                        1,

                      receiptId:
                        '33333333-3333-4333-8333-333333333333',

                      requestId:
                        publishRequest
                          .requestId,

                      attemptId,

                      platform:
                        'youtube',

                      placement:
                        'youtube-short',

                      adapter: {
                        id:
                          'youtube-data-api-v3',

                        version:
                          '0.1.0'
                      },

                      sourceSha256:
                        publishRequest
                          .media.sha256,

                      remote: {
                        id:
                          'video-1',

                        url:
                          'https://www.youtube.com/watch?v=video-1'
                      },

                      publishedAt:
                        '2026-09-26T20:03:00.000Z'
                    }
                  },
                  201
                )
              }
          })


        const receipt =
          await client.publishYouTube(
            publishRequest,
            attemptId
          )


        expect(
          receipt.remote.id
        ).toBe(
          'video-1'
        )


        expect(
          JSON.stringify(
            receipt
          )
        ).not.toMatch(
          /access.?token|refresh.?token|secret/i
        )
      }
    )
  }
)
