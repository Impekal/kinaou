import {
  expect,
  it
} from 'vitest'

import {
  avatarIdentityRuntimeSchema
} from '../src/core/avatarIdentityRuntime'

import {
  WorkerClient
} from '../src/core/workerClient'

const runtime = {
  configured: true,
  available: false,
  offlineOnly: true,
  adapterId:
    'sdxl-ip-adapter-plus-face',
  device:
    'mps' as const,
  pythonVersion:
    '3.11.16',
  packageVersions: {
    torch: '2.6.0',
    diffusers: '0.29.0'
  },
  models: {
    baseModel: {
      repoId:
        'stabilityai/stable-diffusion-xl-base-1.0',
      available: false
    },
    ipAdapter: {
      repoId:
        'h94/IP-Adapter',
      available: false
    }
  },
  missing: [
    'model:sdxl-base',
    'model:ip-adapter-plus-face'
  ],
  notes: [
    'offline only'
  ],
  rightsReview: {
    baseModelLicense:
      'CreativeML Open RAIL++-M' as const,
    adapterLicense:
      'Apache-2.0' as const,
    commercialOutput:
      'pending-verification' as const
  }
}

it(
  'parses an offline unavailable identity runtime without pretending generation is ready',
  () => {
    expect(
      avatarIdentityRuntimeSchema
        .parse(runtime)
    ).toEqual(runtime)

    expect(
      () =>
        avatarIdentityRuntimeSchema
          .parse({
            ...runtime,
            available: true
          })
    ).toThrow(
      'internally inconsistent'
    )
  }
)

it(
  'requests the authenticated avatar identity runtime from the local worker',
  async () => {
    const seen: string[] = []

    const client =
      new WorkerClient({
        baseUrl:
          'http://127.0.0.1:43117',
        token:
          'secret',
        fetchImpl:
          async (
            input,
            init
          ) => {
            seen.push(
              String(input)
            )

            expect(
              new Headers(
                init?.headers
              ).get(
                'authorization'
              )
            ).toBe(
              'Bearer secret'
            )

            return new Response(
              JSON.stringify({
                ok: true,
                type:
                  'avatar-identity-runtime',
                runtime
              }),
              {
                status: 200,
                headers: {
                  'content-type':
                    'application/json'
                }
              }
            )
          }
      })

    expect(
      await client
        .avatarIdentityRuntime()
    ).toEqual(runtime)

    expect(seen)
      .toEqual([
        'http://127.0.0.1:43117/avatar/identity/runtime'
      ])
  }
)
