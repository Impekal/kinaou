import {
  z
} from 'zod'

import {
  managedPublishPathSchema,
  publishIntegrityResultSchema,
  publishPackageEntrySchema,
  type PublishIntegrityResult,
  type PublishPackageEntry
} from './publishPackage'

import {
  publishPlacementSchema
} from './publishProfiles'

import {
  managedRenderPathSchema
} from './exportHistory'


export const remotePublishPlatformSchema =
  z.enum([
    'youtube',
    'instagram',
    'tiktok'
  ])


export type RemotePublishPlatform =
  z.infer<
    typeof remotePublishPlatformSchema
  >


const sha256Schema =
  z.string()
    .regex(
      /^[a-f0-9]{64}$/
    )


const publishMetadataSchema =
  z.object({
    title:
      z.string()
        .trim()
        .min(1)
        .max(200),

    description:
      z.string()
        .trim()
        .max(5000),

    tags:
      z.array(
        z.string()
          .trim()
          .min(1)
          .max(80)
      )
        .max(30)
        .refine(
          tags =>
            new Set(
              tags.map(
                tag =>
                  tag.toLocaleLowerCase()
              )
            ).size
            === tags.length,
          'Publish tags must be unique'
        )
  })
    .strict()


export const platformPublishDraftSchema =
  z.object({
    schemaVersion:
      z.literal(1),

    projectId:
      z.string()
        .trim()
        .min(1)
        .max(200),

    packagePath:
      managedPublishPathSchema,

    platform:
      remotePublishPlatformSchema,

    placement:
      publishPlacementSchema,

    media:
      z.object({
        path:
          managedRenderPathSchema,

        sizeBytes:
          z.number()
            .int()
            .positive(),

        sha256:
          sha256Schema
      })
        .strict(),

    metadata:
      publishMetadataSchema,

    verifiedAt:
      z.string()
        .datetime()
  })
    .strict()
    .superRefine(
      (
        draft,
        context
      ) => {
        if (
          draft.placement
            === 'generic'
        ) {
          context.addIssue({
            code:
              'custom',

            path: [
              'placement'
            ],

            message:
              'Generic handoff cannot be submitted to a remote publishing adapter'
          })
        }

        const placementPlatform =
          draft.placement
            .startsWith(
              'youtube-'
            )
            ? 'youtube'
            : draft.placement
                .startsWith(
                  'instagram-'
                )
              ? 'instagram'
              : draft.placement
                  .startsWith(
                    'tiktok-'
                  )
                ? 'tiktok'
                : null

        if (
          placementPlatform
          !== draft.platform
        ) {
          context.addIssue({
            code:
              'custom',

            path: [
              'placement'
            ],

            message:
              'Remote publish placement does not belong to its platform'
          })
        }
      }
    )


export type PlatformPublishDraft =
  z.infer<
    typeof platformPublishDraftSchema
  >


export const explicitPublishApprovalSchema =
  z.object({
    kind:
      z.literal(
        'explicit-human'
      ),

    confirmedAt:
      z.string()
        .datetime()
  })
    .strict()


export const platformPublishRequestSchema =
  platformPublishDraftSchema
    .extend({
      requestId:
        z.string()
          .uuid(),

      approval:
        explicitPublishApprovalSchema
    })
    .strict()


export type PlatformPublishRequest =
  z.infer<
    typeof platformPublishRequestSchema
  >


export const platformPublisherDescriptorSchema =
  z.object({
    adapterId:
      z.string()
        .trim()
        .min(1)
        .max(120),

    adapterVersion:
      z.string()
        .trim()
        .min(1)
        .max(120),

    platform:
      remotePublishPlatformSchema,

    placements:
      z.array(
        publishPlacementSchema
      )
        .min(1)
        .max(8)
        .refine(
          placements =>
            new Set(
              placements
            ).size
            === placements.length,
          'Publisher placements must be unique'
        ),

    network:
      z.literal(
        'remote-api'
      ),

    credentials:
      z.literal(
        'external-only'
      )
  })
    .strict()


export type PlatformPublisherDescriptor =
  z.infer<
    typeof platformPublisherDescriptorSchema
  >


export const platformPublishReceiptSchema =
  z.object({
    schemaVersion:
      z.literal(1),

    receiptId:
      z.string()
        .uuid(),

    requestId:
      z.string()
        .uuid(),

    attemptId:
      z.string()
        .uuid(),

    platform:
      remotePublishPlatformSchema,

    placement:
      publishPlacementSchema,

    adapter:
      z.object({
        id:
          z.string()
            .trim()
            .min(1)
            .max(120),

        version:
          z.string()
            .trim()
            .min(1)
            .max(120)
      })
        .strict(),

    sourceSha256:
      sha256Schema,

    remote:
      z.object({
        id:
          z.string()
            .trim()
            .min(1)
            .max(500),

        url:
          z.string()
            .url()
            .max(2000)
            .optional()
      })
        .strict(),

    publishedAt:
      z.string()
        .datetime()
  })
    .strict()


