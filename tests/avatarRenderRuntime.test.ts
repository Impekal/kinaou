import {
  describe,
  expect,
  it
} from 'vitest'

import {
  activeLocalGenerativeEngine,
  avatarRenderAvailabilityFromRuntime,
  chooseAvatarRenderForRuntime,
  parseAvatarRenderRuntime
} from '../src/core/avatarRenderRuntime'

import type {
  AvatarEngineDescriptor
} from '../src/core/project'


const rights:
  AvatarEngineDescriptor['rights'] = {
  licenseName:
    'Test local model license',

  licenseSnapshotAt:
    '2026-09-25T12:00:00.000Z',

  privateUse:
    'allowed' as const,

  commercialOutput:
    'allowed' as const,

  commercialSoftwareUse:
    'allowed' as const,

  modelRedistribution:
    'restricted' as const,

  attributionRequired:
    false,

  notes:
    'Test fixture only'
}


function finalEngine():
  AvatarEngineDescriptor {
  return {
    adapterId:
      'local-photoreal-video',

    engineId:
      'test-local-video-engine',

    engineVersion:
      '1',

    modelId:
      'example/open-video-model',

    modelVersion:
      'test-revision',

    capabilities: [
      'identity-preservation',
      'image-reference',
      'scene-video',
      'motion',
      'expression',
      'lip-sync'
    ],

    rights
  }
}


function macPreviewRuntime() {
  return {
    schemaVersion:
      1 as const,

    host: {
      platform:
        'darwin' as const,

      arch:
        'arm64' as const,

      accelerator:
        'mps' as const,

      acceleratorName:
        'Apple M2 Pro',

      systemMemoryBytes:
        16 * 1024 ** 3
    },

    preview: {
      configured:
        true,

      available:
        true,

      offlineOnly:
        true as const,

      engineId:
        'liveportrait-mediapipe',

      notes: [
        'Preview only'
      ]
    },

    localGenerative: {
      configured:
        false,

      available:
        false,

      offlineOnly:
        true as const,

      missing: [
        'runtime:local-generative'
      ],

      notes: [
        'No final photoreal engine is installed'
      ]
    }
  }
}


function windowsFinalRuntime() {
  return {
    schemaVersion:
      1 as const,

    host: {
      platform:
        'win32' as const,

      arch:
        'x64' as const,

      accelerator:
        'cuda' as const,

      acceleratorName:
        'NVIDIA CUDA GPU',

      vramBytes:
        32 * 1024 ** 3,

      systemMemoryBytes:
        64 * 1024 ** 3
    },

    preview: {
      configured:
        true,

      available:
        true,

      offlineOnly:
        true as const,

      engineId:
        'local-preview',

      notes: []
    },

    localGenerative: {
      configured:
        true,

      available:
        true,

      offlineOnly:
        true as const,

      engine:
        finalEngine(),

      missing: [],

      notes: [
        'Local final renderer ready'
      ]
    }
  }
}


describe(
  'Avatar render runtime',
  () => {
    it(
      'represents the current Mac as local preview without inventing a final renderer',
      () => {
        const runtime =
          parseAvatarRenderRuntime(
            macPreviewRuntime()
          )

        expect(
          runtime.host
        ).toMatchObject({
          platform:
            'darwin',
          arch:
            'arm64',
          accelerator:
            'mps'
        })

        expect(
          avatarRenderAvailabilityFromRuntime(
            runtime
          )
        ).toEqual({
          localPreview:
            true,
          localGenerative:
            false,
          cloudByok:
            false,
          userProvidedCloudCredential:
            false
        })

        expect(
          chooseAvatarRenderForRuntime(
            'preview',
            runtime
          )
        ).toMatchObject({
          backend:
            'local-preview',
          inferenceBilling:
            'none'
        })

        expect(
          () =>
            chooseAvatarRenderForRuntime(
              'final',
              runtime
            )
        ).toThrow(
          'No final-quality'
        )
      }
    )

    it(
      'activates a verified local generative engine independently of operating system UI code',
      () => {
        const runtime =
          parseAvatarRenderRuntime(
            windowsFinalRuntime()
          )

        expect(
          chooseAvatarRenderForRuntime(
            'final',
            runtime,
            {
              available:
                true,
              userProvidedCredential:
                true
            }
          )
        ).toMatchObject({
          backend:
            'local-generative',
          inferenceBilling:
            'none'
        })

        expect(
          activeLocalGenerativeEngine(
            runtime
          )
        ).toMatchObject({
          engineId:
            'test-local-video-engine',
          modelId:
            'example/open-video-model'
        })
      }
    )

    it(
      'allows BYOK only when no local final renderer exists and the user supplied the credential',
      () => {
        expect(
          chooseAvatarRenderForRuntime(
            'final',
            macPreviewRuntime(),
            {
              available:
                true,
              userProvidedCredential:
                true
            }
          )
        ).toMatchObject({
          backend:
            'cloud-byok',
          inferenceBilling:
            'user'
        })
      }
    )

    it(
      'rejects a final engine without required motion capability',
      () => {
        const value =
          windowsFinalRuntime()

        value.localGenerative.engine = {
          ...finalEngine(),
          capabilities: [
            'identity-preservation',
            'scene-video'
          ]
        }

        expect(
          () =>
            parseAvatarRenderRuntime(
              value
            )
        ).toThrow(
          'motion'
        )
      }
    )

    it(
      'rejects a local final engine whose commercial software rights are not verified',
      () => {
        const value =
          windowsFinalRuntime()

        value.localGenerative.engine = {
          ...finalEngine(),

          rights: {
            ...rights,

            commercialSoftwareUse:
              'unknown'
          }
        }

        expect(
          () =>
            parseAvatarRenderRuntime(
              value
            )
        ).toThrow(
          'commercial-software'
        )
      }
    )

    it(
      'keeps hardware data descriptive rather than hard-wiring one model family',
      () => {
        const runtime =
          parseAvatarRenderRuntime(
            windowsFinalRuntime()
          )

        expect(
          runtime.host.vramBytes
        ).toBe(
          32 * 1024 ** 3
        )

        expect(
          JSON.stringify(
            runtime
          )
        ).not.toContain(
          'ltx'
        )

        expect(
          JSON.stringify(
            runtime
          )
        ).not.toContain(
          'wan'
        )

        expect(
          JSON.stringify(
            runtime
          )
        ).not.toContain(
          'higgsfield'
        )
      }
    )
  }
)
