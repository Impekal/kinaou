import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createInstagramPublisher
} from './instagram-publisher.mjs'

import {
  executeExplicitInstagramPublish
} from './instagram-publish-execution.mjs'

import {
  InstagramContainerNotReadyError,
  createInstagramReelsTransport
} from './instagram-reels-transport.mjs'

import {
  createInstagramPendingTicket,
  resumeExplicitInstagramPublish
} from './instagram-publish-pending.mjs'


const SHA =
  'a'.repeat(
    64
  )


const REQUEST_ID =
  '11111111-1111-4111-8111-111111111111'


const ATTEMPT_ID =
  '22222222-2222-4222-8222-222222222222'


const WORKER_SECRET =
  'acceptance-worker-secret'


function request() {
  return {
    schemaVersion:
      1,

    projectId:
      'instagram-acceptance-project',

    packagePath:
      'KINAOU/Renders/acceptance_instagram.publish.json',

    platform:
      'instagram',

    placement:
      'instagram-reel',

    media: {
      path:
        'KINAOU/Renders/acceptance_instagram.mp4',

      sizeBytes:
        4096,

      sha256:
        SHA
    },

    metadata: {
      title:
        'Acceptance Reel',

      description:
        'Reviewed explicit publishing.',

      tags: [
        'KINAOU'
      ]
    },

    verifiedAt:
      '2026-09-26T22:01:00.000Z',

    requestId:
      REQUEST_ID,

    approval: {
      kind:
        'explicit-human',

      confirmedAt:
        '2026-09-26T22:02:00.000Z'
    }
  }
}


