import test from 'node:test'
import assert from 'node:assert/strict'

import {
  publishPlacementProfiles,
  reviewPublishPlacement,
  validatePublishPlacement
} from './publish-profiles.mjs'


const receipt = {
  format:
    'vertical',

  durationMs:
    60_000
}


test(
  'defines deterministic worker publish placements',
  () => {
    assert.equal(
      validatePublishPlacement(
        'youtube-short'
      ),
      'youtube-short'
    )

    assert.equal(
      publishPlacementProfiles[
        'youtube-short'
      ].platform,
      'youtube'
    )

    assert.equal(
      publishPlacementProfiles[
        'instagram-reel'
      ].preferredFormat,
      'vertical'
    )

    assert.throws(
      () =>
        validatePublishPlacement(
          'unknown'
        )
    )
  }
)


test(
  'accepts a compatible Short delivery contract',
  () => {
    const review =
      reviewPublishPlacement(
        receipt,
        'youtube-short',
        {
          title:
            'Short',

          description:
            'Description',

          tags:
            [
              'KINAOU'
            ]
        }
      )

    assert.equal(
      review.ready,
      true
    )

    assert.deepEqual(
      review.issues,
      []
    )
  }
)


test(
  'rejects incompatible placement format and duration',
  () => {
    const review =
      reviewPublishPlacement(
        {
          format:
            'landscape',

          durationMs:
            180_001
        },
        'youtube-short',
        {
          title:
            'Short',

          description:
            '',

          tags:
            []
        }
      )

    assert.equal(
      review.ready,
      false
    )

    assert.ok(
      review.issues.includes(
        'format'
      )
    )

    assert.ok(
      review.issues.includes(
        'duration-maximum'
      )
    )
  }
)
