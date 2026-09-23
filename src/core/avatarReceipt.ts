import {
  z
} from 'zod'

import {
  assertSafeManagedPath
} from './storage'

import {
  parseProject,
  touchProject,
  type KinaouProject
} from './project'

const sha256Schema =
  z.string().regex(
    /^[a-f0-9]{64}$/
  )

const managedAssetPathSchema =
  z.string()
    .min(1)
    .max(1000)
    .refine(
      value => {
        try {
          return (
            assertSafeManagedPath(
              value
            ) === value
            && value.startsWith(
              'KINAOU/Assets/'
            )
          )
        } catch {
          return false
        }
      },
      'Expected a canonical managed asset path'
    )

const avatarReceiptPathSchema =
  z.string()
    .min(1)
    .max(1000)
    .refine(
      value => {
        try {
          return (
            assertSafeManagedPath(
              value
            ) === value
            && value.startsWith(
              'KINAOU/Receipts/Avatars/'
            )
            && value.endsWith(
              '.json'
            )
          )
        } catch {
          return false
        }
      },
      'Expected a canonical avatar receipt path'
    )

export const managedFileHashEvidenceSchema =
  z.object({
    id: z.string().min(1),
    path:
      managedAssetPathSchema,
    sizeBytes:
      z.number().int().positive(),
    sha256: sha256Schema
  }).strict()

export const avatarReceiptExportResultSchema =
  z.object({
    schemaVersion:
      z.literal(1),
    receiptId:
      z.string().min(1),
    path:
      avatarReceiptPathSchema,
    createdAt:
      z.string().datetime(),
    sizeBytes:
      z.number().int().positive(),
    documentSha256:
      sha256Schema,
    output:
      managedFileHashEvidenceSchema,
    sources:
      z.array(
        managedFileHashEvidenceSchema
      ).max(32)
  }).strict()

export type ManagedFileHashEvidence =
  z.infer<
    typeof managedFileHashEvidenceSchema
  >

export type AvatarReceiptExportResult =
  z.infer<
    typeof avatarReceiptExportResultSchema
  >

export function applyAvatarReceiptEvidence(
  project: KinaouProject,
  receiptId: string,
  value: AvatarReceiptExportResult,
  now = new Date()
): KinaouProject {
  const result =
    avatarReceiptExportResultSchema
      .parse(value)

  if (
    result.receiptId
      !== receiptId
  ) {
    throw new Error(
      'Avatar receipt evidence does not match the requested receipt'
    )
  }

  const receipt =
    project.avatarCreationReceipts
      .find(
        item =>
          item.id === receiptId
      )

  if (!receipt) {
    throw new Error(
      'Avatar creation receipt not found'
    )
  }

  const output =
    project.assets.find(
      asset =>
        asset.id ===
        receipt.outputAssetId
    )

  if (
    !output
    || result.output.id
      !== output.id
    || result.output.path
      !== output.uri
  ) {
    throw new Error(
      'Avatar receipt output evidence does not match the project asset'
    )
  }

  if (
    result.sources.length
      !== receipt.sourceAssetIds.length
  ) {
    throw new Error(
      'Avatar receipt source evidence is incomplete'
    )
  }

  const byId =
    new Map(
      result.sources.map(
        evidence => [
          evidence.id,
          evidence
        ]
      )
    )

  if (
    byId.size
      !== result.sources.length
  ) {
    throw new Error(
      'Avatar receipt source evidence contains duplicate identities'
    )
  }

  const sourceHashes:
    Record<string, string> = {}

  for (
    const sourceId
    of receipt.sourceAssetIds
  ) {
    const source =
      project.assets.find(
        asset =>
          asset.id === sourceId
      )

    const evidence =
      byId.get(sourceId)

    if (
      !source
      || !evidence
      || evidence.path
        !== source.uri
    ) {
      throw new Error(
        'Avatar receipt source evidence does not match the project lineage'
      )
    }

    sourceHashes[sourceId] =
      evidence.sha256
  }

  const updated = {
    ...receipt,
    sourceHashes,
    outputSha256:
      result.output.sha256,
    metadata: {
      ...receipt.metadata,
      evidenceCapturedAt:
        result.createdAt,
      receiptExportPath:
        result.path,
      receiptFileSha256:
        result.documentSha256,
      outputSizeBytes:
        result.output.sizeBytes
    }
  }

  return parseProject(
    touchProject(
      {
        ...project,
        avatarCreationReceipts:
          project
            .avatarCreationReceipts
            .map(
              item =>
                item.id === receiptId
                  ? updated
                  : item
            )
      },
      now
    )
  )
}
