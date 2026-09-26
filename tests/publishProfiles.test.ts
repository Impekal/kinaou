import {
  describe,
  expect,
  it
} from 'vitest'

import {
  exportReceiptSchema
} from '../src/core/exportHistory'

import {
  defaultPublishPlacementForPlatform,
  publishPlacementProfiles,
  reviewPublishPlacement
} from '../src/core/publishProfiles'


function receipt(
  format:
    'landscape'
    | 'vertical'
    | 'square',

  durationMs =
    30_000
) {
  return exportReceiptSchema.parse({
    schemaVersion:
      1,

    jobId:
      `job-${format}-${durationMs}`,

    label:
      'Reviewed export',

    outputRelativePath:
      `KINAOU/Renders/${format}-${durationMs}.mp4`,

    format,

    range: {
      inMs:
        0,

      outMs:
        durationMs
    },

    sceneIds:
      [],

    durationMs,

    sizeBytes:
      1000,

    completedAt:
      '2026-09-26T12:00:00.000Z'
  })
}


describe(
  'publish placement profiles',
  () => {
    it(
      'defines deterministic offline delivery contracts',
      () => {
        expect(
          Object.keys(
            publishPlacementProfiles
          )
        ).toEqual([
          'youtube-video',
          'youtube-short',
          'instagram-reel',
          'instagram-feed',
          'tiktok-video',
          'generic'
        ])

        expect(
          publishPlacementProfiles[
            'youtube-short'
          ]
        ).toMatchObject({
          platform:
            'youtube',

          preferredFormat:
            'vertical',

          formats: [
            'vertical',
            'square'
          ]
        })

        expect(
          publishPlacementProfiles[
            'instagram-reel'
          ]
        ).toMatchObject({
          platform:
            'instagram',

          preferredFormat:
            'vertical',

          formats: [
            'vertical'
          ]
        })
      }
    )

    it(
      'selects a compatible default placement without mutating anything',
      () => {
        expect(
          defaultPublishPlacementForPlatform(
            'youtube',
            'vertical'
          )
        ).toBe(
          'youtube-short'
        )

        expect(
          defaultPublishPlacementForPlatform(
            'youtube',
            'landscape'
          )
        ).toBe(
          'youtube-video'
        )

        expect(
          defaultPublishPlacementForPlatform(
            'instagram',
            'vertical'
          )
        ).toBe(
          'instagram-reel'
        )

        expect(
          defaultPublishPlacementForPlatform(
            'instagram',
            'square'
          )
        ).toBe(
          'instagram-feed'
        )

        expect(
          defaultPublishPlacementForPlatform(
            'tiktok',
            'landscape'
          )
        ).toBe(
          'tiktok-video'
        )

        expect(
          defaultPublishPlacementForPlatform(
            'generic',
            'vertical'
          )
        ).toBe(
          'generic'
        )
      }
    )

    it(
      'accepts a reviewed vertical YouTube Short',
      () => {
        const review =
          reviewPublishPlacement(
            receipt(
              'vertical',
              60_000
            ),
            'youtube-short',
            {
              title:
                'Reviewed Short',

              description:
                'Description',

              tags: [
                'KINAOU',
                'Video'
              ]
            }
          )

        expect(
          review
        ).toEqual({
          placement:
            'youtube-short',

          platform:
            'youtube',

          ready:
            true,

          preferredFormat:
            'vertical',

          issues:
            []
        })
      }
    )

    it(
      'rejects an incompatible landscape Instagram Reel',
      () => {
        const review =
          reviewPublishPlacement(
            receipt(
              'landscape'
            ),
            'instagram-reel',
            {
              title:
                '',

              description:
                '',

              tags:
                []
            }
          )

        expect(
          review.ready
        ).toBe(false)

        expect(
          review.issues
            .map(
              issue =>
                issue.code
            )
        ).toContain(
          'format'
        )
      }
    )

    it(
      'rejects a Short beyond the configured duration contract',
      () => {
        const review =
          reviewPublishPlacement(
            receipt(
              'vertical',
              180_001
            ),
            'youtube-short',
            {
              title:
                'Too long',

              description:
                '',

              tags:
                []
            }
          )

        expect(
          review.ready
        ).toBe(false)

        expect(
          review.issues
        ).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              code:
                'duration-maximum'
            })
          ])
        )
      }
    )

    it(
      'validates placement-specific metadata limits',
      () => {
        const review =
          reviewPublishPlacement(
            receipt(
              'vertical'
            ),
            'youtube-short',
            {
              title:
                'x'.repeat(
                  101
                ),

              description:
                '',

              tags:
                [
                  'x'.repeat(
                    81
                  )
                ]
            }
          )

        expect(
          review.issues
            .map(
              issue =>
                issue.code
            )
        ).toEqual(
          expect.arrayContaining([
            'title-length',
            'tag-length'
          ])
        )
      }
    )

    it(
      'uses Unicode code points rather than UTF-16 units for limits',
      () => {
        const review =
          reviewPublishPlacement(
            receipt(
              'vertical'
            ),
            'youtube-short',
            {
              title:
                '😀'.repeat(
                  100
                ),

              description:
                '',

              tags:
                []
            }
          )

        expect(
          review.ready
        ).toBe(true)
      }
    )
  }
)
