import test from 'node:test'
import assert from 'node:assert/strict'

import {
  Readable
} from 'node:stream'

import {
  createYouTubePublisher
} from './youtube-publisher.mjs'

import {
  createYouTubeResumableTransport
} from './youtube-resumable.mjs'

import {
  executeExplicitYouTubePublish
} from './youtube-publish-execution.mjs'


const SHA =
  'a'.repeat(
    64
  )


const REQUEST_ID =
  '11111111-1111-4111-8111-111111111111'


const ATTEMPT_ID =
  '22222222-2222-4222-8222-222222222222'


function request() {
  return {
    schemaVersion:
      1,

    projectId:
      'acceptance-project',

    packagePath:
      'KINAOU/Renders/acceptance_youtube.publish.json',

    platform:
      'youtube',

    placement:
      'youtube-short',

    media: {
      path:
        'KINAOU/Renders/acceptance.mp4',

      sizeBytes:
        4,

      sha256:
        SHA
    },

    metadata: {
      title:
        'Acceptance Short',

      description:
        'Explicit private upload.',

      tags: [
        'KINAOU'
      ]
    },

    verifiedAt:
      '2026-09-26T20:01:00.000Z',

    requestId:
      REQUEST_ID,

    approval: {
      kind:
        'explicit-human',

      confirmedAt:
        '2026-09-26T20:02:00.000Z'
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
        'acceptance-project',

      platform:
        'youtube',

      placement:
        'youtube-short',

      delivery: {
        ready:
          true
      },

      title:
        'Acceptance Short',

      description:
        'Explicit private upload.',

      tags: [
        'KINAOU'
      ],

      media: {
        outputRelativePath:
          'KINAOU/Renders/acceptance.mp4',

        sizeBytes:
          4
      },

      integrity: {
        sha256:
          SHA
      }
    }
  }
}


test(
  'explicit YouTube acceptance reaches one private resumable upload only after package binding and fresh hashing',
  async () => {
    const events =
      []

    const sessionUrl =
      'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&upload_id=acceptance'


    const transport =
      createYouTubeResumableTransport({
        resolveAbsolutePath:
          async path => {
            events.push(
              'resolve-path'
            )

            assert.equal(
              path,
              'KINAOU/Renders/acceptance.mp4'
            )

            return '/safe/acceptance.mp4'
          },

        openSource:
          async path => {
            events.push(
              'open-source'
            )

            assert.equal(
              path,
              '/safe/acceptance.mp4'
            )

            return Readable.from(
              Buffer.from(
                'data'
              )
            )
          },

        fetchImpl:
          async (
            input,
            init
          ) => {
            const url =
              String(
                input
              )

            if (
              init.method === 'POST'
            ) {
              events.push(
                'google-session'
              )

              const metadata =
                JSON.parse(
                  String(
                    init.body
                  )
                )

              assert.deepEqual(
                metadata.status,
                {
                  privacyStatus:
                    'private'
                }
              )

              const parsed =
                new URL(
                  url
                )

              assert.equal(
                parsed.searchParams
                  .get(
                    'notifySubscribers'
                  ),
                'false'
              )

              return new Response(
                '',
                {
                  status:
                    200,

                  headers: {
                    location:
                      sessionUrl
                  }
                }
              )
            }


            events.push(
              'google-upload'
            )

            assert.equal(
              url,
              sessionUrl
            )

            assert.equal(
              init.method,
              'PUT'
            )

            return new Response(
              JSON.stringify({
                id:
                  'acceptance-video'
              }),
              {
                status:
                  201,

                headers: {
                  'content-type':
                    'application/json'
                }
              }
            )
          }
      })


    const publisher =
      createYouTubePublisher({
        resolveCredential:
          async () => {
            events.push(
              'credential'
            )

            return {
              platform:
                'youtube',

              accessToken:
                'worker-only-access-secret'
            }
          },

        transport,

        now:
          () =>
            new Date(
              '2026-09-26T20:05:00.000Z'
            ),

        randomUUID:
          () =>
            '33333333-3333-4333-8333-333333333333'
      })


    const receipt =
      await executeExplicitYouTubePublish({
        requestValue:
          request(),

        attemptId:
          ATTEMPT_ID,

        readPackage:
          async path => {
            events.push(
              'read-package'
            )

            assert.equal(
              path,
              'KINAOU/Renders/acceptance_youtube.publish.json'
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
              'KINAOU/Renders/acceptance.mp4'
            )

            assert.equal(
              size,
              4
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
        'resolve-path',
        'google-session',
        'open-source',
        'google-upload'
      ]
    )


    assert.equal(
      receipt.remote.id,
      'acceptance-video'
    )


    assert.equal(
      receipt.sourceSha256,
      SHA
    )


    assert.doesNotMatch(
      JSON.stringify(
        receipt
      ),
      /worker-only-access-secret/
    )
  }
)


test(
  'changed source prevents credentials and every Google call',
  async () => {
    let credentials =
      0

    let network =
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
            network +=
              1

            return {
              remoteId:
                'must-not-exist'
            }
          }
      })


    await assert.rejects(
      executeExplicitYouTubePublish({
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
      credentials,
      0
    )

    assert.equal(
      network,
      0
    )
  }
)
