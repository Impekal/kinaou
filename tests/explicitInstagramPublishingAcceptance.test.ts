import {
  describe,
  expect,
  it
} from 'vitest'

import {
  beginPlatformPublishAttempt,
  confirmPlatformPublishDraft,
  createPlatformPublishAttempt,
  preparePlatformPublishDraft,
  succeedPlatformPublishAttempt
} from '../src/core/platformPublishing'

import {
  publishIntegrityResultSchema,
  publishPackageEntrySchema
} from '../src/core/publishPackage'


const digest =
  'a'.repeat(
    64
  )


const packageEntry =
  publishPackageEntrySchema.parse({
    path:
      'KINAOU/Renders/acceptance_instagram.publish.json',

    sizeBytes:
      1024,

    modifiedAt:
      '2026-09-26T22:00:00.000Z',

    sourceAvailable:
      true,

    document: {
      schemaVersion:
        3,

      kind:
        'kinaou-publish-package',

      createdAt:
        '2026-09-26T21:59:00.000Z',

      projectId:
        'instagram-acceptance-project',

      platform:
        'instagram',

      placement:
        'instagram-reel',

      delivery: {
        checkedAt:
          '2026-09-26T21:58:00.000Z',

        ready:
          true,

        preferredFormat:
          'vertical'
      },

      title:
        'Reviewed Instagram Reel',

      description:
        'Explicit Instagram acceptance.',

      tags: [
        'KINAOU',
        'Reel'
      ],

      media: {
        schemaVersion:
          1,

        jobId:
          'instagram-export-1',

        label:
          'Reviewed Instagram Reel',

        outputRelativePath:
          'KINAOU/Renders/instagram_acceptance.mp4',

        format:
          'vertical',

        range: {
          inMs:
            0,

          outMs:
            60_000
        },

        sceneIds: [
          'scene-1'
        ],

        durationMs:
          60_000,

        sizeBytes:
          4096,

        completedAt:
          '2026-09-26T21:55:00.000Z'
      },

      integrity: {
        checkedAt:
          '2026-09-26T21:58:00.000Z',

        actual: {
          sizeBytes:
            4096,

          durationMs:
            60_000,

          width:
            1080,

          height:
            1920,

          videoCodec:
            'h264',

          audioCodec:
            'aac'
        },

        sha256:
          digest
      }
    }
  })


const integrity =
  publishIntegrityResultSchema.parse({
    schemaVersion:
      1,

    packagePath:
      packageEntry.path,

    sourcePath:
      'KINAOU/Renders/instagram_acceptance.mp4',

    checkedAt:
      '2026-09-26T22:01:00.000Z',

    status:
      'unchanged',

    expectedSha256:
      digest,

    actualSha256:
      digest,

    sizeBytes:
      4096
  })


describe(
  'Phase 5.6 explicit Instagram Reel acceptance',
  () => {
    it(
      'requires unchanged evidence and explicit human confirmation before successful publishing can exist',
      () => {
        const draft =
          preparePlatformPublishDraft(
            packageEntry,
            integrity
          )


        expect(
          draft.platform
        ).toBe(
          'instagram'
        )


        expect(
          draft.placement
        ).toBe(
          'instagram-reel'
        )


        expect(
          'approval'
          in draft
        ).toBe(
          false
        )


        const request =
          confirmPlatformPublishDraft(
            draft,
            new Date(
              '2026-09-26T22:02:00.000Z'
            ),
            '11111111-1111-4111-8111-111111111111'
          )


        expect(
          request.approval
        ).toEqual({
          kind:
            'explicit-human',

          confirmedAt:
            '2026-09-26T22:02:00.000Z'
        })


        const confirmed =
          createPlatformPublishAttempt(
            request,
            new Date(
              '2026-09-26T22:03:00.000Z'
            ),
            '22222222-2222-4222-8222-222222222222'
          )


        expect(
          confirmed.state
        ).toBe(
          'confirmed'
        )


        const submitting =
          beginPlatformPublishAttempt(
            confirmed,
            new Date(
              '2026-09-26T22:04:00.000Z'
            )
          )


        expect(
          submitting.state
        ).toBe(
          'submitting'
        )


        const receipt = {
          schemaVersion:
            1 as const,

          receiptId:
            '33333333-3333-4333-8333-333333333333',

          requestId:
            request.requestId,

          attemptId:
            submitting.id,

          platform:
            'instagram' as const,

          placement:
            'instagram-reel' as const,

          adapter: {
            id:
              'instagram-platform-api',

            version:
              '0.1.0'
          },

          sourceSha256:
            digest,

          remote: {
            id:
              'instagram-media-acceptance'
          },

          publishedAt:
            '2026-09-26T22:05:00.000Z'
        }


        const succeeded =
          succeedPlatformPublishAttempt(
            submitting,
            receipt,
            new Date(
              '2026-09-26T22:05:00.000Z'
            )
          )


        expect(
          succeeded.state
        ).toBe(
          'succeeded'
        )


        expect(
          succeeded.receipt
            ?.remote.id
        ).toBe(
          'instagram-media-acceptance'
        )


        const serialized =
          JSON.stringify({
            draft,
            request,
            confirmed,
            submitting,
            succeeded
          })


        expect(
          serialized
        ).not.toMatch(
          /access.?token|client.?secret|delivery.?url|signed.?url|password|credential/i
        )
      }
    )


    it(
      'blocks publishing preparation when the MP4 is modified',
      () => {
        const modified =
          publishIntegrityResultSchema.parse({
            schemaVersion:
              1,

            packagePath:
              packageEntry.path,

            sourcePath:
              'KINAOU/Renders/instagram_acceptance.mp4',

            checkedAt:
              '2026-09-26T22:06:00.000Z',

            status:
              'modified',

            expectedSha256:
              digest,

            actualSha256:
              'b'.repeat(
                64
              ),

            sizeBytes:
              4096
          })


        expect(
          () =>
            preparePlatformPublishDraft(
              packageEntry,
              modified
            )
        ).toThrow(
          /fresh unchanged/
        )
      }
    )


    it(
      'preserves explicit Instagram Reel placement review',
      () => {
        const document =
          packageEntry.document


        expect(
          document.schemaVersion
        ).toBe(
          3
        )


        if (
          document.schemaVersion !== 3
        ) {
          throw new Error(
            'Expected V3 Instagram package'
          )
        }


        expect(
          document.platform
        ).toBe(
          'instagram'
        )


        expect(
          document.placement
        ).toBe(
          'instagram-reel'
        )


        expect(
          document.delivery.ready
        ).toBe(
          true
        )
      }
    )
  }
)
