import {
  describe,
  expect,
  it
} from 'vitest'

import {
  createTikTokPostReview,
  tiktokPostReviewSchema,
  tiktokPostSettingsSchema,
  tiktokPublisherDescriptor,
  tiktokPublishingScopes,
  type TikTokCreatorInfo,
  type TikTokPostSettings
} from '../src/core/tiktokPublishing'


const creator:
  TikTokCreatorInfo = {
    creatorUsername:
      'kinaou.creator',

    creatorNickname:
      'KINAOU Creator',

    creatorAvatarUrl:
      'https://example.com/avatar.jpg',

    privacyLevelOptions: [
      'PUBLIC_TO_EVERYONE',
      'MUTUAL_FOLLOW_FRIENDS',
      'SELF_ONLY'
    ],

    commentDisabled:
      false,

    duetDisabled:
      false,

    stitchDisabled:
      true,

    maxVideoPostDurationSec:
      180
  }


const settings:
  TikTokPostSettings = {
    title:
      'Reviewed KINAOU clip #kinaou',

    privacyLevel:
      'MUTUAL_FOLLOW_FRIENDS',

    allowComment:
      true,

    allowDuet:
      false,

    allowStitch:
      false,

    commercialContent: {
      enabled:
        false,

      yourBrand:
        false,

      brandedContent:
        false
    },

    isAigc:
      false,

    musicUsageConsent:
      true,

    brandedContentPolicyConsent:
      false
  }


describe(
  'TikTok explicit publishing contract',
  () => {
    it(
      'declares only TikTok video Direct Post and video.publish',
      () => {
        expect(
          tiktokPublisherDescriptor
        ).toEqual({
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


        expect(
          tiktokPublishingScopes
        ).toEqual([
          'video.publish'
        ])
      }
    )


    it(
      'requires the user to make an explicit privacy selection',
      () => {
        expect(
          () =>
            tiktokPostSettingsSchema
              .parse({
                ...settings,

                privacyLevel:
                  undefined
              })
        ).toThrow()
      }
    )


    it(
      'accepts a creator-bound explicit post review',
      () => {
        const review =
          createTikTokPostReview(
            creator,
            60_000,
            settings,
            new Date(
              '2026-09-27T00:15:00.000Z'
            )
          )


        expect(
          review.creatorInfo
            .creatorNickname
        ).toBe(
          'KINAOU Creator'
        )


        expect(
          review.settings
            .privacyLevel
        ).toBe(
          'MUTUAL_FOLLOW_FRIENDS'
        )


        expect(
          review.creatorInfoCheckedAt
        ).toBe(
          '2026-09-27T00:15:00.000Z'
        )
      }
    )


    it(
      'rejects unavailable privacy, disabled interactions and excessive duration',
      () => {
        expect(
          () =>
            createTikTokPostReview(
              {
                ...creator,

                commentDisabled:
                  true
              },
              181_000,
              {
                ...settings,

                privacyLevel:
                  'FOLLOWER_OF_CREATOR',

                allowComment:
                  true
              },
              new Date(
                '2026-09-27T00:15:00.000Z'
              )
            )
        ).toThrow()
      }
    )


    it(
      'enforces explicit commercial-content disclosure rules',
      () => {
        expect(
          () =>
            tiktokPostReviewSchema
              .parse({
                schemaVersion:
                  1,

                creatorInfo:
                  creator,

                creatorInfoCheckedAt:
                  '2026-09-27T00:15:00.000Z',

                videoDurationMs:
                  60_000,

                settings: {
                  ...settings,

                  privacyLevel:
                    'SELF_ONLY',

                  commercialContent: {
                    enabled:
                      true,

                    yourBrand:
                      false,

                    brandedContent:
                      true
                  },

                  brandedContentPolicyConsent:
                    true
                }
              })
        ).toThrow(
          /SELF_ONLY/
        )


        expect(
          () =>
            tiktokPostSettingsSchema
              .parse({
                ...settings,

                commercialContent: {
                  enabled:
                    true,

                  yourBrand:
                    false,

                  brandedContent:
                    false
                }
              })
        ).toThrow(
          /at least one/
        )
      }
    )


    it(
      'keeps credentials, upload URLs and remote publish ids outside durable review',
      () => {
        const review =
          createTikTokPostReview(
            creator,
            60_000,
            settings,
            new Date(
              '2026-09-27T00:15:00.000Z'
            )
          )


        expect(
          JSON.stringify(
            review
          )
        ).not.toMatch(
          /access.?token|refresh.?token|client.?secret|upload.?url|publish.?id/i
        )
      }
    )
  }
)


it(
  'accepts only secret-free public TikTok OAuth session state',
  async () => {
    const {
      tiktokOAuthSessionSchema
    } =
      await import(
        '../src/core/tiktokPublishing'
      )


    const connected =
      tiktokOAuthSessionSchema
        .parse({
          sessionId:
            '11111111-1111-4111-8111-111111111111',

          state:
            'connected',

          createdAt:
            '2026-09-27T00:30:00.000Z',

          expiresAt:
            '2026-09-27T00:40:00.000Z',

          connectedAt:
            '2026-09-27T00:31:00.000Z',

          openId:
            'open-id-1'
        })


    expect(
      connected.state
    ).toBe(
      'connected'
    )


    expect(
      JSON.stringify(
        connected
      )
    ).not.toMatch(
      /access.?token|refresh.?token|client.?secret/
    )


    expect(
      () =>
        tiktokOAuthSessionSchema
          .parse({
            sessionId:
              '11111111-1111-4111-8111-111111111111',

            state:
              'connected',

            createdAt:
              '2026-09-27T00:30:00.000Z',

            expiresAt:
              '2026-09-27T00:40:00.000Z'
          })
    ).toThrow()
  }
)


it(
  'binds a TikTok post review to the exact fresh creator-info snapshot',
  async () => {
    const {
      createTikTokPostReviewFromSnapshot,
      tiktokCreatorInfoSnapshotSchema
    } =
      await import(
        '../src/core/tiktokPublishing'
      )


    const snapshot =
      tiktokCreatorInfoSnapshotSchema
        .parse({
          schemaVersion:
            1,

          checkedAt:
            '2026-09-27T00:40:00.000Z',

          creatorInfo: {
            creatorUsername:
              'creator-id',

            creatorNickname:
              'KINAOU Creator',

            privacyLevelOptions: [
              'PUBLIC_TO_EVERYONE',
              'SELF_ONLY'
            ],

            commentDisabled:
              false,

            duetDisabled:
              true,

            stitchDisabled:
              true,

            maxVideoPostDurationSec:
              180
          }
        })


    const review =
      createTikTokPostReviewFromSnapshot(
        snapshot,
        60_000,
        {
          title:
            'Reviewed clip',

          privacyLevel:
            'SELF_ONLY',

          allowComment:
            false,

          allowDuet:
            false,

          allowStitch:
            false,

          commercialContent: {
            enabled:
              false,

            yourBrand:
              false,

            brandedContent:
              false
          },

          isAigc:
            false,

          musicUsageConsent:
            true,

          brandedContentPolicyConsent:
            false
        }
      )


    expect(
      review.creatorInfoCheckedAt
    ).toBe(
      snapshot.checkedAt
    )


    expect(
      review.creatorInfo
        .creatorNickname
    ).toBe(
      'KINAOU Creator'
    )
  }
)
