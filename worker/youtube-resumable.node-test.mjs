import test from 'node:test'
import assert from 'node:assert/strict'

import {
  Readable
} from 'node:stream'

import {
  YOUTUBE_RESUMABLE_ENDPOINT,
  YouTubeResumableUploadInterruptedError,
  buildYouTubeUploadMetadata,
  createYouTubeResumableTransport
} from './youtube-resumable.mjs'


function request() {
  return {
    media: {
      path:
        'KINAOU/Renders/short.mp4',

      sizeBytes:
        4
    },

    metadata: {
      title:
        'Reviewed Short',

      description:
        'Explicit upload.',

      tags: [
        'KINAOU'
      ]
    }
  }
}


test(
  'builds private-only upload metadata before visibility UI exists',
  () => {
    assert.deepEqual(
      buildYouTubeUploadMetadata(
        request()
      ),
      {
        snippet: {
          title:
            'Reviewed Short',

          description:
            'Explicit upload.',

          tags: [
            'KINAOU'
          ]
        },

        status: {
          privacyStatus:
            'private'
        }
      }
    )
  }
)


test(
  'executes exactly one resumable session request and one binary PUT',
  async () => {
    const session =
      'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&upload_id=test'

    const seen =
      []

    const transport =
      createYouTubeResumableTransport({
        resolveAbsolutePath:
          async path => {
            assert.equal(
              path,
              'KINAOU/Renders/short.mp4'
            )

            return '/safe/short.mp4'
          },

        openSource:
          async path => {
            assert.equal(
              path,
              '/safe/short.mp4'
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

            seen.push({
              url,
              method:
                init.method,
              headers:
                new Headers(
                  init.headers
                ),
              body:
                init.body
            })

            if (
              seen.length === 1
            ) {
              const parsed =
                new URL(
                  url
                )

              assert.equal(
                parsed.origin
                  + parsed.pathname,
                YOUTUBE_RESUMABLE_ENDPOINT
              )

              assert.equal(
                parsed.searchParams
                  .get(
                    'uploadType'
                  ),
                'resumable'
              )

              assert.equal(
                parsed.searchParams
                  .get(
                    'part'
                  ),
                'snippet,status'
              )

              assert.equal(
                parsed.searchParams
                  .get(
                    'notifySubscribers'
                  ),
                'false'
              )

              assert.equal(
                init.method,
                'POST'
              )

              assert.equal(
                new Headers(
                  init.headers
                ).get(
                  'authorization'
                ),
                'Bearer access-secret'
              )

              assert.equal(
                new Headers(
                  init.headers
                ).get(
                  'x-upload-content-length'
                ),
                '4'
              )

              assert.deepEqual(
                JSON.parse(
                  String(
                    init.body
                  )
                ),
                {
                  snippet: {
                    title:
                      'Reviewed Short',

                    description:
                      'Explicit upload.',

                    tags: [
                      'KINAOU'
                    ]
                  },

                  status: {
                    privacyStatus:
                      'private'
                  }
                }
              )

              return new Response(
                '',
                {
                  status:
                    200,

                  headers: {
                    location:
                      session
                  }
                }
              )
            }

            assert.equal(
              url,
              session
            )

            assert.equal(
              init.method,
              'PUT'
            )

            assert.equal(
              new Headers(
                init.headers
              ).get(
                'content-length'
              ),
              '4'
            )

            return new Response(
              JSON.stringify({
                id:
                  'youtube-video-1'
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

    const result =
      await transport({
        request:
          request(),

        accessToken:
          'access-secret',

        signal:
          new AbortController()
            .signal
      })

    assert.equal(
      seen.length,
      2
    )

    assert.deepEqual(
      result,
      {
        remoteId:
          'youtube-video-1',

        remoteUrl:
          'https://www.youtube.com/watch?v=youtube-video-1'
      }
    )
  }
)


test(
  'rejects an untrusted resumable Location before sending video bytes',
  async () => {
    let opened =
      0

    const transport =
      createYouTubeResumableTransport({
        resolveAbsolutePath:
          async () =>
            '/safe/short.mp4',

        openSource:
          async () => {
            opened +=
              1

            return Readable.from(
              'data'
            )
          },

        fetchImpl:
          async () =>
            new Response(
              '',
              {
                status:
                  200,

                headers: {
                  location:
                    'https://evil.example/upload'
                }
              }
            )
      })

    await assert.rejects(
      transport({
        request:
          request(),

        accessToken:
          'access-secret',

        signal:
          new AbortController()
            .signal
      }),
      /untrusted/
    )

    assert.equal(
      opened,
      0
    )
  }
)


test(
  'surfaces 308 as an explicit resumable interruption without automatic retry',
  async () => {
    const session =
      'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&upload_id=test'

    let calls =
      0

    const transport =
      createYouTubeResumableTransport({
        resolveAbsolutePath:
          async () =>
            '/safe/short.mp4',

        openSource:
          async () =>
            Readable.from(
              'data'
            ),

        fetchImpl:
          async () => {
            calls +=
              1

            if (
              calls === 1
            ) {
              return new Response(
                '',
                {
                  status:
                    200,

                  headers: {
                    location:
                      session
                  }
                }
              )
            }

            return new Response(
              '',
              {
                status:
                  308,

                headers: {
                  range:
                    'bytes=0-1'
                }
              }
            )
          }
      })

    await assert.rejects(
      transport({
        request:
          request(),

        accessToken:
          'access-secret',

        signal:
          new AbortController()
            .signal
      }),
      error => {
        assert.ok(
          error
          instanceof
          YouTubeResumableUploadInterruptedError
        )

        assert.equal(
          error.status,
          308
        )

        assert.equal(
          error.sessionUrl,
          session
        )

        assert.doesNotMatch(
          JSON.stringify(
            error
          ),
          /upload_id=test/
        )

        return true
      }
    )

    assert.equal(
      calls,
      2
    )
  }
)


test(
  'never retries YouTube 5xx automatically',
  async () => {
    const session =
      'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&upload_id=test'

    let calls =
      0

    const transport =
      createYouTubeResumableTransport({
        resolveAbsolutePath:
          async () =>
            '/safe/short.mp4',

        openSource:
          async () =>
            Readable.from(
              'data'
            ),

        fetchImpl:
          async () => {
            calls +=
              1

            if (
              calls === 1
            ) {
              return new Response(
                '',
                {
                  status:
                    200,

                  headers: {
                    location:
                      session
                  }
                }
              )
            }

            return new Response(
              'temporary failure',
              {
                status:
                  503
              }
            )
          }
      })

    await assert.rejects(
      transport({
        request:
          request(),

        accessToken:
          'access-secret',

        signal:
          new AbortController()
            .signal
      }),
      error =>
        error
        instanceof
        YouTubeResumableUploadInterruptedError
    )

    assert.equal(
      calls,
      2
    )
  }
)
