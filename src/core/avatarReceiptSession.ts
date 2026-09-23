import {
  avatarCreationReceiptDocument
} from './avatarGeneration'

import {
  applyAvatarReceiptEvidence,
  type AvatarReceiptExportResult
} from './avatarReceipt'

import type {
  KinaouProject
} from './project'

export interface AvatarReceiptExporter {
  exportAvatarCreationReceipt(
    document: unknown
  ): Promise<AvatarReceiptExportResult>
}

export async function exportAvatarReceiptEvidence(
  project: KinaouProject,
  receiptId: string,
  client: AvatarReceiptExporter
): Promise<{
  project: KinaouProject
  evidence: AvatarReceiptExportResult
}> {
  const document =
    avatarCreationReceiptDocument(
      project,
      receiptId
    )

  const evidence =
    await client
      .exportAvatarCreationReceipt(
        document
      )

  if (
    evidence.receiptId
      !== receiptId
  ) {
    throw new Error(
      'Avatar receipt worker returned evidence for a different receipt'
    )
  }

  return {
    project:
      applyAvatarReceiptEvidence(
        project,
        receiptId,
        evidence
      ),
    evidence
  }
}