function packageRecord() {
  return {
    document: {
      schemaVersion:
        3,

      kind:
        'kinaou-publish-package',

      projectId:
        'instagram-acceptance-project',

      platform:
        'instagram',

      placement:
        'instagram-reel',

      delivery: {
        ready:
          true
      },

      title:
        'Acceptance Reel',

      description:
        'Reviewed explicit publishing.',

      tags: [
        'KINAOU'
      ],

      media: {
        outputRelativePath:
          'KINAOU/Renders/acceptance_instagram.mp4',

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
  'explicit Reel acceptance hashes before credentials, delivery and Meta and publishes exactly once',
  async () => {
    const events =
      []


    const transport =
      createInstagramReelsTransport({
        protocol: {
          async createContainer({
            videoUrl,
            shareToFeed
          }) {
            events.push(
              'meta-create'
            )

            assert.equal(
              videoUrl,
              'https://delivery.example/reel.mp4?signature=worker-only'
            )

            assert.equal(
              shareToFeed,
              false
            )

            return {
              containerId:
                'container-success'
            }
          },


          async containerStatus({
            containerId
          }) {
            events.push(
              'meta-status'
            )

            assert.equal(
              containerId,
              'container-success'
            )

            return {
              containerId,
              statusCode:
                'FINISHED',
              status:
                'Finished'
            }
          },


          async publishContainer({
            containerId
          }) {
            events.push(
              'meta-publish'
            )

            assert.equal(
              containerId,
              'container-success'
            )

            return {
              remoteId:
                'instagram-media-success'
            }
          }
        }
      })


    const publisher =
      createInstagramPublisher({
        resolveCredential:
          async () => {
            events.push(
              'credential'
            )

            return {
              platform:
                'instagram',

              accessToken:
                'worker-only-token',

              accountId:
                '17841400000000000'
            }
          },


        resolveDeliveryUrl:
          async evidence => {
            events.push(
              'delivery'
            )

            assert.equal(
              evidence.sha256,
              SHA
            )

            return 'https://delivery.example/reel.mp4?signature=worker-only'
          },


        transport,


        now:
          () =>
            new Date(
              '2026-09-26T22:05:00.000Z'
            ),


        randomUUID:
          () =>
            '33333333-3333-4333-8333-333333333333'
      })


    const receipt =
      await executeExplicitInstagramPublish({
        requestValue:
          request(),

        attemptId:
          ATTEMPT_ID,

        readPackage:
          async () => {
            events.push(
              'read-package'
            )

            return packageRecord()
          },


        rehashSource:
          async () => {
            events.push(
              'fresh-sha256'
            )

            return SHA
          },


        publisher,

        signal:
          new AbortController()
            .signal
      })


    assert.deepEqual(
      events,
      [
        'read-package',
        'fresh-sha256',
        'credential',
        'delivery',
        'meta-create',
        'meta-status',
        'meta-publish'
      ]
    )


    assert.equal(
      receipt.remote.id,
      'instagram-media-success'
    )


    assert.doesNotMatch(
      JSON.stringify(
        receipt
      ),
      /worker-only-token|signature=worker-only/
    )
  }
)


test(
  'IN_PROGRESS creates a signed continuation and manual resume uses the same container without creating another',
  async () => {
    const events =
      []


    const transport =
      createInstagramReelsTransport({
        protocol: {
          async createContainer() {
            events.push(
              'create'
            )

            return {
              containerId:
                'container-pending'
            }
          },


          async containerStatus() {
            events.push(
              'initial-status'
            )

            return {
              containerId:
                'container-pending',

              statusCode:
                'IN_PROGRESS',

              status:
                'Processing'
            }
          },


          async publishContainer() {
            events.push(
              'unexpected-publish'
            )

            throw new Error(
              'must not publish initially'
            )
          }
        }
      })


    const publisher =
      createInstagramPublisher({
        resolveCredential:
          async () => {
            events.push(
              'initial-credential'
            )

            return {
              platform:
                'instagram',

              accessToken:
                'initial-token',

              accountId:
                'account'
            }
          },


        resolveDeliveryUrl:
          async () => {
            events.push(
              'delivery'
            )

            return 'https://delivery.example/pending.mp4'
          },


        transport
      })


    let notReady


    try {
      await executeExplicitInstagramPublish({
        requestValue:
          request(),

        attemptId:
          ATTEMPT_ID,

        readPackage:
          async () => {
            events.push(
              'read-package'
            )

            return packageRecord()
          },


        rehashSource:
          async () => {
            events.push(
              'initial-hash'
            )

            return SHA
          },


        publisher,

        signal:
          new AbortController()
            .signal
      })

      assert.fail(
        'Expected Instagram container to remain pending'
      )

    } catch (
      error
    ) {
      assert.ok(
        error
        instanceof InstagramContainerNotReadyError
      )

      notReady =
        error
    }


    const pending =
      createInstagramPendingTicket({
        requestValue:
          request(),

        attemptId:
          ATTEMPT_ID,

        containerId:
          notReady.containerId,

        secret:
          WORKER_SECRET,

        now:
          () =>
            new Date(
              '2026-09-26T22:06:00.000Z'
            )
      })


    const resumed =
      await resumeExplicitInstagramPublish({
        pendingValue:
          pending,

        secret:
          WORKER_SECRET,

        rehashSource:
          async () => {
            events.push(
              'resume-hash'
            )

            return SHA
          },


        resolveCredential:
          async () => {
            events.push(
              'resume-credential'
            )

            return {
              platform:
                'instagram',

              accessToken:
                'resume-token',

              accountId:
                'account'
            }
          },


        protocol: {
          async containerStatus({
            containerId
          }) {
            events.push(
              'resume-status'
            )

            assert.equal(
              containerId,
              'container-pending'
            )

            return {
              containerId,

              statusCode:
                'FINISHED',

              status:
                'Finished'
            }
          },


          async publishContainer({
            containerId
          }) {
            events.push(
              'resume-publish'
            )

            assert.equal(
              containerId,
              'container-pending'
            )

            return {
              remoteId:
                'instagram-media-resumed'
            }
          }
        },


        now:
          () =>
            new Date(
              '2026-09-26T22:07:00.000Z'
            ),


        randomUUID:
          () =>
            '44444444-4444-4444-8444-444444444444'
      })


    assert.equal(
      resumed.state,
      'published'
    )


    assert.equal(
      resumed.receipt
        .remote.id,
      'instagram-media-resumed'
    )


    assert.equal(
      events.filter(
        event =>
          event === 'create'
      ).length,
      1
    )


    assert.deepEqual(
      events,
      [
        'read-package',
        'initial-hash',
        'initial-credential',
        'delivery',
        'create',
        'initial-status',
        'resume-hash',
        'resume-credential',
        'resume-status',
        'resume-publish'
      ]
    )


    assert.doesNotMatch(
      JSON.stringify(
        pending
      ),
      /initial-token|resume-token|delivery\.example/
    )
  }
)


test(
  'changed MP4 blocks all credential, delivery and Meta work',
  async () => {
    let credentialCalls =
      0

    let deliveryCalls =
      0

    let metaCalls =
      0


    const publisher =
      createInstagramPublisher({
        resolveCredential:
          async () => {
            credentialCalls +=
              1

            return {
              platform:
                'instagram',

              accessToken:
                'token',

              accountId:
                'account'
            }
          },


        resolveDeliveryUrl:
          async () => {
            deliveryCalls +=
              1

            return 'https://delivery.example/reel.mp4'
          },


        transport:
          async () => {
            metaCalls +=
              1

            return {
              remoteId:
                'must-not-exist'
            }
          }
      })


    await assert.rejects(
      executeExplicitInstagramPublish({
        requestValue:
          request(),

        attemptId:
          ATTEMPT_ID,

        readPackage:
          async () =>
            packageRecord(),

        rehashSource:
          async () =>
            'b'.repeat(
              64
            ),

        publisher,

        signal:
          new AbortController()
            .signal
      }),
      /changed after publish review/
    )


    assert.equal(
      credentialCalls,
      0
    )

    assert.equal(
      deliveryCalls,
      0
    )

    assert.equal(
      metaCalls,
      0
    )
  }
)
