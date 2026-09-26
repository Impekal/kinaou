import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createInstagramPendingTicket,
  resumeExplicitInstagramPublish,
  verifyInstagramPendingTicket
} from './instagram-publish-pending.mjs'


const SHA =
  'a'.repeat(
    64
  )


const SECRET =
  'local-worker-secret'


function request() {
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

      tags:
        [
          'KINAOU'
        ]
    },

    verifiedAt:
      '2026-09-26T21:00:00.000Z',

    requestId:
      '11111111-1111-4111-8111-111111111111',

    approval: {
      kind:
        'explicit-human',

      confirmedAt:
        '2026-09-26T21:01:00.000Z'
    }
  }
}


function ticket() {
  return createInstagramPendingTicket({
    requestValue:
      request(),

    attemptId:
      '22222222-2222-4222-8222-222222222222',

    containerId:
      'container-1',

    secret:
      SECRET,

    now:
      () =>
        new Date(
          '2026-09-26T21:02:00.000Z'
        )
  })
}


test(
  'creates a signed non-secret continuation ticket and rejects tampering',
  () => {
    const pending =
      ticket()


    assert.equal(
      verifyInstagramPendingTicket(
        pending,
        SECRET,
        {
          now:
            () =>
              new Date(
                '2026-09-26T21:03:00.000Z'
              )
        }
      ).containerId,
      'container-1'
    )


    assert.doesNotMatch(
      JSON.stringify(
        pending
      ),
      /access.?token|delivery.?url|signature=.*secret/i
    )


    assert.throws(
      () =>
        verifyInstagramPendingTicket(
          {
            ...pending,

            containerId:
              'different-container'
          },
          SECRET,
          {
            now:
              () =>
                new Date(
                  '2026-09-26T21:03:00.000Z'
                )
          }
        ),
      /signature is invalid/
    )
  }
)


test(
  'manual resume re-hashes before credentials and checks status exactly once',
  async () => {
    const events =
      []


    const result =
      await resumeExplicitInstagramPublish({
        pendingValue:
          ticket(),

        secret:
          SECRET,

        rehashSource:
          async () => {
            events.push(
              'hash'
            )

            return SHA
          },

        resolveCredential:
          async () => {
            events.push(
              'credential'
            )

            return {
              platform:
                'instagram',

              accessToken:
                'worker-token',

              accountId:
                'account'
            }
          },

        protocol: {
          async containerStatus() {
            events.push(
              'status'
            )

            return {
              containerId:
                'container-1',

              statusCode:
                'IN_PROGRESS',

              status:
                'Processing'
            }
          },

          async publishContainer() {
            events.push(
              'publish'
            )

            throw new Error(
              'must not publish'
            )
          }
        },

        now:
          () =>
            new Date(
              '2026-09-26T21:03:00.000Z'
            )
      })


    assert.equal(
      result.state,
      'pending'
    )


    assert.deepEqual(
      events,
      [
        'hash',
        'credential',
        'status'
      ]
    )
  }
)


test(
  'manual resume publishes the same finished container without creating another one',
  async () => {
    const events =
      []


    const result =
      await resumeExplicitInstagramPublish({
        pendingValue:
          ticket(),

        secret:
          SECRET,

        rehashSource:
          async () => {
            events.push(
              'hash'
            )

            return SHA
          },

        resolveCredential:
          async () => {
            events.push(
              'credential'
            )

            return {
              platform:
                'instagram',

              accessToken:
                'worker-token',

              accountId:
                'account'
            }
          },

        protocol: {
          async containerStatus(
            value
          ) {
            events.push(
              'status'
            )

            assert.equal(
              value.containerId,
              'container-1'
            )

            return {
              containerId:
                'container-1',

              statusCode:
                'FINISHED',

              status:
                'Finished'
            }
          },

          async publishContainer(
            value
          ) {
            events.push(
              'publish'
            )

            assert.equal(
              value.containerId,
              'container-1'
            )

            return {
              remoteId:
                'instagram-media-1'
            }
          }
        },

        now:
          () =>
            new Date(
              '2026-09-26T21:03:00.000Z'
            ),

        randomUUID:
          () =>
            '33333333-3333-4333-8333-333333333333'
      })


    assert.equal(
      result.state,
      'published'
    )


    assert.equal(
      result.receipt
        .remote.id,
      'instagram-media-1'
    )


    assert.deepEqual(
      events,
      [
        'hash',
        'credential',
        'status',
        'publish'
      ]
    )
  }
)


test(
  'changed source blocks credentials and Meta during resume',
  async () => {
    let credentials =
      0

    let meta =
      0


    await assert.rejects(
      resumeExplicitInstagramPublish({
        pendingValue:
          ticket(),

        secret:
          SECRET,

        rehashSource:
          async () =>
            'b'.repeat(
              64
            ),

        resolveCredential:
          async () => {
            credentials +=
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

        protocol: {
          async containerStatus() {
            meta +=
              1
          },

          async publishContainer() {
            meta +=
              1
          }
        },

        now:
          () =>
            new Date(
              '2026-09-26T21:03:00.000Z'
            )
      }),
      /source changed/
    )


    assert.equal(
      credentials,
      0
    )

    assert.equal(
      meta,
      0
    )
  }
)
