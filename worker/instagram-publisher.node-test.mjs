import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createInstagramPublisher,
  createUnconfiguredInstagramPublisher,
  instagramPublishingScopes,
  instagramPublisherDescriptor,
  validateInstagramPublishRequest
} from './instagram-publisher.mjs'


const SHA =
  'a'.repeat(
    64
  )


const REQUEST_ID =
  '11111111-1111-4111-8111-111111111111'


const ATTEMPT_ID =
  '22222222-2222-4222-8222-222222222222'


function request(
  overrides = {}
) {
  return {
    schemaVersion:
      1,

    projectId:
      'instagram-project',

    packagePath:
      'KINAOU/Renders/reel_instagram.publish.json',

    platform:
      'instagram',

    placement:
      'instagram-reel',

    media: {
      path:
        'KINAOU/Renders/reel.mp4',

      sizeBytes:
        4096,

      sha256:
        SHA
    },

    metadata: {
      title:
        'Reviewed Reel',

      description:
        'Explicit publishing.',

      tags: [
        'KINAOU'
      ]
    },

    verifiedAt:
      '2026-09-26T21:00:00.000Z',

    requestId:
      REQUEST_ID,

    approval: {
      kind:
        'explicit-human',

      confirmedAt:
        '2026-09-26T21:01:00.000Z'
    },

    ...overrides
  }
}


test(
  'declares only Instagram Reel publishing and current Instagram Login scopes',
  () => {
    assert.deepEqual(
      instagramPublisherDescriptor
        .placements,
      [
        'instagram-reel'
      ]
    )

    assert.deepEqual(
      instagramPublishingScopes,
      [
        'instagram_business_basic',
        'instagram_business_content_publish'
      ]
    )
  }
)


test(
  'rejects feed publishing, automatic approval and embedded delivery URLs',
  () => {
    assert.equal(
      validateInstagramPublishRequest(
        request()
      ).placement,
      'instagram-reel'
    )

    assert.throws(
      () =>
        validateInstagramPublishRequest(
          request({
            placement:
              'instagram-feed'
          })
        ),
      /only Instagram Reels/
    )

    assert.throws(
      () =>
        validateInstagramPublishRequest(
          request({
            approval: {
              kind:
                'automatic',

              confirmedAt:
                '2026-09-26T21:01:00.000Z'
            }
          })
        ),
      /explicit human/
    )

    assert.throws(
      () =>
        validateInstagramPublishRequest({
          ...request(),

          videoUrl:
            'https://signed.example/video.mp4?secret=x'
        }),
      /delivery URLs/
    )
  }
)


test(
  'keeps access token and signed media URL outside durable request and receipt',
  async () => {
    let transportRequest
    let transportToken
    let transportUrl


    const publisher =
      createInstagramPublisher({
        resolveCredential:
          async () => ({
            platform:
              'instagram',

            accessToken:
              'worker-only-instagram-token',

            accountId:
              '17841400000000000'
          }),

        resolveDeliveryUrl:
          async evidence => {
            assert.equal(
              evidence.sha256,
              SHA
            )

            return 'https://delivery.example/reel.mp4?signature=worker-only'
          },

        transport:
          async ({
            request:
              durableRequest,

            accessToken,
            deliveryUrl
          }) => {
            transportRequest =
              durableRequest

            transportToken =
              accessToken

            transportUrl =
              deliveryUrl

            return {
              remoteId:
                'instagram-media-1'
            }
          },

        now:
          () =>
            new Date(
              '2026-09-26T21:05:00.000Z'
            ),

        randomUUID:
          () =>
            '33333333-3333-4333-8333-333333333333'
      })


    const receipt =
      await publisher.publish(
        request(),
        new AbortController()
          .signal,
        ATTEMPT_ID
      )


    assert.equal(
      transportToken,
      'worker-only-instagram-token'
    )

    assert.equal(
      transportUrl,
      'https://delivery.example/reel.mp4?signature=worker-only'
    )


    assert.doesNotMatch(
      JSON.stringify(
        transportRequest
      ),
      /worker-only-instagram-token|signature=worker-only/
    )


    assert.doesNotMatch(
      JSON.stringify(
        receipt
      ),
      /worker-only-instagram-token|signature=worker-only/
    )


    assert.equal(
      receipt.remote.id,
      'instagram-media-1'
    )
  }
)


test(
  'rejects localhost delivery and never retries automatically',
  async () => {
    let transportCalls =
      0


    const localhostPublisher =
      createInstagramPublisher({
        resolveCredential:
          async () => ({
            platform:
              'instagram',

            accessToken:
              'token',

            accountId:
              'account'
          }),

        resolveDeliveryUrl:
          async () =>
            'https://localhost/reel.mp4',

        transport:
          async () => {
            transportCalls +=
              1

            return {
              remoteId:
                'nope'
            }
          }
      })


    await assert.rejects(
      localhostPublisher.publish(
        request(),
        new AbortController()
          .signal,
        ATTEMPT_ID
      ),
      /public HTTPS/
    )

    assert.equal(
      transportCalls,
      0
    )


    const failingPublisher =
      createInstagramPublisher({
        resolveCredential:
          async () => ({
            platform:
              'instagram',

            accessToken:
              'token',

            accountId:
              'account'
          }),

        resolveDeliveryUrl:
          async () =>
            'https://delivery.example/reel.mp4',

        transport:
          async () => {
            transportCalls +=
              1

            throw new Error(
              'mock Meta failure'
            )
          }
      })


    await assert.rejects(
      failingPublisher.publish(
        request(),
        new AbortController()
          .signal,
        ATTEMPT_ID
      ),
      /mock Meta failure/
    )

    assert.equal(
      transportCalls,
      1
    )
  }
)


test(
  'production Instagram transport remains disabled until delivery architecture is accepted',
  async () => {
    const publisher =
      createUnconfiguredInstagramPublisher(
        async () => ({
          platform:
            'instagram',

          accessToken:
            'worker-token',

          accountId:
            'account'
        }),

        async () =>
          'https://delivery.example/reel.mp4'
      )


    await assert.rejects(
      publisher.publish(
        request(),
        new AbortController()
          .signal,
        ATTEMPT_ID
      ),
      /live transport is not configured/
    )
  }
)
