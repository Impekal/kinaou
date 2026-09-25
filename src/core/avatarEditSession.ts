import {
  registerAvatarGeneratedTake
} from './avatarGeneration'

import {
  flux2KleinAvatarEngine
} from './avatarFlux2Klein'

import {
  parseAvatarEditJob,
  registerGeneratedAvatarImage,
  type AvatarEditJobParameters,
  type AvatarEditJobRecord
} from './avatarJobs'

import {
  activeAcceptedAvatarReferencePack
} from './avatarReferencePack'

import type {
  AvatarIdentity,
  AvatarInstance,
  AvatarVersion,
  KinaouAsset,
  KinaouProject
} from './project'

export interface AvatarEditTarget {
  avatarId: string
  versionId: string
  instanceId?: string
}

export type AvatarEditEligibilityReason =
  | 'ready'
  | 'target-unavailable'
  | 'image-reference-required'
  | 'unsupported-directions'

export interface PreparedAvatarEdit {
  target: AvatarEditTarget
  parameters: AvatarEditJobParameters
  referenceAssetIds: string[]
  referencePackId?: string
}

function avatarById(
  project: KinaouProject,
  avatarId: string
): AvatarIdentity {
  const avatar =
    project.avatars.find(
      entry =>
        entry.id === avatarId
    )

  if (!avatar) {
    throw new Error(
      'Avatar identity not found'
    )
  }

  return avatar
}

function versionById(
  avatar: AvatarIdentity,
  versionId: string
): AvatarVersion {
  const version =
    avatar.versions.find(
      entry =>
        entry.id === versionId
    )

  if (!version) {
    throw new Error(
      'Avatar version not found'
    )
  }

  return version
}

function instanceById(
  project: KinaouProject,
  target: AvatarEditTarget
): AvatarInstance | undefined {
  if (!target.instanceId) {
    return undefined
  }

  const instance =
    project.avatarInstances.find(
      entry =>
        entry.id ===
        target.instanceId
    )

  if (
    !instance
    || instance.avatarId
      !== target.avatarId
    || instance.versionId
      !== target.versionId
  ) {
    throw new Error(
      'Avatar scene instance does not match the selected identity version'
    )
  }

  return instance
}

function usableImageAsset(
  project: KinaouProject,
  assetId: string
): KinaouAsset {
  const asset =
    project.assets.find(
      entry =>
        entry.id === assetId
    )

  if (
    !asset
    || asset.kind !== 'image'
    || !asset.managed
    || asset.offline
    || !asset.uri.startsWith(
      'KINAOU/Assets/'
    )
    || !/\.(png|jpe?g|webp)$/i
      .test(asset.uri)
  ) {
    throw new Error(
      'Avatar identity edit requires an available managed image reference'
    )
  }

  return asset
}

function singleReferenceForVersion(
  project: KinaouProject,
  avatar: AvatarIdentity,
  version: AvatarVersion
): KinaouAsset {
  if (
    version.parentVersionId
  ) {
    const parent =
      versionById(
        avatar,
        version.parentVersionId
      )

    if (
      parent.outputAssetId
    ) {
      try {
        return usableImageAsset(
          project,
          parent.outputAssetId
        )
      } catch {
        // Fall through to the original
        // authorized source.
      }
    }
  }

  if (
    version.source.kind !== 'image'
    || version.source.assetIds.length
      !== 1
  ) {
    throw new Error(
      'The accepted FLUX.2 Avatar engine requires either one image-based identity source or an active accepted Reference Pack'
    )
  }

  return usableImageAsset(
    project,
    version.source.assetIds[0]
  )
}

function referenceSelection(
  project: KinaouProject,
  avatar: AvatarIdentity,
  version: AvatarVersion
): {
  assets: KinaouAsset[]
  referencePackId?: string
} {
  const pack =
    activeAcceptedAvatarReferencePack(
      project,
      avatar.id
    )

  if (pack) {
    return {
      assets:
        pack.assetIds.map(
          assetId =>
            usableImageAsset(
              project,
              assetId
            )
        ),
      referencePackId:
        pack.id
    }
  }

  return {
    assets: [
      singleReferenceForVersion(
        project,
        avatar,
        version
      )
    ]
  }
}

function normalized(
  value: string
): string {
  return value.trim()
}

