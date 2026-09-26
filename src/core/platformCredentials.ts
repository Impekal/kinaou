import {
  z
} from 'zod'

import {
  remotePublishPlatformSchema
} from './platformPublishing'


export const platformCredentialProviderSchema =
  z.enum([
    'environment',
    'system-keychain',
    'external-broker'
  ])


export type PlatformCredentialProvider =
  z.infer<
    typeof platformCredentialProviderSchema
  >


export const platformCredentialStatusSchema =
  z.object({
    platform:
      remotePublishPlatformSchema,

    provider:
      platformCredentialProviderSchema,

    state:
      z.enum([
        'missing',
        'available'
      ]),

    accessTokenAvailable:
      z.boolean(),

    refreshTokenAvailable:
      z.boolean(),

    accountLabel:
      z.string()
        .trim()
        .min(1)
        .max(200)
        .optional(),

    scopes:
      z.array(
        z.string()
          .trim()
          .min(1)
          .max(200)
      )
        .max(50)
        .refine(
          values =>
            new Set(values).size
            === values.length,
          'Credential scopes must be unique'
        ),

    expiresAt:
      z.string()
        .datetime()
        .optional()
  })
    .strict()
    .superRefine(
      (
        status,
        context
      ) => {
        const anyCredential =
          status.accessTokenAvailable
          || status.refreshTokenAvailable

        if (
          status.state === 'missing'
          && anyCredential
        ) {
          context.addIssue({
            code:
              'custom',

            path: [
              'state'
            ],

            message:
              'Missing credential status cannot report available secrets'
          })
        }

        if (
          status.state === 'available'
          && !anyCredential
        ) {
          context.addIssue({
            code:
              'custom',

            path: [
              'state'
            ],

            message:
              'Available credential status requires worker-held credentials'
          })
        }
      }
    )


export type PlatformCredentialStatus =
  z.infer<
    typeof platformCredentialStatusSchema
  >


export const platformCredentialStatusesSchema =
  z.array(
    platformCredentialStatusSchema
  )
    .length(3)
    .superRefine(
      (
        statuses,
        context
      ) => {
        const platforms =
          statuses.map(
            status =>
              status.platform
          )

        if (
          new Set(platforms).size
          !== 3
        ) {
          context.addIssue({
            code:
              'custom',

            message:
              'Credential status list must contain each remote platform exactly once'
          })
        }

        for (
          const platform
          of [
            'youtube',
            'instagram',
            'tiktok'
          ] as const
        ) {
          if (
            !platforms.includes(
              platform
            )
          ) {
            context.addIssue({
              code:
                'custom',

              message:
                `Credential status is missing ${platform}`
            })
          }
        }
      }
    )


export function parsePlatformCredentialStatuses(
  value:
    unknown
): PlatformCredentialStatus[] {
  return platformCredentialStatusesSchema
    .parse(
      value
    )
}
