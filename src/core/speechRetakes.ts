import type { KinaouAsset } from './project'
import type { SpeechJobRecord } from './speechJobs'
import type { SpeechVoiceDescriptor } from './speech'
import type { SpeechDeliveryOptions } from './speechDelivery'

export interface SpeechRetakeContext {
  groupId: string
  index: number
  continuityKey: string
  replacesAssetId?: string
}

interface SpeechContinuityInput {
  adapterId: string
  voiceId: string
  language?: string
  modelId?: string
  referenceAssetId?: string
  tempoFactor?: number
}

function normalizedPart(
  value: unknown
): string {
  return value === undefined
    || value === null
    ? ''
    : String(value)
}

export function speechContinuityKey(
  value: SpeechContinuityInput
): string {
  return JSON.stringify([
    value.adapterId,
    value.voiceId,
    normalizedPart(value.language),
    normalizedPart(value.modelId),
    normalizedPart(value.referenceAssetId),
    normalizedPart(value.tempoFactor)
  ])
}

export function speechContinuityFromJob(
  job: SpeechJobRecord
): string {
  return speechContinuityKey({
    adapterId: job.adapterId,
    voiceId: job.voiceId,
    language: job.language,
    modelId: job.modelId,
    referenceAssetId:
      job.referenceAssetId,
    tempoFactor:
      job.tempoFactor
  })
}

export function speechRetakeContextForNewGroup(
  job: SpeechJobRecord
): SpeechRetakeContext {
  return {
    groupId: crypto.randomUUID(),
    index: 1,
    continuityKey:
      speechContinuityFromJob(job)
  }
}

function metadataString(
  asset: KinaouAsset,
  key: string
): string | undefined {
  const value = asset.metadata[key]

  return typeof value === 'string'
    && value
    ? value
    : undefined
}

function metadataIndex(
  asset: KinaouAsset
): number | undefined {
  const value =
    asset.metadata.speechRetakeIndex

  return Number.isSafeInteger(value)
    && Number(value) > 0
    ? Number(value)
    : undefined
}

export function speechRetakeContextForAsset(
  asset: KinaouAsset,
  assets: KinaouAsset[] = [asset]
): SpeechRetakeContext {
  if (asset.kind !== 'audio') {
    throw new Error(
      'Speech retake source must be audio'
    )
  }

  const groupId = metadataString(
    asset,
    'speechRetakeGroupId'
  )

  const continuityKey = metadataString(
    asset,
    'speechContinuityKey'
  )

  const index = metadataIndex(asset)

  if (
    !groupId
    || !continuityKey
    || !index
  ) {
    throw new Error(
      'Speech asset has no retake lineage'
    )
  }

  const nextIndex =
    Math.max(
      index,
      ...assets
        .filter(
          entry =>
            entry.kind === 'audio'
            && entry.metadata
              .speechRetakeGroupId
              === groupId
        )
        .map(
          entry => {
            const value =
              entry.metadata
                .speechRetakeIndex

            return Number.isSafeInteger(
              value
            )
              && Number(value) > 0
              ? Number(value)
              : 0
          }
        )
    ) + 1

  return {
    groupId,
    index: nextIndex,
    continuityKey,
    replacesAssetId: asset.id
  }
}

export function assertSpeechRetakeRequest(
  asset: KinaouAsset,
  text: string,
  voice: SpeechVoiceDescriptor,
  options: SpeechDeliveryOptions
) {
  if (asset.kind !== 'audio') {
    throw new Error(
      'Speech retake source must be audio'
    )
  }

  if (
    asset.metadata.adapterId
      !== voice.adapterId
    || asset.metadata.voiceId
      !== voice.id
  ) {
    throw new Error(
      'Speech retake must use the same adapter and voice'
    )
  }

  const sourceText =
    typeof asset.metadata.sourceText
      === 'string'
      ? asset.metadata.sourceText.trim()
      : ''

  if (
    !sourceText
    || sourceText !== text.trim()
  ) {
    throw new Error(
      'Speech retake text must match the original take'
    )
  }

  const originalLanguage =
    typeof asset.metadata
      .speechLanguage === 'string'
      ? asset.metadata
          .speechLanguage
      : undefined

  if (
    originalLanguage
    && options.language
      !== originalLanguage
  ) {
    throw new Error(
      'Speech retake language must match the original take'
    )
  }

  const originalModel =
    typeof asset.metadata
      .speechModelId === 'string'
      ? asset.metadata
          .speechModelId
      : undefined

  const originalTempo =
    typeof asset.metadata
      .speechTempoFactor
      === 'number'
      ? asset.metadata
          .speechTempoFactor
      : undefined

  if (
    originalModel
    && typeof asset.metadata
      .speechModelId === 'string'
    && asset.metadata
      .speechModelId !== originalModel
  ) {
    throw new Error(
      'Speech retake model must match the original take'
    )
  }

  if (
    originalTempo !== undefined
    && (
      !Number.isFinite(
        originalTempo
      )
      || originalTempo <= 0
    )
  ) {
    throw new Error(
      'Speech retake tempo metadata is invalid'
    )
  }

  const originalReference =
    typeof asset.metadata
      .speechReferenceAssetId
      === 'string'
      ? asset.metadata
          .speechReferenceAssetId
      : undefined

  if (
    originalReference
    && options.referenceAudio
      ?.assetId
      !== originalReference
  ) {
    throw new Error(
      'Speech retake reference voice must match the original take'
    )
  }
}

export function assertSpeechRetakeContinuity(
  context: SpeechRetakeContext,
  job: SpeechJobRecord
) {
  const actual =
    speechContinuityFromJob(job)

  if (
    actual !== context.continuityKey
  ) {
    throw new Error(
      'Speech retake continuity changed'
    )
  }
}
