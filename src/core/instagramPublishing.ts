import {
  platformPublisherDescriptorSchema
} from './platformPublishing'


export const instagramPublishingScopes = [
  'instagram_business_basic',
  'instagram_business_content_publish'
] as const


export const instagramPublisherDescriptor =
  platformPublisherDescriptorSchema
    .parse({
      adapterId:
        'instagram-platform-api',

      adapterVersion:
        '0.1.0',

      platform:
        'instagram',

      /*
       * Phase 5.6 starts with Reels only.
       *
       * Feed-video publishing remains outside the adapter until its
       * delivery and API behavior are independently accepted.
       */
      placements: [
        'instagram-reel'
      ],

      network:
        'remote-api',

      credentials:
        'external-only'
    })
