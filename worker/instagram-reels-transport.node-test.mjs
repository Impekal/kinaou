import test from 'node:test'
import assert from 'node:assert/strict'

import {
  InstagramContainerNotReadyError,
  createInstagramReelsTransport
} from './instagram-reels-transport.mjs'


function request() {
  return {
    metadata: {
      title:
        'My Reel',

      description:
        'Reviewed description.',

      tags: [
        'KINAOU',
        'Video Editing'
      ]
    }
  }
}


test(
  'creates, checks exactly once and publishes only a finished Reel container',
  async () => {
    const calls =
      []


    const transport =
      createInstagramReelsTransport({
        protocol: {
          async createContainer(
            value
          ) {
            calls.push(
              'create'
            )

            assert.equal(
              value.caption,
              'My Reel\n\nReviewed description.\n\n#KINAOU #VideoEditing'
            )

            assert.equal(
              value.shareToFeed,
              false
            )

            return {
              containerId:
                'container-1'
            }
          },

          async containerStatus(
            value
          ) {
            calls.push(
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
            calls.push(
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
        }
      })


    const result =
      await transport({
        request:
          request(),

        accessToken:
          'worker-only-token',

        accountId:
          'account-id',

        deliveryUrl:
          'https://delivery.example/reel.mp4',

        signal:
          new AbortController()
            .signal
      })


    assert.deepEqual(
      calls,
      [
        'create',
        'status',
        'publish'
      ]
    )


    assert.deepEqual(
      result,
      {
        remoteId:
          'instagram-media-1'
      }
    )
  }
)


test(
  'does not poll or publish when Meta says the container is still processing',
  async () => {
    const calls =
      []


    const transport =
      createInstagramReelsTransport({
        protocol: {
          async createContainer() {
            calls.push(
              'create'
            )

            return {
              containerId:
                'container-processing'
            }
          },

          async containerStatus() {
            calls.push(
              'status'
            )

            return {
              containerId:
                'container-processing',

              statusCode:
                'IN_PROGRESS',

              status:
                'Processing'
            }
          },

          async publishContainer() {
            calls.push(
              'publish'
            )

            throw new Error(
              'must not publish'
            )
          }
        }
      })


    await assert.rejects(
      transport({
        request:
          request(),

        accessToken:
          'worker-only-token',

        accountId:
          'account',

        deliveryUrl:
          'https://delivery.example/reel.mp4'
      }),
      error => {
        assert.ok(
          error
          instanceof InstagramContainerNotReadyError
        )

        assert.equal(
          error.containerId,
          'container-processing'
        )

        assert.equal(
          Object.keys(
            error
          ).includes(
            'containerId'
          ),
          false
        )

        return true
      }
    )


    assert.deepEqual(
      calls,
      [
        'create',
        'status'
      ]
    )
  }
)


test(
  'does not retry after Meta publish failure',
  async () => {
    let publishCalls =
      0


    const transport =
      createInstagramReelsTransport({
        protocol: {
          async createContainer() {
            return {
              containerId:
                'container'
            }
          },

          async containerStatus() {
            return {
              containerId:
                'container',

              statusCode:
                'FINISHED',

              status:
                'Finished'
            }
          },

          async publishContainer() {
            publishCalls +=
              1

            throw new Error(
              'mock Meta failure'
            )
          }
        }
      })


    await assert.rejects(
      transport({
        request:
          request(),

        accessToken:
          'token',

        accountId:
          'account',

        deliveryUrl:
          'https://delivery.example/reel.mp4'
      }),
      /mock Meta failure/
    )


    assert.equal(
      publishCalls,
      1
    )
  }
)
