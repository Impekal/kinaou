import {
  describe,
  expect,
  it
} from 'vitest'

import {
  parsePlatformCredentialStatuses,
  platformCredentialStatusSchema,
  platformCredentialStatusesSchema
} from '../src/core/platformCredentials'


describe(
  'platform credential public contract',
  () => {
    it(
      'accepts only non-secret credential availability metadata',
      () => {
        const status =
          platformCredentialStatusSchema
            .parse({
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
                'Creator account',

              scopes: [
                'youtube.upload'
              ],

              expiresAt:
                '2026-09-26T16:00:00.000Z'
            })

        expect(
          status.accountLabel
        ).toBe(
          'Creator account'
        )

        expect(
          () =>
            platformCredentialStatusSchema
              .parse({
                ...status,

                accessToken:
                  'secret-value'
              })
        ).toThrow()

        expect(
          () =>
            platformCredentialStatusSchema
              .parse({
                ...status,

                refreshToken:
                  'secret-value'
              })
        ).toThrow()
      }
    )


    it(
      'requires missing and available states to agree with secret availability booleans',
      () => {
        expect(
          () =>
            platformCredentialStatusSchema
              .parse({
                platform:
                  'youtube',

                provider:
                  'environment',

                state:
                  'missing',

                accessTokenAvailable:
                  true,

                refreshTokenAvailable:
                  false,

                scopes:
                  []
              })
        ).toThrow(
          /Missing credential status/
        )

        expect(
          () =>
            platformCredentialStatusSchema
              .parse({
                platform:
                  'youtube',

                provider:
                  'environment',

                state:
                  'available',

                accessTokenAvailable:
                  false,

                refreshTokenAvailable:
                  false,

                scopes:
                  []
              })
        ).toThrow(
          /requires worker-held/
        )
      }
    )


    it(
      'requires one safe status for every remote platform',
      () => {
        const statuses =
          parsePlatformCredentialStatuses([
            {
              platform:
                'youtube',

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
          ])

        expect(
          statuses.map(
            status =>
              status.platform
          )
        ).toEqual([
          'youtube',
          'instagram',
          'tiktok'
        ])

        expect(
          () =>
            platformCredentialStatusesSchema
              .parse([
                statuses[0],
                statuses[0],
                statuses[2]
              ])
        ).toThrow()
      }
    )
  }
)
