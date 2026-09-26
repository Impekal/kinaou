import test from 'node:test'
import assert from 'node:assert/strict'

import {
  assertYouTubeRequestMatchesPackage,
  executeExplicitYouTubePublish
} from './youtube-publish-execution.mjs'


const SHA =
  'a'.repeat(
    64
  )


const ATTEMPT =
  '22222222-2222-4222-8222-222222222222'


function request() {
  return {
    schemaVersion:
      1,

    projectId:
      'project-1',

    packagePath:
      'KINAOU/Renders/final_youtube.publish.json',

    platform:
      'youtube',

    placement:
      'youtube-short',

    media: {
      path:
        'KINAOU/Renders/final.mp4',

      sizeBytes:
        4096,

      sha256:
        SHA
    },

    metadata: {
      title:
        'Reviewed Short',

      description:
        'Explicit private upload.',

      tags: [
        'KINAOU'
      ]
    },

    verifiedAt:
      '2026-09-26T20:00:00.000Z',

    requestId:
      '11111111-1111-4111-8111-111111111111',

    approval: {
      kind:
        'explicit-human',

      confirmedAt:
        '2026-09-26T20:01:00.000Z'
    }
  }
}


function publishPackage() {
  return {
    document: {
      schemaVersion:
        3,

      kind:
        'kinaou-publish-package',

      projectId:
        'project-1',

      platform:
        'youtube',

      placement:
        'youtube-short',

      delivery: {
        ready:
          true
      },

      title:
        'Reviewed Short',

      description:
        'Explicit private upload.',

      tags: [
        'KINAOU'
      ],

      media: {
        outputRelativePath:
          'KINAOU/Renders/final.mp4',

        sizeBytes:
          4096
      },

      integrity: {
        sha256:
          SHA
      }
    }
  }
}


test(
  'binds the explicit request to the exact V3 package',
  () => {
    assert.equal(
      assertYouTubeRequestMatchesPackage(
        request(),
        publishPackage()
      ).media.sha256,
      SHA
    )


    assert.throws(
      () =>
        assertYouTubeRequestMatchesPackage(
          request(),
          {
            document: {
              ...publishPackage()
                .document,

              title:
                'Browser changed this'
            }
          }
        ),
      /metadata does not match/
    )


    assert.throws(
      () =>
        assertYouTubeRequestMatchesPackage(
          request(),
          {
            document: {
              ...publishPackage()
                .document,

              integrity: {
                sha256:
                  'b'.repeat(
                    64
                  )
              }
            }
          }
        ),
      /source evidence/
    )


    assert.throws(
      () =>
        assertYouTubeRequestMatchesPackage(
          request(),
          {
            document: {
              ...publishPackage()
                .document,

              schemaVersion:
                2
            }
          }
        ),
      /V3/
    )
  }
)


test(
  're-hashes before the publisher can resolve credentials or contact Google',
  async () => {
    const events =
      []

    const receipt =
      {
        schemaVersion:
          1,

        receiptId:
          '33333333-3333-4333-8333-333333333333',

        requestId:
          request().requestId,

        attemptId:
          ATTEMPT,

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
          SHA,

        remote: {
          id:
            'video-1'
        },

        publishedAt:
          '2026-09-26T20:02:00.000Z'
      }


    const result =
      await executeExplicitYouTubePublish({
        requestValue:
          request(),

        attemptId:
          ATTEMPT,

        readPackage:
          async path => {
            events.push(
              'read-package'
            )

            assert.equal(
              path,
              request()
                .packagePath
            )

            return publishPackage()
          },

        rehashSource:
          async (
            path,
            size
          ) => {
            events.push(
              'rehash'
            )

            assert.equal(
              path,
              request()
                .media.path
            )

            assert.equal(
              size,
              4096
            )

            return SHA
          },

        publisher: {
          async publish(
            publishRequest,
            _signal,
            attemptId
          ) {
            events.push(
              'publisher'
            )

            assert.equal(
              publishRequest
                .media.sha256,
              SHA
            )

            assert.equal(
              attemptId,
              ATTEMPT
            )

            return receipt
          }
        },

        signal:
          new AbortController()
            .signal
      })


    assert.deepEqual(
      events,
      [
        'read-package',
        'rehash',
        'publisher'
      ]
    )

    assert.deepEqual(
      result,
      receipt
    )
  }
)


test(
  'blocks a changed MP4 before publisher execution',
  async () => {
    let publisherCalls =
      0


    await assert.rejects(
      executeExplicitYouTubePublish({
        requestValue:
          request(),

        attemptId:
          ATTEMPT,

        readPackage:
          async () =>
            publishPackage(),

        rehashSource:
          async () =>
            'b'.repeat(
              64
            ),

        publisher: {
          async publish() {
            publisherCalls +=
              1

            throw new Error(
              'must not publish'
            )
          }
        },

        signal:
          new AbortController()
            .signal
      }),
      /changed after publish review/
    )


    assert.equal(
      publisherCalls,
      0
    )
  }
)


test(
  'cancellation before execution prevents package and network work',
  async () => {
    const controller =
      new AbortController()

    controller.abort()

    let reads =
      0


    await assert.rejects(
      executeExplicitYouTubePublish({
        requestValue:
          request(),

        attemptId:
          ATTEMPT,

        readPackage:
          async () => {
            reads +=
              1

            return publishPackage()
          },

        rehashSource:
          async () =>
            SHA,

        publisher: {
          async publish() {
            throw new Error(
              'must not publish'
            )
          }
        },

        signal:
          controller.signal
      }),
      error =>
        error?.name
        === 'AbortError'
    )


    assert.equal(
      reads,
      0
    )
  }
)
