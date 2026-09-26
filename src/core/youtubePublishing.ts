import {
  platformPublisherDescriptorSchema
} from './platformPublishing'


export const youtubePublisherDescriptor =
  platformPublisherDescriptorSchema
    .parse({
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
