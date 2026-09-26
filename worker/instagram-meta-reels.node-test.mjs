import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createInstagramReelsProtocol
} from './instagram-meta-reels.mjs'


test(
  'creates, checks and publishes an Instagram Reel container without putting token in URLs',
  async () => {
    const calls =
      []


    const protocol =
      createInstagramReelsProtocol({
        origin:
          'https://graph.instagram.com',

        version:
          'v99.0',

        fetchImpl:
          async (
            input,
            init
          ) => {
            const url =
              new URL(
                String(
                  input
                )
              )

            const headers =
              new Headers(
                init?.headers
              )

            calls.push({
              url:
                url.toString(),

              method:
                init?.method,

              authorization:
                headers.get(
                  'authorization'
                ),

              body:
                init?.body
                  ? String(
                      init.body
                    )
                  : ''
            })


            assert.equal(
              url.searchParams
                .has(
                  'access_token'
                ),
              false
            )


            if (
              url.pathname
                === '/v99.0/17841400000000000/media'
            ) {
              const body =
                new URLSearchParams(
                  String(
                    init.body
                  )
                )

              assert.equal(
                body.get(
                  'media_type'
                ),
                'REELS'
              )

              assert.equal(
                body.get(
                  'video_url'
                ),
                'https://delivery.example/reel.mp4?signature=worker-only'
              )

              assert.equal(
                body.get(
                  'share_to_feed'
                ),
                'false'
              )

              return new Response(
                JSON.stringify({
                  id:
                    'container_1'
                }),
                {
                  status:
                    200
                }
              )
            }


            if (
              url.pathname
                === '/v99.0/container_1'
            ) {
              assert.equal(
                url.searchParams
                  .get(
                    'fields'
                  ),
                'status_code,status'
              )

              return new Response(
                JSON.stringify({
                  id:
                    'container_1',

                  status_code:
                    'FINISHED',

                  status:
                    'Finished'
                }),
                {
                  status:
                    200
                }
              )
            }


            if (
              url.pathname
                === '/v99.0/17841400000000000/media_publish'
            ) {
              const body =
                new URLSearchParams(
                  String(
                    init.body
                  )
                )

              assert.equal(
                body.get(
                  'creation_id'
                ),
                'container_1'
              )

              return new Response(
                JSON.stringify({
                  id:
                    'instagram_media_1'
                }),
                {
                  status:
                    200
                }
              )
            }


            throw new Error(
              `Unexpected Meta request ${url}`
            )
          }
      })


    const created =
      await protocol
        .createContainer({
          accountId:
            '17841400000000000',

          accessToken:
            'worker-only-token',

          videoUrl:
            'https://delivery.example/reel.mp4?signature=worker-only',

          caption:
            'Reviewed Reel',

          shareToFeed:
            false
        })


    assert.equal(
      created.containerId,
      'container_1'
    )


    const status =
      await protocol
        .containerStatus({
          containerId:
            created.containerId,

          accessToken:
            'worker-only-token'
        })


    assert.equal(
      status.statusCode,
      'FINISHED'
    )


    const published =
      await protocol
        .publishContainer({
          accountId:
            '17841400000000000',

          containerId:
            created.containerId,

          accessToken:
            'worker-only-token'
        })


    assert.equal(
      published.remoteId,
      'instagram_media_1'
    )


    assert.equal(
      calls.length,
      3
    )


    assert.ok(
      calls.every(
        call =>
          call.authorization
          === 'Bearer worker-only-token'
      )
    )


    assert.doesNotMatch(
      calls.map(
        call =>
          call.url
      ).join(
        '\n'
      ),
      /worker-only-token/
    )
  }
)


test(
  'does not poll or retry automatically',
  async () => {
    let calls =
      0


    const protocol =
      createInstagramReelsProtocol({
        origin:
          'https://graph.instagram.com',

        version:
          'v99.0',

        fetchImpl:
          async () => {
            calls +=
              1

            throw new Error(
              'mock network failure'
            )
          }
      })


    await assert.rejects(
      protocol.createContainer({
        accountId:
          '17841400000000000',

        accessToken:
          'worker-only-token',

        videoUrl:
          'https://delivery.example/reel.mp4',

        caption:
          'Reviewed Reel'
      }),
      /mock network failure/
    )


    assert.equal(
      calls,
      1
    )
  }
)


test(
  'keeps graph origin and API version configuration-bound instead of stale hardcoding',
  () => {
    assert.throws(
      () =>
        createInstagramReelsProtocol({
          origin:
            'http://graph.instagram.com',

          version:
            'v99.0'
        }),
      /HTTPS origin/
    )


    assert.throws(
      () =>
        createInstagramReelsProtocol({
          origin:
            'https://graph.instagram.com',

          version:
            'latest'
        }),
      /vN\.N/
    )
  }
)