export type PlatformPublishReceipt =
  z.infer<
    typeof platformPublishReceiptSchema
  >


export const platformPublishAttemptSchema =
  z.object({
    schemaVersion:
      z.literal(1),

    id:
      z.string()
        .uuid(),

    request:
      platformPublishRequestSchema,

    state:
      z.enum([
        'confirmed',
        'submitting',
        'succeeded',
        'failed',
        'cancelled'
      ]),

    createdAt:
      z.string()
        .datetime(),

    updatedAt:
      z.string()
        .datetime(),

    submittedAt:
      z.string()
        .datetime()
        .optional(),

    receipt:
      platformPublishReceiptSchema
        .optional(),

    error:
      z.string()
        .trim()
        .min(1)
        .max(4000)
        .optional()
  })
    .strict()
    .superRefine(
      (
        attempt,
        context
      ) => {
        if (
          attempt.state
            === 'confirmed'
        ) {
          if (
            attempt.submittedAt
            || attempt.receipt
            || attempt.error
          ) {
            context.addIssue({
              code:
                'custom',

              message:
                'Confirmed publish attempt cannot already contain submission outcome data'
            })
          }
        }

        if (
          attempt.state
            === 'submitting'
          && !attempt.submittedAt
        ) {
          context.addIssue({
            code:
              'custom',

            path: [
              'submittedAt'
            ],

            message:
              'Submitting publish attempt requires submittedAt'
          })
        }

        if (
          attempt.state
            === 'succeeded'
        ) {
          if (
            !attempt.submittedAt
            || !attempt.receipt
            || attempt.error
          ) {
            context.addIssue({
              code:
                'custom',

              message:
                'Succeeded publish attempt requires submission and receipt without an error'
            })
          }
        }

        if (
          attempt.state
            === 'failed'
        ) {
          if (
            !attempt.submittedAt
            || !attempt.error
            || attempt.receipt
          ) {
            context.addIssue({
              code:
                'custom',

              message:
                'Failed publish attempt requires submission and error without a receipt'
            })
          }
        }

        if (
          attempt.state
            === 'cancelled'
          && attempt.receipt
        ) {
          context.addIssue({
            code:
              'custom',

            message:
              'Cancelled publish attempt cannot contain a success receipt'
          })
        }
      }
    )


export type PlatformPublishAttempt =
  z.infer<
    typeof platformPublishAttemptSchema
  >


export interface PlatformPublisherAdapter {
  descriptor:
    PlatformPublisherDescriptor

  publish(
    request:
      PlatformPublishRequest,

    signal:
      AbortSignal
  ):
    Promise<
      PlatformPublishReceipt
    >
}


function requireFreshPackageIntegrity(
  entry:
    PublishPackageEntry,

  integrity:
    PublishIntegrityResult
): {
  entry:
    PublishPackageEntry

  document:
    Extract<
      PublishPackageEntry['document'],
      {
        schemaVersion: 3
      }
    >

  integrity:
    PublishIntegrityResult
} {
  const parsedEntry =
    publishPackageEntrySchema
      .parse(
        entry
      )

  const parsedIntegrity =
    publishIntegrityResultSchema
      .parse(
        integrity
      )

  if (
    parsedEntry.document
      .schemaVersion !== 3
  ) {
    throw new Error(
      'Remote publishing requires a V3 publish package with explicit placement review'
    )
  }

  if (
    !parsedEntry
      .sourceAvailable
  ) {
    throw new Error(
      'Remote publishing requires the reviewed source MP4 to be available'
    )
  }

  if (
    parsedIntegrity.status
      !== 'unchanged'
  ) {
    throw new Error(
      'Remote publishing requires a fresh unchanged integrity verification'
    )
  }

  if (
    parsedIntegrity.packagePath
      !== parsedEntry.path
    || parsedIntegrity.sourcePath
      !== parsedEntry.document
        .media.outputRelativePath
  ) {
    throw new Error(
      'Integrity verification does not belong to the selected publish package'
    )
  }

  if (
    parsedIntegrity
      .expectedSha256
      !== parsedEntry.document
        .integrity.sha256
    || parsedIntegrity
      .actualSha256
      !== parsedEntry.document
        .integrity.sha256
  ) {
    throw new Error(
      'Verified source digest does not match the publish package'
    )
  }

  if (
    parsedIntegrity.sizeBytes
      !== parsedEntry.document
        .media.sizeBytes
  ) {
    throw new Error(
      'Verified source size does not match the publish package'
    )
  }

  return {
    entry:
      parsedEntry,

    document:
      parsedEntry.document,

    integrity:
      parsedIntegrity
  }
}


