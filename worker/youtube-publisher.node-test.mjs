import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createUnconfiguredYouTubePublisher,
  createYouTubePublisher,
  validateYouTubePublishRequest,
  youtubePublisherDescriptor
} from './youtube-publisher.mjs'


const DIGEST =
  'a'.repeat(
    64
  )


const REQUEST_ID =
  '11111111-1111-4111-8111-111111111111'


const ATTEMPT_ID =
  '22222222-2222-4222-8222-222222222222'


const RECEIPT_ID =
  '33333333-3333-4333-8333-333333333333'


function request(
  overrides = {}
) {
  return {
    schemaVersion:
      1,

    projectId:
      'project-1',

    packagePath:
      'KINAOU/Renders/short_youtube.publish.json',

    platform:
      'youtube',

    placement:
      'youtube-short',

    media: {
      path:
        'KINAOU/Renders/short.mp4',

      sizeBytes:
        4096,

      sha256:
        DIGEST
    },

    metadata: {
      title:
        'Reviewed Short',

      description:
        'Ready for explicit upload.',

      tags: [
        'KINAOU'
      ]
    },

    verifiedAt:
      '2026-09-26T18:00:00.000Z',

    requestId:
      REQUEST_ID,

    approval: {
      kind:
        'explicit-human',

      confirmedAt:
        '2026-09-26T18:01:00.000Z'
    },

    ...overrides
  }
}


test(
  'YouTube adapter descriptor matches the generic publishing contract',
  () => {
    assert.deepEqual(
      youtubePublisherDescriptor,
      {
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
      }
    )
  }
)


test(
  'strictly accepts only explicit YouTube publishing requests',
  () => {
    assert.equal(
      validateYouTubePublishRequest(
        request()
      ).placement,
      'youtube-short'
    )

    assert.throws(
      () =>
        validateYouTubePublishRequest(
          request({
            platform:
              'instagram'
          })
        ),
      /only YouTube/
    )

    assert.throws(
      () =>
        validateYouTubePublishRequest(
          request({
            placement:
              'instagram-reel'
          })
        ),
      /YouTube placements/
    )

    assert.throws(
      () =>
        validateYouTubePublishRequest(
          request({
            approval: {
              kind:
                'automatic',

              confirmedAt:
                '2026-09-26T18:01:00.000Z'
            }
          })
        ),
      /explicit human/
    )

    assert.throws(
      () =>
        validateYouTubePublishRequest({
          ...request(),

          accessToken:
            'must-not-enter-durable-request'
        }),
      /credential material/
    )
  }
)


test(
  'passes worker-held access token separately from the durable request',
  async () => {
    let credentialCalls =
      0

    let transportCalls =
      0

    let seenRequest
    let seenAccessToken

    const publisher =
      createYouTubePublisher({
        resolveCredential:
          async platform => {
            credentialCalls +=
              1

            assert.equal(
              platform,
              'youtube'
            )

            return {
              platform:
                'youtube',

              accessToken:
                'worker-only-access-secret',

              refreshToken:
                'worker-only-refresh-secret'
            }
          },

        transport:
          async ({
            request:
              durableRequest,

            accessToken
          }) => {
            transportCalls +=
              1

            seenRequest =
              durableRequest

            seenAccessToken =
              accessToken

            return {
              remoteId:
                'youtube-video-1',

              remoteUrl:
                'https://www.youtube.com/watch?v=youtube-video-1'
            }
          },

        now:
          () =>
            new Date(
              '2026-09-26T18:05:00.000Z'
            ),

        randomUUID:
          () =>
            RECEIPT_ID
      })

    const receipt =
      await publisher.publish(
        request(),
        new AbortController()
          .signal,
        ATTEMPT_ID
      )

    assert.equal(
      credentialCalls,
      1
    )

    assert.equal(
      transportCalls,
      1
    )

    assert.equal(
      seenAccessToken,
      'worker-only-access-secret'
    )

    assert.doesNotMatch(
      JSON.stringify(
        seenRequest
      ),
      /worker-only-access-secret|worker-only-refresh-secret/
    )

    assert.deepEqual(
      receipt,
      {
        schemaVersion:
          1,

        receiptId:
          RECEIPT_ID,

        requestId:
          REQUEST_ID,

        attemptId:
          ATTEMPT_ID,

        platform:
          'youtube',

        placement:
          'youtube-short',

        adapter: {
          id:
            'youtube-data-api-v3',

          version:
            '0.1.0'
        },

        sourceSha256:
          DIGEST,

        remote: {
          id:
            'youtube-video-1',

          url:
            'https://www.youtube.com/watch?v=youtube-video-1'
        },

        publishedAt:
          '2026-09-26T18:05:00.000Z'
      }
    )

    assert.doesNotMatch(
      JSON.stringify(
        receipt
      ),
      /worker-only-access-secret|worker-only-refresh-secret/
    )
  }
)


test(
  'does not call transport when credential resolution fails',
  async () => {
    let transportCalls =
      0

    const publisher =
      createYouTubePublisher({
        resolveCredential:
          async () =>
            null,

        transport:
          async () => {
            transportCalls +=
              1

            return {
              remoteId:
                'must-not-happen'
            }
          }
      })

    await assert.rejects(
      publisher.publish(
        request(),
        new AbortController()
          .signal,
        ATTEMPT_ID
      ),
      /credential/
    )

    assert.equal(
      transportCalls,
      0
    )
  }
)


test(
  'performs exactly one transport attempt and never retries automatically',
  async () => {
    let calls =
      0

    const publisher =
      createYouTubePublisher({
        resolveCredential:
          async () => ({
            platform:
              'youtube',

            accessToken:
              'worker-secret'
          }),

        transport:
          async () => {
            calls +=
              1

            throw new Error(
              'mock remote failure'
            )
          }
      })

    await assert.rejects(
      publisher.publish(
        request(),
        new AbortController()
          .signal,
        ATTEMPT_ID
      ),
      /mock remote failure/
    )

    assert.equal(
      calls,
      1
    )
  }
)


test(
  'cancellation before execution prevents credential and transport use',
  async () => {
    let credentials =
      0

    let transport =
      0

    const publisher =
      createYouTubePublisher({
        resolveCredential:
          async () => {
            credentials +=
              1

            return {
              platform:
                'youtube',

              accessToken:
                'secret'
            }
          },

        transport:
          async () => {
            transport +=
              1

            return {
              remoteId:
                'video'
            }
          }
      })

    const controller =
      new AbortController()

    controller.abort()

    await assert.rejects(
      publisher.publish(
        request(),
        controller.signal,
        ATTEMPT_ID
      ),
      error =>
        error?.name
        === 'AbortError'
    )

    assert.equal(
      credentials,
      0
    )

    assert.equal(
      transport,
      0
    )
  }
)


test(
  'unconfigured production boundary cannot make a network call',
  async () => {
    const publisher =
      createUnconfiguredYouTubePublisher(
        async () => ({
          platform:
            'youtube',

          accessToken:
            'worker-secret'
        })
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
