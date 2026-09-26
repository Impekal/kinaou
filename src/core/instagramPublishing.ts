import {
  z
} from 'zod'

import {
  platformPublisherDescriptorSchema
} from './platformPublishing'


export const instagramPublishingScopes = [
  'instagram_business_basic',
  'instagram_business_content_publish'
] as const


export const instagramPublisherDescriptor =
  platformPublisherDescriptorSchema
    .parse({
      adapterId:
        'instagram-platform-api',

      adapterVersion:
        '0.1.0',

      platform:
        'instagram',

      /*
       * Phase 5.6 starts with Reels only.
       *
       * Feed-video publishing remains outside the adapter until its
       * delivery and API behavior are independently accepted.
       */
      placements: [
        'instagram-reel'
      ],

      network:
        'remote-api',

      credentials:
        'external-only'
    })



export const instagramOAuthAccountSchema =
  z.object({
    accountId:
      z.string()
        .trim()
        .min(1)
        .max(300),

    username:
      z.string()
        .trim()
        .min(1)
        .max(200),

    accountLabel:
      z.string()
        .trim()
        .min(1)
        .max(200),

    name:
      z.string()
        .trim()
        .min(1)
        .max(300)
        .optional(),

    profilePictureUrl:
      z.string()
        .url()
        .max(5000)
        .optional()
  })
    .strict()


const instagramOAuthActiveSessionSchema =
  z.object({
    sessionId:
      z.string()
        .uuid(),

    state:
      z.enum([
        'awaiting-user',
        'connected',
        'failed',
        'expired',
        'cancelled'
      ]),

    createdAt:
      z.string()
        .datetime(),

    expiresAt:
      z.string()
        .datetime(),

    authorizationUrl:
      z.string()
        .url()
        .optional(),

    connectedAt:
      z.string()
        .datetime()
        .optional(),

    account:
      instagramOAuthAccountSchema
        .optional(),

    error:
      z.string()
        .trim()
        .min(1)
        .max(500)
        .optional()
  })
    .strict()
    .superRefine(
      (
        session,
        context
      ) => {
        if (
          session.state
            === 'awaiting-user'
          && !session.authorizationUrl
        ) {
          context.addIssue({
            code:
              'custom',

            path: [
              'authorizationUrl'
            ],

            message:
              'Awaiting Instagram OAuth session requires authorizationUrl'
          })
        }

        if (
          session.state
            === 'connected'
          && (
            !session.connectedAt
            || !session.account
          )
        ) {
          context.addIssue({
            code:
              'custom',

            message:
              'Connected Instagram OAuth session requires account and connectedAt'
          })
        }

        if (
          session.state
            === 'failed'
          && !session.error
        ) {
          context.addIssue({
            code:
              'custom',

            path: [
              'error'
            ],

            message:
              'Failed Instagram OAuth session requires a public error'
          })
        }
      }
    )


export const instagramOAuthSessionSchema =
  z.union([
    z.object({
      state:
        z.literal(
          'idle'
        )
    })
      .strict(),

    instagramOAuthActiveSessionSchema
  ])


export const instagramOAuthCallbackEnvelopeSchema =
  z.object({
    schemaVersion:
      z.literal(
        1
      ),

    sessionId:
      z.string()
        .uuid(),

    state:
      z.string()
        .trim()
        .min(1)
        .max(500),

    code:
      z.string()
        .trim()
        .min(1)
        .max(20_000)
  })
    .strict()


export type InstagramOAuthSession =
  z.infer<
    typeof instagramOAuthSessionSchema
  >


export type InstagramOAuthCallbackEnvelope =
  z.infer<
    typeof instagramOAuthCallbackEnvelopeSchema
  >


export const instagramPublishPendingSchema =
  z.object({
    schemaVersion:
      z.literal(
        1
      ),

    kind:
      z.literal(
        'instagram-publish-pending'
      ),

    requestId:
      z.string()
        .uuid(),

    attemptId:
      z.string()
        .uuid(),

    platform:
      z.literal(
        'instagram'
      ),

    placement:
      z.literal(
        'instagram-reel'
      ),

    media:
      z.object({
        path:
          z.string()
            .trim()
            .min(1)
            .max(700)
            .refine(
              value =>
                value.startsWith(
                  'KINAOU/Renders/'
                )
                && value.endsWith(
                  '.mp4'
                ),

              'Pending Instagram source must be a managed render MP4'
            ),

        sizeBytes:
          z.number()
            .int()
            .positive(),

        sha256:
          z.string()
            .regex(
              /^[a-f0-9]{64}$/
            )
      })
        .strict(),

    containerId:
      z.string()
        .trim()
        .min(1)
        .max(500),

    issuedAt:
      z.string()
        .datetime(),

    signature:
      z.string()
        .regex(
          /^[a-f0-9]{64}$/
        )
  })
    .strict()


export type InstagramPublishPending =
  z.infer<
    typeof instagramPublishPendingSchema
  >


export function parseInstagramBrokerCallbackUrl(
  value:
    string
): {
  state:
    string

  code:
    string
} {
  const raw =
    value.trim()

  if (
    !raw
    || raw.length > 20_000
  ) {
    throw new Error(
      'Instagram callback URL is invalid'
    )
  }


  let url:
    URL

  try {
    url =
      new URL(
        raw
      )
  } catch {
    throw new Error(
      'Instagram callback must be a valid URL'
    )
  }


  if (
    url.protocol !== 'https:'
    || url.username
    || url.password
  ) {
    throw new Error(
      'Instagram callback must use HTTPS'
    )
  }


  const remoteError =
    url.searchParams
      .get(
        'error_description'
      )
    ?? url.searchParams
      .get(
        'error'
      )


  if (
    remoteError
  ) {
    throw new Error(
      `Instagram authorization was not completed: ${
        remoteError
          .slice(
            0,
            500
          )
      }`
    )
  }


  const state =
    url.searchParams
      .get(
        'state'
      )
      ?.trim()

  const code =
    url.searchParams
      .get(
        'code'
      )
      ?.trim()


  if (
    !state
    || state.length > 500
  ) {
    throw new Error(
      'Instagram callback does not contain a valid state'
    )
  }


  if (
    !code
    || code.length > 20_000
  ) {
    throw new Error(
      'Instagram callback does not contain an authorization code'
    )
  }


  return {
    state,
    code
  }
}