export function preparePlatformPublishDraft(
  entry:
    PublishPackageEntry,

  integrity:
    PublishIntegrityResult
): PlatformPublishDraft {
  const verified =
    requireFreshPackageIntegrity(
      entry,
      integrity
    )

  const document =
    verified.document

  if (
    document.platform
      === 'generic'
    || document.placement
      === 'generic'
  ) {
    throw new Error(
      'Generic handoff cannot be submitted to a remote platform'
    )
  }

  return platformPublishDraftSchema
    .parse({
      schemaVersion:
        1,

      projectId:
        document.projectId,

      packagePath:
        verified.entry.path,

      platform:
        document.platform,

      placement:
        document.placement,

      media: {
        path:
          document.media
            .outputRelativePath,

        sizeBytes:
          document.media
            .sizeBytes,

        sha256:
          document.integrity
            .sha256
      },

      metadata: {
        title:
          document.title,

        description:
          document.description,

        tags:
          document.tags
      },

      verifiedAt:
        verified.integrity
          .checkedAt
    })
}


export function confirmPlatformPublishDraft(
  draft:
    PlatformPublishDraft,

  now =
    new Date(),

  requestId =
    crypto.randomUUID()
): PlatformPublishRequest {
  const normalized =
    platformPublishDraftSchema
      .parse(
        draft
      )

  return platformPublishRequestSchema
    .parse({
      ...normalized,

      requestId,

      approval: {
        kind:
          'explicit-human',

        confirmedAt:
          now.toISOString()
      }
    })
}


export function createPlatformPublishAttempt(
  request:
    PlatformPublishRequest,

  now =
    new Date(),

  id =
    crypto.randomUUID()
): PlatformPublishAttempt {
  const normalized =
    platformPublishRequestSchema
      .parse(
        request
      )

  const timestamp =
    now.toISOString()

  return platformPublishAttemptSchema
    .parse({
      schemaVersion:
        1,

      id,

      request:
        normalized,

      state:
        'confirmed',

      createdAt:
        timestamp,

      updatedAt:
        timestamp
    })
}


export function beginPlatformPublishAttempt(
  attempt:
    PlatformPublishAttempt,

  now =
    new Date()
): PlatformPublishAttempt {
  const normalized =
    platformPublishAttemptSchema
      .parse(
        attempt
      )

  if (
    normalized.state
    !== 'confirmed'
  ) {
    throw new Error(
      'Only a confirmed publish attempt can be submitted'
    )
  }

  const timestamp =
    now.toISOString()

  return platformPublishAttemptSchema
    .parse({
      ...normalized,

      state:
        'submitting',

      submittedAt:
        timestamp,

      updatedAt:
        timestamp
    })
}


export function succeedPlatformPublishAttempt(
  attempt:
    PlatformPublishAttempt,

  receipt:
    PlatformPublishReceipt,

  now =
    new Date()
): PlatformPublishAttempt {
  const normalized =
    platformPublishAttemptSchema
      .parse(
        attempt
      )

  if (
    normalized.state
    !== 'submitting'
  ) {
    throw new Error(
      'Only a submitting publish attempt can succeed'
    )
  }

  const parsedReceipt =
    platformPublishReceiptSchema
      .parse(
        receipt
      )

  if (
    parsedReceipt.attemptId
      !== normalized.id
    || parsedReceipt.requestId
      !== normalized.request
        .requestId
    || parsedReceipt.platform
      !== normalized.request
        .platform
    || parsedReceipt.placement
      !== normalized.request
        .placement
    || parsedReceipt.sourceSha256
      !== normalized.request
        .media.sha256
  ) {
    throw new Error(
      'Publish receipt does not match the submitted attempt'
    )
  }

  return platformPublishAttemptSchema
    .parse({
      ...normalized,

      state:
        'succeeded',

      receipt:
        parsedReceipt,

      updatedAt:
        now.toISOString()
    })
}


export function failPlatformPublishAttempt(
  attempt:
    PlatformPublishAttempt,

  error:
    string,

  now =
    new Date()
): PlatformPublishAttempt {
  const normalized =
    platformPublishAttemptSchema
      .parse(
        attempt
      )

  if (
    normalized.state
    !== 'submitting'
  ) {
    throw new Error(
      'Only a submitting publish attempt can fail'
    )
  }

  const message =
    error.trim()

  if (!message) {
    throw new Error(
      'Publish failure message is required'
    )
  }

  return platformPublishAttemptSchema
    .parse({
      ...normalized,

      state:
        'failed',

      error:
        message,

      updatedAt:
        now.toISOString()
    })
}


export function cancelPlatformPublishAttempt(
  attempt:
    PlatformPublishAttempt,

  now =
    new Date()
): PlatformPublishAttempt {
  const normalized =
    platformPublishAttemptSchema
      .parse(
        attempt
      )

  if (
    ![
      'confirmed',
      'submitting'
    ].includes(
      normalized.state
    )
  ) {
    throw new Error(
      'Only an uncompleted publish attempt can be cancelled'
    )
  }

  return platformPublishAttemptSchema
    .parse({
      ...normalized,

      state:
        'cancelled',

      updatedAt:
        now.toISOString()
    })
}
