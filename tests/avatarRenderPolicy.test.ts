import {
  describe,
  expect,
  it
} from 'vitest'

import {
  assertNoPlatformInferenceCost,
  chooseAvatarRenderBackend
} from '../src/core/avatarRenderPolicy'

describe(
  'Avatar render policy',
  () => {
    it(
      'always keeps preview rendering local',
      () => {
        expect(
          chooseAvatarRenderBackend(
            'preview',
            {
              localPreview:
                true,
              localGenerative:
                true,
              cloudByok:
                true,
              userProvidedCloudCredential:
                true
            }
          )
        ).toMatchObject({
          quality:
            'preview',
          backend:
            'local-preview',
          inferenceBilling:
            'none'
        })
      }
    )

    it(
      'prefers local generative rendering for final quality',
      () => {
        expect(
          chooseAvatarRenderBackend(
            'final',
            {
              localPreview:
                true,
              localGenerative:
                true,
              cloudByok:
                true,
              userProvidedCloudCredential:
                true
            }
          )
        ).toMatchObject({
          backend:
            'local-generative',
          inferenceBilling:
            'none'
        })
      }
    )

    it(
      'uses cloud only as explicit user-paid BYOK fallback',
      () => {
        expect(
          chooseAvatarRenderBackend(
            'final',
            {
              localPreview:
                true,
              localGenerative:
                false,
              cloudByok:
                true,
              userProvidedCloudCredential:
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
      'does not silently use cloud without a user credential',
      () => {
        expect(
          () =>
            chooseAvatarRenderBackend(
              'final',
              {
                localPreview:
                  true,
                localGenerative:
                  false,
                cloudByok:
                  true,
                userProvidedCloudCredential:
                  false
              }
            )
        ).toThrow(
          'No final-quality'
        )
      }
    )

    it(
      'forbids platform-paid cloud inference',
      () => {
        expect(
          () =>
            assertNoPlatformInferenceCost({
              quality:
                'final',
              backend:
                'cloud-byok',
              inferenceBilling:
                'none',
              reason:
                'invalid test state'
            })
        ).toThrow(
          'billed directly to the user'
        )
      }
    )
  }
)
