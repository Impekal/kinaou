import {
  z
} from 'zod'

import {
  platformPublisherDescriptorSchema,
  type PlatformPublisherDescriptor
} from './platformPublishing'


export const tiktokPublisherDescriptor:
  PlatformPublisherDescriptor =
    platformPublisherDescriptorSchema
      .parse({
        adapterId:
          'tiktok-content-posting-api',

        adapterVersion:
          '0.1.0',

        platform:
          'tiktok',

        placements: [
          'tiktok-video'
        ],

        network:
          'remote-api',

        credentials:
          'external-only'
      })


export const tiktokPublishingScopes =
  [
    'video.publish'
  ] as const


export const tiktokPrivacyLevelSchema =
  z.enum([
    'PUBLIC_TO_EVERYONE',
    'MUTUAL_FOLLOW_FRIENDS',
    'FOLLOWER_OF_CREATOR',
    'SELF_ONLY'
  ])


export type TikTokPrivacyLevel =
  z.infer<
    typeof tiktokPrivacyLevelSchema
  >


export const tiktokCreatorInfoSchema =
  z.object({
    creatorUsername:
      z.string()
        .trim()
        .min(1)
        .max(200),

    creatorNickname:
      z.string()
        .trim()
        .min(1)
        .max(200),

    creatorAvatarUrl:
      z.string()
        .url()
        .max(2000)
        .optional(),

    privacyLevelOptions:
      z.array(
        tiktokPrivacyLevelSchema
      )
        .min(1)
        .max(4)
        .refine(
          values =>
            new Set(
              values
            ).size
            === values.length,

          'TikTok privacy options must be unique'
        ),

    commentDisabled:
      z.boolean(),

    duetDisabled:
      z.boolean(),

    stitchDisabled:
      z.boolean(),

    maxVideoPostDurationSec:
      z.number()
        .int()
        .positive()
        .max(
          600
        )
  })
    .strict()


export type TikTokCreatorInfo =
  z.infer<
    typeof tiktokCreatorInfoSchema
  >


export const tiktokCommercialContentSchema =
  z.object({
    enabled:
      z.boolean(),

    yourBrand:
      z.boolean(),

    brandedContent:
      z.boolean()
  })
    .strict()
    .superRefine(
      (
        value,
        context
      ) => {
        if (
          !value.enabled
          && (
            value.yourBrand
            || value.brandedContent
          )
        ) {
          context.addIssue({
            code:
              'custom',

            message:
              'Commercial-content selections require disclosure to be enabled'
          })
        }


        if (
          value.enabled
          && !value.yourBrand
          && !value.brandedContent
        ) {
          context.addIssue({
            code:
              'custom',

            message:
              'Commercial-content disclosure requires at least one selection'
          })
        }
      }
    )


export const tiktokPostSettingsSchema =
  z.object({
    /*
     * TikTok calls this field "title", but it functions as the editable
     * post caption and may contain hashtags and mentions.
     */
    title:
      z.string()
        .trim()
        .max(
          2200
        ),

    /*
     * Deliberately required and without a default.
     * TikTok requires the user to choose from the latest creator-info
     * privacy options.
     */
    privacyLevel:
      tiktokPrivacyLevelSchema,

    /*
     * Deliberately required booleans with no schema defaults.
     * UI defaults will be false and the user must opt in.
     */
    allowComment:
      z.boolean(),

    allowDuet:
      z.boolean(),

    allowStitch:
      z.boolean(),

    commercialContent:
      tiktokCommercialContentSchema,

    /*
     * Explicit declaration state for AI-generated material.
     * No inference from project content occurs here.
     */
    isAigc:
      z.boolean(),

    /*
     * TikTok's posting UX requires the user to agree before posting.
     */
    musicUsageConsent:
      z.literal(
        true
      ),

    brandedContentPolicyConsent:
      z.boolean()
  })
    .strict()


export type TikTokPostSettings =
  z.infer<
    typeof tiktokPostSettingsSchema
  >


