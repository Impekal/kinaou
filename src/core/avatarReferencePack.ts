import {
  avatarReferenceAssetAvailable
} from './avatarStudio'

import {
  parseProject,
  touchProject,
  type AvatarIdentity,
  type AvatarReferencePack,
  type KinaouAsset,
  type KinaouProject
} from './project'

export const FLUX2_KLEIN_REFERENCE_PACK_PROFILE =
  'flux2-klein-pack3-v1'

export const FLUX2_KLEIN_REFERENCE_PACK_SIZE =
  3

export interface CreateAcceptedAvatarReferencePackInput {
  avatarId: string
  assetIds: string[]
  label?: string
  acceptanceConfirmed: boolean
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

function replaceAvatar(
  project: KinaouProject,
  avatar: AvatarIdentity,
  now = new Date()
): KinaouProject {
  return parseProject(
    touchProject(
      {
        ...project,
        avatars:
          project.avatars.map(
            entry =>
              entry.id ===
                avatar.id
                ? avatar
                : entry
          )
      },
      now
    )
  )
}

function sameOrder(
  a: string[],
  b: string[]
): boolean {
  return (
    a.length === b.length
    && a.every(
      (
        value,
        index
      ) =>
        value === b[index]
    )
  )
}

function usableImage(
  asset:
    KinaouAsset
    | undefined
): asset is KinaouAsset {
  return Boolean(
    asset
    && asset.kind === 'image'
    && avatarReferenceAssetAvailable(
      asset
    )
    && /\.(png|jpe?g|webp)$/i
      .test(asset.uri)
  )
}

export function avatarReferencePackCandidateAssets(
  project: KinaouProject,
  avatarId: string
): KinaouAsset[] {
  const avatar =
    avatarById(
      project,
      avatarId
    )

  const ids: string[] = []

  for (
    const version
    of avatar.versions
  ) {
    ids.push(
      ...version.source.assetIds
    )

    if (
      version.outputAssetId
    ) {
      ids.push(
        version.outputAssetId
      )
    }
  }

  for (
    const receipt
    of project
      .avatarCreationReceipts
  ) {
    if (
      receipt.avatarId
        === avatar.id
    ) {
      ids.push(
        receipt.outputAssetId
      )
    }
  }

  return Array.from(
    new Set(ids)
  )
    .map(
      id =>
        project.assets.find(
          asset =>
            asset.id === id
        )
    )
    .filter(
      usableImage
    )
}

export function activeAcceptedAvatarReferencePack(
  project: KinaouProject,
  avatarId: string
): AvatarReferencePack | undefined {
  const avatar =
    avatarById(
      project,
      avatarId
    )

  if (
    !avatar.activeReferencePackId
  ) {
    return undefined
  }

  const pack =
    avatar.referencePacks.find(
      entry =>
        entry.id ===
        avatar.activeReferencePackId
    )

  if (!pack) {
    throw new Error(
      'Active Avatar Reference Pack not found'
    )
  }

  if (
    pack.profileId
      !== FLUX2_KLEIN_REFERENCE_PACK_PROFILE
    || pack.acceptance.status
      !== 'human-accepted'
    || pack.assetIds.length
      !== FLUX2_KLEIN_REFERENCE_PACK_SIZE
    || new Set(
      pack.assetIds
    ).size
      !== FLUX2_KLEIN_REFERENCE_PACK_SIZE
  ) {
    throw new Error(
      'Active Avatar Reference Pack does not match the accepted FLUX.2 quality profile'
    )
  }

  const candidates =
    new Set(
      avatarReferencePackCandidateAssets(
        project,
        avatarId
      ).map(
        asset =>
          asset.id
      )
    )

  for (
    const assetId
    of pack.assetIds
  ) {
    if (
      !candidates.has(
        assetId
      )
    ) {
      throw new Error(
        'Active Avatar Reference Pack contains an unavailable or unrelated image'
      )
    }
  }

  return pack
}

export function createAcceptedAvatarReferencePack(
  project: KinaouProject,
  input:
    CreateAcceptedAvatarReferencePackInput,
  now = new Date()
): {
  project: KinaouProject
  avatar: AvatarIdentity
  pack: AvatarReferencePack
} {
  const avatar =
    avatarById(
      project,
      input.avatarId
    )

  if (
    input.acceptanceConfirmed
      !== true
  ) {
    throw new Error(
      'Human identity acceptance must be explicitly confirmed'
    )
  }

  const assetIds =
    [...input.assetIds]

  if (
    assetIds.length
      !== FLUX2_KLEIN_REFERENCE_PACK_SIZE
    || new Set(
      assetIds
    ).size
      !== FLUX2_KLEIN_REFERENCE_PACK_SIZE
  ) {
    throw new Error(
      'The accepted FLUX.2 Reference Pack requires exactly three unique images'
    )
  }

  const candidates =
    new Set(
      avatarReferencePackCandidateAssets(
        project,
        avatar.id
      ).map(
        asset =>
          asset.id
      )
    )

  for (
    const assetId
    of assetIds
  ) {
    if (
      !candidates.has(
        assetId
      )
    ) {
      throw new Error(
        'Reference Pack images must belong to the Avatar identity lineage'
      )
    }
  }

  const existing =
    avatar.referencePacks.find(
      pack =>
        pack.profileId
          === FLUX2_KLEIN_REFERENCE_PACK_PROFILE
        && sameOrder(
          pack.assetIds,
          assetIds
        )
    )

  if (existing) {
    const updated: AvatarIdentity = {
      ...avatar,
      activeReferencePackId:
        existing.id,
      updatedAt:
        now.toISOString()
    }

    return {
      project:
        replaceAvatar(
          project,
          updated,
          now
        ),
      avatar:
        updated,
      pack:
        existing
    }
  }

  const pack:
    AvatarReferencePack = {
      id:
        crypto.randomUUID(),
      label:
        input.label
          ?.trim()
        || 'Quality Reference Pack',
      createdAt:
        now.toISOString(),
      profileId:
        FLUX2_KLEIN_REFERENCE_PACK_PROFILE,
      assetIds,
      acceptance: {
        status:
          'human-accepted',
        acceptedAt:
          now.toISOString(),
        note:
          'Explicit human review confirmed that all three images depict the same persistent Avatar identity.'
      }
    }

  const updated: AvatarIdentity = {
    ...avatar,
    updatedAt:
      now.toISOString(),
    referencePacks: [
      ...avatar.referencePacks,
      pack
    ],
    activeReferencePackId:
      pack.id
  }

  return {
    project:
      replaceAvatar(
        project,
        updated,
        now
      ),
    avatar:
      updated,
    pack
  }
}

export function setActiveAvatarReferencePack(
  project: KinaouProject,
  avatarId: string,
  packId: string,
  now = new Date()
): {
  project: KinaouProject
  avatar: AvatarIdentity
  pack: AvatarReferencePack
} {
  const avatar =
    avatarById(
      project,
      avatarId
    )

  const pack =
    avatar.referencePacks.find(
      entry =>
        entry.id === packId
    )

  if (!pack) {
    throw new Error(
      'Avatar Reference Pack not found'
    )
  }

  if (
    pack.profileId
      !== FLUX2_KLEIN_REFERENCE_PACK_PROFILE
    || pack.acceptance.status
      !== 'human-accepted'
    || pack.assetIds.length
      !== FLUX2_KLEIN_REFERENCE_PACK_SIZE
  ) {
    throw new Error(
      'Avatar Reference Pack is not accepted for the FLUX.2 Pack 3 profile'
    )
  }

  const updated: AvatarIdentity = {
    ...avatar,
    updatedAt:
      now.toISOString(),
    activeReferencePackId:
      pack.id
  }

  const next =
    replaceAvatar(
      project,
      updated,
      now
    )

  activeAcceptedAvatarReferencePack(
    next,
    avatar.id
  )

  return {
    project:
      next,
    avatar:
      updated,
    pack
  }
}
