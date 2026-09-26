import {
  z
} from 'zod'

import {
  platformPublisherDescriptorSchema
} from './platformPublishing'


export const youtubePublisherDescriptor =
  platformPublisherDescriptorSchema
    .parse({
      adapterId:
        'youtube-data-api-v3',

      adapterVersion:
        '0.1.0',

      platform:
        'youtube',

      placements: [
        'youtube-video',
        'youtube-short'
      ],

      network:
        'remote-api',

      credentials:
        'external-only'
    })


const youtubeOAuthActiveSessionSchema =
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
              'Active YouTube OAuth session requires an authorization URL'
          })
        }

        if (
          session.state
            === 'connected'
          && !session.connectedAt
        ) {
          context.addIssue({
            code:
              'custom',

            path: [
              'connectedAt'
            ],

            message:
              'Connected YouTube OAuth session requires connectedAt'
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
              'Failed YouTube OAuth session requires a public error'
          })
        }
      }
    )


export const youtubeOAuthSessionSchema =
  z.union([
    z.object({
      state:
        z.literal(
          'idle'
        )
    })
      .strict(),

    youtubeOAuthActiveSessionSchema
  ])


export type YouTubeOAuthSession =
  z.infer<
    typeof youtubeOAuthSessionSchema
  >
