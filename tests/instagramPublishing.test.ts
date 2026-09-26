import {
  expect,
  it
} from 'vitest'

import {
  instagramPublisherDescriptor,
  instagramPublishingScopes,
  parseInstagramBrokerCallbackUrl
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



it(
  'parses only an explicit HTTPS Instagram callback URL',
  () => {
    expect(
      parseInstagramBrokerCallbackUrl(
        'https://oauth.example/kinaou/instagram/callback?code=single-use-code&state=csrf-state'
      )
    ).toEqual({
      state:
        'csrf-state',

      code:
        'single-use-code'
    })


    expect(
      () =>
        parseInstagramBrokerCallbackUrl(
          'http://127.0.0.1:43117/callback?code=x&state=y'
        )
    ).toThrow(
      /HTTPS/
    )


    expect(
      () =>
        parseInstagramBrokerCallbackUrl(
          'https://oauth.example/callback?state=y'
        )
    ).toThrow(
      /authorization code/
    )


    expect(
      () =>
        parseInstagramBrokerCallbackUrl(
          'https://oauth.example/callback?error=access_denied'
        )
    ).toThrow(
      /not completed/
    )
  }
)
