import test from 'node:test'
import assert from 'node:assert/strict'

import {
  normalizeInstagramDeliveryEvidence,
  resolveEnvironmentInstagramDeliveryUrl
} from './instagram-delivery.mjs'


const SHA =
  'a'.repeat(
    64
  )


const evidence = {
  path:
    'KINAOU/Renders/reel.mp4',

  sizeBytes:
    4096,

  sha256:
    SHA
}


test(
  'resolves only an explicitly configured HTTPS staging URL bound to exact source evidence',
  () => {
    assert.deepEqual(
      normalizeInstagramDeliveryEvidence(
        evidence
      ),
      evidence
    )


    const url =
      resolveEnvironmentInstagramDeliveryUrl(
        evidence,
        {
          KINAOU_INSTAGRAM_DELIVERY_URL:
            'https://delivery.example/reel.mp4?signature=secret',

          KINAOU_INSTAGRAM_DELIVERY_PATH:
            evidence.path,

          KINAOU_INSTAGRAM_DELIVERY_SHA256:
            SHA,

          KINAOU_INSTAGRAM_DELIVERY_SIZE_BYTES:
            '4096'
        }
      )


    assert.equal(
      url,
      'https://delivery.example/reel.mp4?signature=secret'
    )
  }
)


test(
  'rejects stale path, hash, size and localhost delivery configuration',
  () => {
    const base = {
      KINAOU_INSTAGRAM_DELIVERY_URL:
        'https://delivery.example/reel.mp4',

      KINAOU_INSTAGRAM_DELIVERY_PATH:
        evidence.path,

      KINAOU_INSTAGRAM_DELIVERY_SHA256:
        SHA,

      KINAOU_INSTAGRAM_DELIVERY_SIZE_BYTES:
        '4096'
    }


    assert.throws(
      () =>
        resolveEnvironmentInstagramDeliveryUrl(
          evidence,
          {
            ...base,

            KINAOU_INSTAGRAM_DELIVERY_PATH:
              'KINAOU/Renders/other.mp4'
          }
        ),
      /path does not match/
    )


    assert.throws(
      () =>
        resolveEnvironmentInstagramDeliveryUrl(
          evidence,
          {
            ...base,

            KINAOU_INSTAGRAM_DELIVERY_SHA256:
              'b'.repeat(
                64
              )
          }
        ),
      /SHA-256 does not match/
    )


    assert.throws(
      () =>
        resolveEnvironmentInstagramDeliveryUrl(
          evidence,
          {
            ...base,

            KINAOU_INSTAGRAM_DELIVERY_SIZE_BYTES:
              '5000'
          }
        ),
      /size does not match/
    )


    assert.throws(
      () =>
        resolveEnvironmentInstagramDeliveryUrl(
          evidence,
          {
            ...base,

            KINAOU_INSTAGRAM_DELIVERY_URL:
              'https://localhost/reel.mp4'
          }
        ),
      /publicly reachable HTTPS/
    )
  }
)
