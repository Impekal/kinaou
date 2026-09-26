import test from 'node:test'
import assert from 'node:assert/strict'

import {
  TIKTOK_CREATOR_INFO_ENDPOINT,
  createTikTokCreatorInfoProtocol
} from './tiktok-creator-info.mjs'


test(
  'queries latest TikTok creator info exactly once with bearer auth',
  async () => {
    let calls =
      0


    const protocol =
      createTikTokCreatorInfoProtocol({
        fetchImpl:
          async (
            input,
            init
          ) => {
            calls +=
              1


            assert.equal(
              String(
                input
              ),
              TIKTOK_CREATOR_INFO_ENDPOINT
            )


            assert.equal(
              init.method,
              'POST'
            )


            const headers =
              new Headers(
                init.headers
              )


            assert.equal(
              headers.get(
                'authorization'
              ),
              'Bearer worker-only-access-token'
            )


            assert.equal(
              headers.get(
                'content-type'
              ),
              'application/json; charset=UTF-8'
            )


            assert.doesNotMatch(
              String(
                input
              ),
              /worker-only-access-token/
            )


            assert.equal(
              init.body,
              undefined
            )


            return new Response(
              JSON.stringify({
                data: {
                  creator_avatar_url:
                    'https://cdn.example/avatar.jpg',

                  creator_username:
                    'creator-id',

                  creator_nickname:
                    'KINAOU Creator',

                  privacy_level_options: [
                    'PUBLIC_TO_EVERYONE',
                    'MUTUAL_FOLLOW_FRIENDS',
                    'SELF_ONLY'
                  ],

                  comment_disabled:
                    false,

                  duet_disabled:
                    true,

                  stitch_disabled:
                    false,

                  max_video_post_duration_sec:
                    300
                },

                error: {
                  code:
                    'ok',

                  message:
                    '',

                  log_id:
                    'test-log'
                }
              }),
              {
                status:
                  200
              }
            )
          }
      })


    const creator =
      await protocol.query({
        accessToken:
          'worker-only-access-token'
      })


    assert.equal(
      calls,
      1
    )


    assert.deepEqual(
      creator,
      {
        creatorUsername:
          'creator-id',

        creatorNickname:
          'KINAOU Creator',

        creatorAvatarUrl:
          'https://cdn.example/avatar.jpg',

        privacyLevelOptions: [
          'PUBLIC_TO_EVERYONE',
          'MUTUAL_FOLLOW_FRIENDS',
          'SELF_ONLY'
        ],

        commentDisabled:
          false,

        duetDisabled:
          true,

        stitchDisabled:
          false,

        maxVideoPostDurationSec:
          300
      }
    )


    assert.doesNotMatch(
      JSON.stringify(
        creator
      ),
      /worker-only-access-token/
    )
  }
)


test(
  'treats TikTok application errors as failures even with HTTP 200',
  async () => {
    let calls =
      0


    const protocol =
      createTikTokCreatorInfoProtocol({
        fetchImpl:
          async () => {
            calls +=
              1


            return new Response(
              JSON.stringify({
                data:
                  {},

                error: {
                  code:
                    'spam_risk_too_many_posts',

                  message:
                    'Try again later',

                  log_id:
                    'log-id'
                }
              }),
              {
                status:
                  200
              }
            )
          }
      })


    await assert.rejects(
      protocol.query({
        accessToken:
          'token'
      }),
      /spam_risk_too_many_posts/
    )


    assert.equal(
      calls,
      1
    )
  }
)


test(
  'rejects malformed creator permissions instead of guessing defaults',
  async () => {
    const protocol =
      createTikTokCreatorInfoProtocol({
        fetchImpl:
          async () =>
            new Response(
              JSON.stringify({
                data: {
                  creator_username:
                    'creator',

                  creator_nickname:
                    'Creator',

                  privacy_level_options: [
                    'UNKNOWN_PRIVACY'
                  ],

                  comment_disabled:
                    false,

                  duet_disabled:
                    false,

                  stitch_disabled:
                    false,

                  max_video_post_duration_sec:
                    300
                },

                error: {
                  code:
                    'ok',

                  message:
                    ''
                }
              }),
              {
                status:
                  200
              }
            )
      })


    await assert.rejects(
      protocol.query({
        accessToken:
          'token'
      }),
      /unknown privacy/
    )
  }
)


test(
  'never retries creator info automatically after a server failure',
  async () => {
    let calls =
      0


    const protocol =
      createTikTokCreatorInfoProtocol({
        fetchImpl:
          async () => {
            calls +=
              1


            return new Response(
              JSON.stringify({
                error: {
                  code:
                    'internal_error',

                  message:
                    'temporary failure'
                }
              }),
              {
                status:
                  500
              }
            )
          }
      })


    await assert.rejects(
      protocol.query({
        accessToken:
          'token'
      }),
      /internal_error/
    )


    assert.equal(
      calls,
      1
    )
  }
)
