import {
  describe,
  expect,
  it
} from 'vitest'

import {
  exportReceiptSchema
} from '../src/core/exportHistory'

import {
  buildPublishPackageRequest,
  parsePublishPreflightResult,
  projectPublishDefaults,
  publishIntegrityResultSchema,
  publishPackageEntrySchema,
  saveProjectPublishDefaults
} from '../src/core/publishPackage'

import {
  reviewPublishPlacement
} from '../src/core/publishProfiles'

import {
  createProject,
  parseProject
} from '../src/core/project'


const receipt =
  exportReceiptSchema.parse({
    schemaVersion:
      1,

    jobId:
      'acceptance-short-export',

    label:
      'Reviewed vertical Short',

    outputRelativePath:
      'KINAOU/Renders/acceptance_vertical.mp4',

    format:
      'vertical',

    range: {
      inMs:
        0,

      outMs:
        60_000
    },

    sceneIds: [
      'hook',
      'proof'
    ],

    durationMs:
      60_000,

    sizeBytes:
      4_096,

    completedAt:
      '2026-09-26T12:00:00.000Z'
  })


const digest =
  'a'.repeat(
    64
  )


describe(
  'Phase 5.4 platform publish readiness acceptance',
  () => {
    it(
      'carries a reviewed export through placement, preflight, V3 handoff and integrity without publishing it',
      () => {
        const source =
          createProject(
            'Platform readiness acceptance',
            new Date(
              '2026-09-26T11:55:00.000Z'
            )
          )

        const sourceBefore =
          JSON.stringify(
            source
          )


        /*
         * A deliberate project preference is durable.
         *
         * The export is vertical, but the human may still deliberately
         * retain YouTube Video as the saved default. KINAOU must not
         * silently replace that preference with YouTube Short.
         */
        const withDefaults =
          saveProjectPublishDefaults(
            source,
            {
              platform:
                'youtube',

              placement:
                'youtube-video',

              title:
                'Reviewed delivery',

              description:
                'Human-reviewed metadata.',

              tags:
                'KINAOU, local'
            },
            new Date(
              '2026-09-26T12:01:00.000Z'
            )
          )

        expect(
          JSON.stringify(
            source
          )
        ).toBe(
          sourceBefore
        )

        const defaults =
          projectPublishDefaults(
            withDefaults
          )

        expect(
          defaults
        ).not.toBeNull()

        expect(
          defaults?.schemaVersion
        ).toBe(
          2
        )

        if (
          !defaults
          || defaults.schemaVersion !== 2
        ) {
          throw new Error(
            'Expected V2 publish defaults'
          )
        }

        expect(
          defaults.placement
        ).toBe(
          'youtube-video'
        )


        /*
         * For this concrete export the human selects YouTube Short.
         * Review is pure: nothing is applied or published automatically.
         */
        const review =
          reviewPublishPlacement(
            receipt,
            'youtube-short',
            {
              title:
                'Reviewed Short',

              description:
                'Ready for handoff.',

              tags: [
                'KINAOU',
                'local'
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


        const request =
          buildPublishPackageRequest(
            withDefaults,
            receipt,
            {
              platform:
                'youtube',

              placement:
                'youtube-short',

              title:
                'Reviewed Short',

              description:
                'Ready for handoff.',

              tags:
                'KINAOU, local'
            }
          )

        expect(
          request
        ).toMatchObject({
          schemaVersion:
            2,

          platform:
            'youtube',

          placement:
            'youtube-short',

          export: {
            jobId:
              receipt.jobId,

            format:
              'vertical'
          }
        })


        /*
         * Worker preflight contract:
         * real dimensions, duration, file size and video stream agree
         * with the successful export receipt.
         */
        const preflight =
          parsePublishPreflightResult(
            {
              schemaVersion:
                1,

              sourcePath:
                receipt.outputRelativePath,

              checkedAt:
                '2026-09-26T12:02:00.000Z',

              ready:
                true,

              durationToleranceMs:
                250,

              expected: {
                jobId:
                  receipt.jobId,

                format:
                  'vertical',

                width:
                  1080,

                height:
                  1920,

                durationMs:
                  60_000,

                sizeBytes:
                  4_096
              },

              actual: {
                sizeBytes:
                  4_096,

                durationMs:
                  60_010,

                width:
                  1080,

                height:
                  1920,

                videoCodec:
                  'h264',

                audioCodec:
                  'aac'
              },

              checks: {
                size:
                  true,

                videoStream:
                  true,

                dimensions:
                  true,

                duration:
                  true
              }
            },
            receipt
          )

        expect(
          preflight.ready
        ).toBe(
          true
        )


        /*
         * New handoffs persist exact placement + delivery review +
         * integrity evidence. This is still only a local sidecar
         * contract; it is not a platform upload operation.
         */
        const entry =
          publishPackageEntrySchema.parse({
            path:
              'KINAOU/Renders/acceptance_vertical_youtube.publish.json',

            sizeBytes:
              1_024,

            modifiedAt:
              '2026-09-26T12:03:00.000Z',

            sourceAvailable:
              true,

            document: {
              schemaVersion:
                3,

              kind:
                'kinaou-publish-package',

              createdAt:
                '2026-09-26T12:03:00.000Z',

              projectId:
                withDefaults.id,

              platform:
                'youtube',

              placement:
                'youtube-short',

              delivery: {
                checkedAt:
                  preflight.checkedAt,

                ready:
                  true,

                preferredFormat:
                  'vertical'
              },

              title:
                'Reviewed Short',

              description:
                'Ready for handoff.',

              tags: [
                'KINAOU',
                'local'
              ],

              media:
                receipt,

              integrity: {
                checkedAt:
                  preflight.checkedAt,

                actual:
                  preflight.actual,

                sha256:
                  digest
              }
            }
          })

        expect(
          entry.document.schemaVersion
        ).toBe(
          3
        )

        if (
          entry.document.schemaVersion !== 3
        ) {
          throw new Error(
            'Expected V3 publish package'
          )
        }

        expect(
          entry.document.placement
        ).toBe(
          'youtube-short'
        )

        expect(
          entry.document.delivery
        ).toEqual({
          checkedAt:
            preflight.checkedAt,

          ready:
            true,

          preferredFormat:
            'vertical'
        })


        /*
         * A later local integrity check can prove the MP4 remains
         * exactly the file that was reviewed.
         */
        const integrity =
          publishIntegrityResultSchema.parse({
            schemaVersion:
              1,

            packagePath:
              entry.path,

            sourcePath:
              receipt.outputRelativePath,

            checkedAt:
              '2026-09-26T12:04:00.000Z',

            status:
              'unchanged',

            expectedSha256:
              digest,

            actualSha256:
              digest,

            sizeBytes:
              4_096
          })

        expect(
          integrity.status
        ).toBe(
          'unchanged'
        )


        /*
         * Persistence round-trip keeps the deliberate default placement.
         */
        const reopened =
          parseProject(
            JSON.parse(
              JSON.stringify(
                withDefaults
              )
            )
          )

        const reopenedDefaults =
          projectPublishDefaults(
            reopened
          )

        expect(
          reopenedDefaults?.schemaVersion
        ).toBe(
          2
        )

        if (
          !reopenedDefaults
          || reopenedDefaults.schemaVersion !== 2
        ) {
          throw new Error(
            'Expected persisted V2 defaults'
          )
        }

        expect(
          reopenedDefaults.placement
        ).toBe(
          'youtube-video'
        )


        /*
         * Wrong platform/placement pairs are rejected before handoff.
         */
        expect(
          () =>
            buildPublishPackageRequest(
              withDefaults,
              receipt,
              {
                platform:
                  'instagram',

                placement:
                  'youtube-short',

                title:
                  'Mismatch',

                description:
                  '',

                tags:
                  ''
              }
            )
        ).toThrow(
          /does not belong/
        )


        /*
         * The acceptance path produced only validated data contracts.
         * There is deliberately no automatic platform upload state.
         */
        expect(
          'publishUrl'
          in entry.document
        ).toBe(
          false
        )

        expect(
          'remoteId'
          in entry.document
        ).toBe(
          false
        )

        expect(
          'publishedAt'
          in entry.document
        ).toBe(
          false
        )
      }
    )
  }
)
