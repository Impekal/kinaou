import test from 'node:test'
import assert from 'node:assert/strict'

import {
  executeExplicitInstagramPublish
} from './instagram-publish-execution.mjs'


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
      '11111111-1111-4111-8111-111111111111',

    approval: {
      kind:
        'explicit-human',

      confirmedAt:
        '2026-09-26T21:01:00.000Z'
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
        'instagram-project',

      platform:
        'instagram',

      placement:
        'instagram-reel',

      delivery: {
        ready:
          true
      },

      title:
        'Reviewed Reel',

      description:
        'Explicit publishing.',

      tags: [
        'KINAOU'
      ],

      media: {
        outputRelativePath:
          'KINAOU/Renders/reel.mp4',

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
  're-hashes before publisher can resolve credentials, staging or contact Meta',
  async () => {
    const events =
      []


    const receipt =
      await executeExplicitInstagramPublish({
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

            return packageRecord()
          },

        rehashSource:
          async (
            path,
            size
          ) => {
            events.push(
              'fresh-sha256'
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

            return {
              receipt:
                true
            }
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
        'fresh-sha256',
        'publisher'
      ]
    )


    assert.deepEqual(
      receipt,
      {
        receipt:
          true
      }
    )
  }
)


test(
  'changed source blocks publisher before credentials, staging or Meta',
  async () => {
    let publisherCalls =
      0


    await assert.rejects(
      executeExplicitInstagramPublish({
        requestValue:
          request(),

        attemptId:
          ATTEMPT,

        readPackage:
          async () =>
            packageRecord(),

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
  'package mismatch blocks publishing',
  async () => {
    let publisherCalls =
      0


    await assert.rejects(
      executeExplicitInstagramPublish({
        requestValue:
          request(),

        attemptId:
          ATTEMPT,

        readPackage:
          async () => ({
            document: {
              ...packageRecord()
                .document,

              title:
                'Changed title'
            }
          }),

        rehashSource:
          async () =>
            SHA,

        publisher: {
          async publish() {
            publisherCalls +=
              1
          }
        }
      }),
      /metadata does not match/
    )


    assert.equal(
      publisherCalls,
      0
    )
  }
)