export const tiktokPostReviewSchema =
  z.object({
    schemaVersion:
      z.literal(
        1
      ),

    creatorInfo:
      tiktokCreatorInfoSchema,

    creatorInfoCheckedAt:
      z.string()
        .datetime(),

    videoDurationMs:
      z.number()
        .int()
        .positive(),

    settings:
      tiktokPostSettingsSchema
  })
    .strict()
    .superRefine(
      (
        review,
        context
      ) => {
        const {
          creatorInfo,
          settings
        } =
          review


        if (
          !creatorInfo
            .privacyLevelOptions
            .includes(
              settings
                .privacyLevel
            )
        ) {
          context.addIssue({
            code:
              'custom',

            path: [
              'settings',
              'privacyLevel'
            ],

            message:
              'Selected TikTok privacy level is not available for this creator'
          })
        }


        if (
          creatorInfo.commentDisabled
          && settings.allowComment
        ) {
          context.addIssue({
            code:
              'custom',

            path: [
              'settings',
              'allowComment'
            ],

            message:
              'TikTok comments are disabled for this creator'
          })
        }


        if (
          creatorInfo.duetDisabled
          && settings.allowDuet
        ) {
          context.addIssue({
            code:
              'custom',

            path: [
              'settings',
              'allowDuet'
            ],

            message:
              'TikTok Duet is disabled for this creator'
          })
        }


        if (
          creatorInfo.stitchDisabled
          && settings.allowStitch
        ) {
          context.addIssue({
            code:
              'custom',

            path: [
              'settings',
              'allowStitch'
            ],

            message:
              'TikTok Stitch is disabled for this creator'
          })
        }


        if (
          review.videoDurationMs
          > creatorInfo
              .maxVideoPostDurationSec
              * 1000
        ) {
          context.addIssue({
            code:
              'custom',

            path: [
              'videoDurationMs'
            ],

            message:
              'TikTok video exceeds the creator-specific maximum duration'
          })
        }


        if (
          settings
            .commercialContent
            .brandedContent
          && settings
            .privacyLevel
            === 'SELF_ONLY'
        ) {
          context.addIssue({
            code:
              'custom',

            path: [
              'settings',
              'privacyLevel'
            ],

            message:
              'TikTok branded content cannot use SELF_ONLY visibility'
          })
        }


        if (
          settings
            .commercialContent
            .brandedContent
          && !settings
            .brandedContentPolicyConsent
        ) {
          context.addIssue({
            code:
              'custom',

            path: [
              'settings',
              'brandedContentPolicyConsent'
            ],

            message:
              'TikTok branded content requires explicit policy consent'
          })
        }
      }
    )


export type TikTokPostReview =
  z.infer<
    typeof tiktokPostReviewSchema
  >


export function createTikTokPostReview(
  creatorInfo:
    TikTokCreatorInfo,

  videoDurationMs:
    number,

  settings:
    TikTokPostSettings,

  checkedAt =
    new Date()
): TikTokPostReview {
  return tiktokPostReviewSchema
    .parse({
      schemaVersion:
        1,

      creatorInfo,

      creatorInfoCheckedAt:
        checkedAt.toISOString(),

      videoDurationMs,

      settings
    })
}


const tiktokOAuthActiveSessionSchema =
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

    openId:
      z.string()
        .trim()
        .min(1)
        .max(500)
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
              'Active TikTok OAuth session requires an authorization URL'
          })
        }


        if (
          session.state
            === 'connected'
          && (
            !session.connectedAt
            || !session.openId
          )
        ) {
          context.addIssue({
            code:
              'custom',

            message:
              'Connected TikTok OAuth session requires connectedAt and openId'
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
              'Failed TikTok OAuth session requires a public error'
          })
        }
      }
    )


export const tiktokOAuthSessionSchema =
  z.union([
    z.object({
      state:
        z.literal(
          'idle'
        )
    })
      .strict(),

    tiktokOAuthActiveSessionSchema
  ])


export type TikTokOAuthSession =
  z.infer<
    typeof tiktokOAuthSessionSchema
  >


export const tiktokCreatorInfoSnapshotSchema =
  z.object({
    schemaVersion:
      z.literal(
        1
      ),

    checkedAt:
      z.string()
        .datetime(),

    creatorInfo:
      tiktokCreatorInfoSchema
  })
    .strict()


export type TikTokCreatorInfoSnapshot =
  z.infer<
    typeof tiktokCreatorInfoSnapshotSchema
  >


export function createTikTokPostReviewFromSnapshot(
  snapshot:
    TikTokCreatorInfoSnapshot,

  videoDurationMs:
    number,

  settings:
    TikTokPostSettings
): TikTokPostReview {
  const normalized =
    tiktokCreatorInfoSnapshotSchema
      .parse(
        snapshot
      )

  return createTikTokPostReview(
    normalized.creatorInfo,
    videoDurationMs,
    settings,
    new Date(
      normalized.checkedAt
    )
  )
}
