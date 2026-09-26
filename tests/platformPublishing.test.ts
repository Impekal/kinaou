import {
  describe,
  expect,
  it
} from 'vitest'

import {
  publishIntegrityResultSchema,
  publishPackageEntrySchema
} from '../src/core/publishPackage'

import {
  beginPlatformPublishAttempt,
  cancelPlatformPublishAttempt,
  confirmPlatformPublishDraft,
  createPlatformPublishAttempt,
  failPlatformPublishAttempt,
  platformPublishAttemptSchema,
  platformPublishDraftSchema,
  platformPublishReceiptSchema,
  platformPublisherDescriptorSchema,
  preparePlatformPublishDraft,
  succeedPlatformPublishAttempt
} from '../src/core/platformPublishing'


const digest =
  'a'.repeat(
    64
  )


function packageEntry() {
  return publishPackageEntrySchema
    .parse({
      path:
        'KINAOU/Renders/short_youtube.publish.json',

      sizeBytes:
        900,

      modifiedAt:
        '2026-09-26T13:00:00.000Z',

      sourceAvailable:
        true,

      document: {
        schemaVersion:
          3,

        kind:
          'kinaou-publish-package',

        createdAt:
          '2026-09-26T12:59:00.000Z',

        projectId:
          'project-1',

        platform:
          'youtube',

        placement:
          'youtube-short',

        delivery: {
          checkedAt:
            '2026-09-26T12:58:00.000Z',

          ready:
            true,

          preferredFormat:
            'vertical'
        },

        title:
          'Reviewed Short',

        description:
          'Ready.',

        tags: [
          'KINAOU'
        ],

        media: {
          schemaVersion:
            1,

          jobId:
            'export-1',

          label:
            'Reviewed Short',

          outputRelativePath:
            'KINAOU/Renders/short.mp4',

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
            4_096,

          completedAt:
            '2026-09-26T12:55:00.000Z'
        },

        integrity: {
          checkedAt:
            '2026-09-26T12:58:00.000Z',

          actual: {
            sizeBytes:
              4_096,

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
}


function unchangedIntegrity() {
  return publishIntegrityResultSchema
    .parse({
      schemaVersion:
        1,

      packagePath:
        'KINAOU/Renders/short_youtube.publish.json',

      sourcePath:
        'KINAOU/Renders/short.mp4',

      checkedAt:
        '2026-09-26T13:01:00.000Z',

      status:
        'unchanged',

      expectedSha256:
        digest,

      actualSha256:
        digest,

      sizeBytes:
        4_096
    })
}


describe(
  'explicit platform publishing contract',
  () => {
    it(
      'prepares a draft only from a V3 package with fresh unchanged integrity',
      () => {
        const entry =
          packageEntry()

        const integrity =
          unchangedIntegrity()

        const beforeEntry =
          JSON.stringify(
            entry
          )

        const beforeIntegrity =
          JSON.stringify(
            integrity
          )

        const draft =
          preparePlatformPublishDraft(
            entry,
            integrity
          )

        expect(
          draft
        ).toEqual({
          schemaVersion:
            1,

          projectId:
            'project-1',

          packagePath:
            'KINAOU/Renders/short_youtube.publish.json',

          platform:
            'youtube',

          placement:
            'youtube-short',

          media: {
            path:
              'KINAOU/Renders/short.mp4',

            sizeBytes:
              4_096,

            sha256:
              digest
          },

          metadata: {
            title:
              'Reviewed Short',

            description:
              'Ready.',

            tags: [
              'KINAOU'
            ]
          },

          verifiedAt:
            '2026-09-26T13:01:00.000Z'
        })

        expect(
          JSON.stringify(
            entry
          )
        ).toBe(
          beforeEntry
        )

        expect(
          JSON.stringify(
            integrity
          )
        ).toBe(
          beforeIntegrity
        )
      }
    )


    it(
      'blocks missing, modified or mismatched media before any remote request can exist',
      () => {
        const entry =
          packageEntry()

        const unchanged =
          unchangedIntegrity()

        for (
          const status
          of [
            'modified',
            'missing'
          ] as const
        ) {
          const value =
            publishIntegrityResultSchema
              .parse({
                schemaVersion:
                  1,

                packagePath:
                  unchanged.packagePath,

                sourcePath:
                  unchanged.sourcePath,

                checkedAt:
                  unchanged.checkedAt,

                status,

                expectedSha256:
                  digest,

                ...(status === 'modified'
                  ? {
                      actualSha256:
                        'b'.repeat(
                          64
                        ),

                      sizeBytes:
                        4_096
                    }
                  : {})
              })

          expect(
            () =>
              preparePlatformPublishDraft(
                entry,
                value
              )
          ).toThrow(
            /fresh unchanged/
          )
        }

        expect(
          () =>
            preparePlatformPublishDraft(
              entry,
              {
                ...unchanged,

                actualSha256:
                  'b'.repeat(
                    64
                  ),

                status:
                  'unchanged'
              }
            )
        ).toThrow()
      }
    )


    it(
      'requires an explicit human confirmation before a publish request exists',
      () => {
        const draft =
          preparePlatformPublishDraft(
            packageEntry(),
            unchangedIntegrity()
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
              '2026-09-26T13:02:00.000Z'
            ),
            '11111111-1111-4111-8111-111111111111'
          )

        expect(
          request.approval
        ).toEqual({
          kind:
            'explicit-human',

          confirmedAt:
            '2026-09-26T13:02:00.000Z'
        })

        expect(
          request.requestId
        ).toBe(
          '11111111-1111-4111-8111-111111111111'
        )
      }
    )


    it(
      'models explicit submission as a separate state transition',
      () => {
        const request =
          confirmPlatformPublishDraft(
            preparePlatformPublishDraft(
              packageEntry(),
              unchangedIntegrity()
            ),
            new Date(
              '2026-09-26T13:02:00.000Z'
            ),
            '11111111-1111-4111-8111-111111111111'
          )

        const confirmed =
          createPlatformPublishAttempt(
            request,
            new Date(
              '2026-09-26T13:03:00.000Z'
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
              '2026-09-26T13:04:00.000Z'
            )
          )

        expect(
          submitting.state
        ).toBe(
          'submitting'
        )

        expect(
          submitting.submittedAt
        ).toBe(
          '2026-09-26T13:04:00.000Z'
        )

        expect(
          () =>
            beginPlatformPublishAttempt(
              submitting
            )
        ).toThrow(
          /Only a confirmed/
        )
      }
    )


    it(
      'accepts only a receipt matching the exact submitted attempt',
      () => {
        const request =
          confirmPlatformPublishDraft(
            preparePlatformPublishDraft(
              packageEntry(),
              unchangedIntegrity()
            ),
            new Date(
              '2026-09-26T13:02:00.000Z'
            ),
            '11111111-1111-4111-8111-111111111111'
          )

        const submitting =
          beginPlatformPublishAttempt(
            createPlatformPublishAttempt(
              request,
              new Date(
                '2026-09-26T13:03:00.000Z'
              ),
              '22222222-2222-4222-8222-222222222222'
            ),
            new Date(
              '2026-09-26T13:04:00.000Z'
            )
          )

        const receipt =
          platformPublishReceiptSchema
            .parse({
              schemaVersion:
                1,

              receiptId:
                '33333333-3333-4333-8333-333333333333',

              requestId:
                request.requestId,

              attemptId:
                submitting.id,

              platform:
                'youtube',

              placement:
                'youtube-short',

              adapter: {
                id:
                  'youtube-adapter',

                version:
                  '0.1.0'
              },

              sourceSha256:
                digest,

              remote: {
                id:
                  'remote-video-1',

                url:
                  'https://www.youtube.com/watch?v=remote-video-1'
              },

              publishedAt:
                '2026-09-26T13:05:00.000Z'
            })

        const succeeded =
          succeedPlatformPublishAttempt(
            submitting,
            receipt,
            new Date(
              '2026-09-26T13:05:00.000Z'
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
          'remote-video-1'
        )

        expect(
          () =>
            succeedPlatformPublishAttempt(
              submitting,
              {
                ...receipt,

                sourceSha256:
                  'b'.repeat(
                    64
                  )
              }
            )
        ).toThrow(
          /does not match/
        )
      }
    )


    it(
      'keeps failure and cancellation terminal without automatic retry',
      () => {
        const request =
          confirmPlatformPublishDraft(
            preparePlatformPublishDraft(
              packageEntry(),
              unchangedIntegrity()
            ),
            new Date(
              '2026-09-26T13:02:00.000Z'
            ),
            '11111111-1111-4111-8111-111111111111'
          )

        const confirmed =
          createPlatformPublishAttempt(
            request,
            new Date(
              '2026-09-26T13:03:00.000Z'
            ),
            '22222222-2222-4222-8222-222222222222'
          )

        const submitting =
          beginPlatformPublishAttempt(
            confirmed,
            new Date(
              '2026-09-26T13:04:00.000Z'
            )
          )

        const failed =
          failPlatformPublishAttempt(
            submitting,
            'Remote API rejected the request',
            new Date(
              '2026-09-26T13:05:00.000Z'
            )
          )

        expect(
          failed.state
        ).toBe(
          'failed'
        )

        expect(
          () =>
            beginPlatformPublishAttempt(
              failed
            )
        ).toThrow(
          /Only a confirmed/
        )

        const cancelled =
          cancelPlatformPublishAttempt(
            confirmed,
            new Date(
              '2026-09-26T13:06:00.000Z'
            )
          )

        expect(
          cancelled.state
        ).toBe(
          'cancelled'
        )

        expect(
          () =>
            beginPlatformPublishAttempt(
              cancelled
            )
        ).toThrow(
          /Only a confirmed/
        )
      }
    )


    it(
      'keeps credentials and secrets outside every durable publishing contract',
      () => {
        const draft =
          preparePlatformPublishDraft(
            packageEntry(),
            unchangedIntegrity()
          )

        const request =
          confirmPlatformPublishDraft(
            draft,
            new Date(
              '2026-09-26T13:02:00.000Z'
            ),
            '11111111-1111-4111-8111-111111111111'
          )

        const attempt =
          createPlatformPublishAttempt(
            request,
            new Date(
              '2026-09-26T13:03:00.000Z'
            ),
            '22222222-2222-4222-8222-222222222222'
          )

        for (
          const value
          of [
            draft,
            request,
            attempt
          ]
        ) {
          const serialized =
            JSON.stringify(
              value
            )

          expect(
            serialized
          ).not.toMatch(
            /access.?token|refresh.?token|password|secret|credential/i
          )
        }

        expect(
          () =>
            platformPublishDraftSchema
              .parse({
                ...draft,

                accessToken:
                  'must-not-persist'
              })
        ).toThrow()

        expect(
          () =>
            platformPublishAttemptSchema
              .parse({
                ...attempt,

                refreshToken:
                  'must-not-persist'
              })
        ).toThrow()
      }
    )


    it(
      'declares adapters as remote API publishers with external-only credentials',
      () => {
        const descriptor =
          platformPublisherDescriptorSchema
            .parse({
              adapterId:
                'youtube-adapter',

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

        expect(
          descriptor.credentials
        ).toBe(
          'external-only'
        )

        expect(
          descriptor.placements
        ).toEqual([
          'youtube-video',
          'youtube-short'
        ])

        expect(
          () =>
            platformPublisherDescriptorSchema
              .parse({
                ...descriptor,

                accessToken:
                  'forbidden'
              })
        ).toThrow()
      }
    )
  }
)
