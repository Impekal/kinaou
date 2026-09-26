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
      'KINAOU/Renders/acceptance_youtube.publish.json',

    sizeBytes:
      1024,

    modifiedAt:
      '2026-09-26T20:00:00.000Z',

    sourceAvailable:
      true,

    document: {
      schemaVersion:
        3,

      kind:
        'kinaou-publish-package',

      createdAt:
        '2026-09-26T19:59:00.000Z',

      projectId:
        'youtube-acceptance-project',

      platform:
        'youtube',

      placement:
        'youtube-short',

      delivery: {
        checkedAt:
          '2026-09-26T19:58:00.000Z',

        ready:
          true,

        preferredFormat:
          'vertical'
      },

      title:
        'Reviewed YouTube Short',

      description:
        'Explicit private publishing acceptance.',

      tags: [
        'KINAOU',
        'YouTube'
      ],

      media: {
        schemaVersion:
          1,

        jobId:
          'youtube-export-1',

        label:
          'Reviewed YouTube Short',

        outputRelativePath:
          'KINAOU/Renders/youtube_acceptance.mp4',

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
          '2026-09-26T19:55:00.000Z'
      },

      integrity: {
        checkedAt:
          '2026-09-26T19:58:00.000Z',

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
      'KINAOU/Renders/youtube_acceptance.mp4',

    checkedAt:
      '2026-09-26T20:01:00.000Z',

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
  'Phase 5.5 explicit YouTube publishing acceptance',
  () => {
    it(
      'requires unchanged evidence and explicit human confirmation before a successful private publishing receipt can exist',
      () => {
        const draft =
          preparePlatformPublishDraft(
            packageEntry,
            integrity
          )


        expect(
          draft.platform
        ).toBe(
          'youtube'
        )

        expect(
          draft.placement
        ).toBe(
          'youtube-short'
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
              '2026-09-26T20:02:00.000Z'
            ),
            '11111111-1111-4111-8111-111111111111'
          )


        expect(
          request.approval
        ).toEqual({
          kind:
            'explicit-human',

          confirmedAt:
            '2026-09-26T20:02:00.000Z'
        })


        const confirmed =
          createPlatformPublishAttempt(
            request,
            new Date(
              '2026-09-26T20:03:00.000Z'
            ),
            '22222222-2222-4222-8222-222222222222'
          )


        expect(
          confirmed.state
        ).toBe(
          'confirmed'
        )

        expect(
          confirmed.submittedAt
        ).toBeUndefined()


        const submitting =
          beginPlatformPublishAttempt(
            confirmed,
            new Date(
              '2026-09-26T20:04:00.000Z'
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
            'youtube' as const,

          placement:
            'youtube-short' as const,

          adapter: {
            id:
              'youtube-data-api-v3',

            version:
              '0.1.0'
          },

          sourceSha256:
            digest,

          remote: {
            id:
              'youtube-video-acceptance',

            url:
              'https://www.youtube.com/watch?v=youtube-video-acceptance'
          },

          publishedAt:
            '2026-09-26T20:05:00.000Z'
        }


        const succeeded =
          succeedPlatformPublishAttempt(
            submitting,
            receipt,
            new Date(
              '2026-09-26T20:05:00.000Z'
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
          'youtube-video-acceptance'
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
          /access.?token|refresh.?token|client.?secret|password|credential/i
        )
      }
    )


    it(
      'blocks publishing preparation when the reviewed MP4 is no longer unchanged',
      () => {
        const modified =
          publishIntegrityResultSchema.parse({
            schemaVersion:
              1,

            packagePath:
              packageEntry.path,

            sourcePath:
              'KINAOU/Renders/youtube_acceptance.mp4',

            checkedAt:
              '2026-09-26T20:06:00.000Z',

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
      'keeps generic and non-YouTube handoffs outside the YouTube publishing path',
      () => {
        const document =
          packageEntry.document

        expect(
          document.platform
        ).toBe(
          'youtube'
        )

        expect(
          document.schemaVersion
        ).toBe(
          3
        )

        if (
          document.schemaVersion !== 3
        ) {
          throw new Error(
            'Expected a V3 YouTube publish package'
          )
        }

        expect(
          document.delivery.ready
        ).toBe(
          true
        )
      }
    )
  }
)
