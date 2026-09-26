import {
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
): Response {
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


it(
  'reads only safe platform credential status from the authenticated local worker',
  async () => {
    const statuses = [
      {
        platform:
          'youtube',

        provider:
          'environment',

        state:
          'available',

        accessTokenAvailable:
          true,

        refreshTokenAvailable:
          true,

        accountLabel:
          'Creator',

        scopes: [
          'youtube.upload'
        ]
      },
      {
        platform:
          'instagram',

        provider:
          'environment',

        state:
          'missing',

        accessTokenAvailable:
          false,

        refreshTokenAvailable:
          false,

        scopes:
          []
      },
      {
        platform:
          'tiktok',

        provider:
          'environment',

        state:
          'missing',

        accessTokenAvailable:
          false,

        refreshTokenAvailable:
          false,

        scopes:
          []
      }
    ] as const

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
              '/publish/credentials'
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

            return jsonResponse({
              ok:
                true,

              type:
                'publish-credentials',

              statuses
            })
          }
      })

    expect(
      await client
        .platformCredentialStatuses()
    ).toEqual(
      statuses
    )


    const leaking =
      new WorkerClient({
        baseUrl:
          'http://127.0.0.1:43117',

        token:
          'worker-token',

        fetchImpl:
          async () =>
            jsonResponse({
              ok:
                true,

              type:
                'publish-credentials',

              statuses: [
                {
                  ...statuses[0],

                  accessToken:
                    'leaked-secret'
                },
                statuses[1],
                statuses[2]
              ]
            })
      })

    await expect(
      leaking
        .platformCredentialStatuses()
    ).rejects.toThrow()
  }
)
