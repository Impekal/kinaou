import {
  expect,
  it
} from 'vitest'

import {
  instagramPublisherDescriptor,
  instagramPublishingScopes
} from '../src/core/instagramPublishing'


it(
  'declares a Reels-only Instagram adapter with the current publishing scopes',
  () => {
    expect(
      instagramPublisherDescriptor
    ).toEqual({
      adapterId:
        'instagram-platform-api',

      adapterVersion:
        '0.1.0',

      platform:
        'instagram',

      placements: [
        'instagram-reel'
      ],

      network:
        'remote-api',

      credentials:
        'external-only'
    })

    expect(
      instagramPublishingScopes
    ).toEqual([
      'instagram_business_basic',
      'instagram_business_content_publish'
    ])
  }
)