function editPrompt(
  version: AvatarVersion,
  referenceCount: number,
  instance?: AvatarInstance
): string {
  if (
    instance
    && (
      normalized(
        instance.motionPrompt
      )
      || normalized(
        instance.expressionPrompt
      )
    )
  ) {
    throw new Error(
      'The accepted still-image Avatar engine does not yet support motion or expression-performance directions'
    )
  }

  const requests: string[] = []

  if (
    normalized(
      version.editInstruction
    )
  ) {
    requests.push(
      `Requested avatar edit: ${normalized(version.editInstruction)}`
    )
  }

  if (
    normalized(
      instance?.prompt ?? ''
    )
  ) {
    requests.push(
      `Scene request: ${normalized(instance?.prompt ?? '')}`
    )
  }

  if (
    normalized(
      instance
        ?.environmentPrompt
        ?? ''
    )
  ) {
    requests.push(
      `Environment: ${normalized(instance?.environmentPrompt ?? '')}`
    )
  }

  if (!requests.length) {
    requests.push(
      'Create a new natural photographic take while keeping the person unchanged.'
    )
  }

  const identityContext =
    normalized(
      version.prompt
    )

  const referenceInstruction =
    referenceCount > 1
      ? 'All reference images depict one and the same adult person. Treat them as multiple approved views of one identity, never as multiple people.'
      : 'Use the reference image as the identity master.'

  const parts = [
    referenceInstruction,
    'Preserve the exact same adult person and keep identity locked: facial proportions, skull and face geometry, eyes and eye color, eyebrows, nose, lips, ears, hairline, skin tone, beard or facial-hair pattern, and apparent age must remain the same person.',
    'Do not redesign, replace, beautify into a different person, average the references into a new face, or drift the identity.',
    ...(
      identityContext
        ? [
            `Existing avatar description: ${identityContext}`
          ]
        : []
    ),
    ...requests,
    'Produce a natural photorealistic professional image.'
  ]

  const result =
    parts.join(' ')

  if (
    result.length > 20_000
  ) {
    throw new Error(
      'Avatar edit prompt exceeds the supported length'
    )
  }

  return result
}

export function avatarEditEligibility(
  project: KinaouProject,
  target: AvatarEditTarget
): {
  ready: boolean
  reason: AvatarEditEligibilityReason
} {
  try {
    const avatar =
      avatarById(
        project,
        target.avatarId
      )

    const version =
      versionById(
        avatar,
        target.versionId
      )

    const instance =
      instanceById(
        project,
        target
      )

    referenceSelection(
      project,
      avatar,
      version
    )

    if (
      instance
      && (
        normalized(
          instance.motionPrompt
        )
        || normalized(
          instance.expressionPrompt
        )
      )
    ) {
      return {
        ready: false,
        reason:
          'unsupported-directions'
      }
    }

    return {
      ready: true,
      reason: 'ready'
    }
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : String(error)

    if (
      /image-based identity source|managed image reference|Reference Pack/i
        .test(message)
    ) {
      return {
        ready: false,
        reason:
          'image-reference-required'
      }
    }

    return {
      ready: false,
      reason:
        'target-unavailable'
    }
  }
}

export function prepareAvatarEdit(
  project: KinaouProject,
  target: AvatarEditTarget,
  seed: number
): PreparedAvatarEdit {
  if (
    !Number.isSafeInteger(seed)
    || seed < 0
  ) {
    throw new Error(
      'Avatar edit seed must be a non-negative safe integer'
    )
  }

  const avatar =
    avatarById(
      project,
      target.avatarId
    )

  const version =
    versionById(
      avatar,
      target.versionId
    )

  const instance =
    instanceById(
      project,
      target
    )

  const references =
    referenceSelection(
      project,
      avatar,
      version
    )

  const prompt =
    editPrompt(
      version,
      references.assets.length,
      instance
    )

  return {
    target: {
      ...target
    },
    parameters: {
      prompt,
      seed,
      referencePaths:
        references.assets.map(
          asset =>
            asset.uri
        )
    },
    referenceAssetIds:
      references.assets.map(
        asset =>
          asset.id
      ),
    ...(references.referencePackId
      ? {
          referencePackId:
            references.referencePackId
        }
      : {})
  }
}

export function completeAvatarEdit(
  project: KinaouProject,
  prepared: PreparedAvatarEdit,
  jobValue: AvatarEditJobRecord,
  now = new Date()
) {
  const job =
    parseAvatarEditJob(
      jobValue
    )

  if (
    job.state !== 'succeeded'
  ) {
    throw new Error(
      'Successful Avatar edit job required'
    )
  }

  const sameReferences =
    job.provenance
      .referencePaths.length
      === prepared.parameters
        .referencePaths.length
    && job.provenance
      .referencePaths.every(
        (
          value,
          index
        ) =>
          value ===
          prepared.parameters
            .referencePaths[
              index
            ]
      )

  if (
    job.provenance.seed
      !== prepared.parameters.seed
    || job.provenance.prompt
      !== prepared.parameters.prompt
    || !sameReferences
  ) {
    throw new Error(
      'Avatar edit result does not match the submitted generation'
    )
  }

  const generated =
    registerGeneratedAvatarImage(
      project,
      job
    )

  const registered =
    registerAvatarGeneratedTake(
      generated.project,
      {
        avatarId:
          prepared.target.avatarId,
        versionId:
          prepared.target.versionId,
        ...(prepared.target
          .instanceId
          ? {
              instanceId:
                prepared.target
                  .instanceId
            }
          : {}),
        outputAssetId:
          generated.asset.id,
        jobId:
          job.id,
        seed:
          job.provenance.seed,
        prompt:
          job.provenance.prompt,
        engine:
          flux2KleinAvatarEngine(
            now.toISOString()
          ),
        sourceAssetIds:
          prepared.referenceAssetIds,
        ...(prepared.referencePackId
          ? {
              referencePackId:
                prepared.referencePackId
            }
          : {})
      },
      now
    )

  return {
    project:
      registered.project,
    asset:
      generated.asset,
    receipt:
      registered.receipt
  }
}
