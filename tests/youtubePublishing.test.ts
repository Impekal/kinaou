import {
  expect,
  it
} from 'vitest'

import {
  youtubePublisherDescriptor
} from '../src/core/youtubePublishing'


it(
  'declares YouTube as an external-credential remote publishing adapter',
  () => {
    expect(
      youtubePublisherDescriptor
    ).toEqual({
      adapterId:
        'youtube-data-api-v3',

      adapterVersion:
        '0.1.0',

      platform:
        'youtube',

      placements: [
        'youtube-video',
        'youtube-short'
      ],

      network:
        'remote-api',

      credentials:
        'external-only'
    })
  }
)
