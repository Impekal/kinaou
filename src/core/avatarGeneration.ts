import {
  avatarCreationReceiptSchema,
  avatarEngineDescriptorSchema,
  parseProject,
  touchProject,
  type AvatarCreationReceipt,
  type AvatarEngineDescriptor,
  type AvatarIdentity,
  type AvatarInstance,
  type AvatarVersion,
  type KinaouAsset,
  type KinaouProject
} from './project'

export interface RegisterAvatarGeneratedTakeInput {
  avatarId: string
  versionId: string
  instanceId?: string
  outputAssetId: string
  jobId: string
  seed?: number
  prompt?: string
  engine: AvatarEngineDescriptor
  sourceAssetIds?: string[]
  referencePackId?: string
  sourceHashes?: Record<string, string>
  outputSha256?: string
}

function avatarById(
  project: KinaouProject,
  avatarId: string
): AvatarIdentity {
  const avatar =
    project.avatars.find(
      item =>
        item.id === avatarId
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
      item =>
        item.id === versionId
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
  instanceId?: string
): AvatarInstance | undefined {
  if (!instanceId) {
    return undefined
  }

  const instance =
    project.avatarInstances.find(
      item =>
        item.id === instanceId
    )

  if (!instance) {
    throw new Error(
      'Avatar scene instance not found'
    )
  }

  return instance
}

function outputAssetById(
  project: KinaouProject,
  assetId: string
): KinaouAsset {
  const asset =
    project.assets.find(
      item =>
        item.id === assetId
    )

  if (
    !asset
    || !asset.managed
    || asset.offline
    || ![
      'image',
      'video'
    ].includes(asset.kind)
    || asset.metadata.generated
      !== true
  ) {
    throw new Error(
      'Generated managed avatar output is required'
    )
  }

  return asset
}

function requiredIdentityCapability(
  version: AvatarVersion
): 'identity-generation'
  | 'identity-preservation' {
  if (
    version.parentVersionId
    || version.source.kind === 'image'
    || version.source.kind === 'video'
    || version.source.kind === 'multi-reference'
  ) {
    return 'identity-preservation'
  }

  return 'identity-generation'
}

function lineageSourceAssetIds(
  project: KinaouProject,
  avatar: AvatarIdentity,
  version: AvatarVersion
): string[] {
  const values = [
    ...version.source.assetIds
  ]

  if (version.parentVersionId) {
    const parent =
      versionById(
        avatar,
        version.parentVersionId
      )

    if (parent.outputAssetId) {
      values.push(
        parent.outputAssetId
      )
    }
  }

  return Array.from(
    new Set(values)
  ).filter(
    id =>
      project.assets.some(
        asset =>
          asset.id === id
      )
  )
}

function allowedAvatarLineageAssetIds(
  project: KinaouProject,
  avatar: AvatarIdentity
): string[] {
  const values: string[] = []

  for (
    const version
    of avatar.versions
  ) {
    values.push(
      ...version.source.assetIds
    )

    if (
      version.outputAssetId
    ) {
      values.push(
        version.outputAssetId
      )
    }

    if (
      version.previewAssetId
    ) {
      values.push(
        version.previewAssetId
      )
    }
  }

  for (
    const pack
    of avatar.referencePacks
  ) {
    values.push(
      ...pack.assetIds
    )
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
      values.push(
        receipt.outputAssetId
      )
    }
  }

  return Array.from(
    new Set(values)
  ).filter(
    id =>
      project.assets.some(
        asset =>
          asset.id === id
      )
  )
}

export function assertAvatarEngineRights(
  engineValue: AvatarEngineDescriptor,
  commercialOutputIntended: boolean
): AvatarEngineDescriptor {
  const engine =
    avatarEngineDescriptorSchema.parse(
      engineValue
    )

  if (
    commercialOutputIntended
    && engine.rights
      .commercialOutput !== 'allowed'
  ) {
    throw new Error(
      'Avatar engine does not have verified commercial-output permission'
    )
  }

  return engine
}

export function registerAvatarGeneratedTake(
  project: KinaouProject,
  input: RegisterAvatarGeneratedTakeInput,
  now = new Date()
): {
  project: KinaouProject
  receipt: AvatarCreationReceipt
  asset: KinaouAsset
} {
  const avatar =
    avatarById(
      project,
      input.avatarId
    )

  const version =
    versionById(
      avatar,
      input.versionId
    )

  const instance =
    instanceById(
      project,
      input.instanceId
    )

  if (
    instance
    && (
      instance.avatarId
        !== avatar.id
      || instance.versionId
        !== version.id
    )
  ) {
    throw new Error(
      'Avatar scene instance does not match the selected identity version'
    )
  }

  const asset =
    outputAssetById(
      project,
      input.outputAssetId
    )

  const engine =
    assertAvatarEngineRights(
      input.engine,
      version.source.rights
        .commercialUseIntended
    )

  const identityCapability =
    requiredIdentityCapability(
      version
    )

  if (
    !engine.capabilities.includes(
      identityCapability
    )
  ) {
    throw new Error(
      `Avatar engine must provide ${identityCapability}`
    )
  }

  if (
    version.editInstruction
    && !engine.capabilities.includes(
      'targeted-edit'
    )
  ) {
    throw new Error(
      'Edited avatar versions require targeted-edit capability'
    )
  }

  if (
    asset.kind === 'image'
    && !engine.capabilities.includes(
      'scene-image'
    )
  ) {
    throw new Error(
      'Avatar engine does not declare image output'
    )
  }

  if (
    asset.kind === 'video'
    && !engine.capabilities.includes(
      'scene-video'
    )
  ) {
    throw new Error(
      'Avatar engine does not declare video output'
    )
  }

  const defaultSourceAssetIds =
    lineageSourceAssetIds(
      project,
      avatar,
      version
    )

  const allowedSourceAssetIds =
    new Set(
      allowedAvatarLineageAssetIds(
        project,
        avatar
      )
    )

  const sourceAssetIds =
    input.sourceAssetIds
      ? [...input.sourceAssetIds]
      : defaultSourceAssetIds

  const explicitSourceAssetIds =
    input.sourceAssetIds
      !== undefined

  if (
    (
      explicitSourceAssetIds
      && sourceAssetIds.length
        === 0
    )
    || sourceAssetIds.length > 12
    || new Set(
      sourceAssetIds
    ).size
      !== sourceAssetIds.length
  ) {
    throw new Error(
      'Explicit Avatar generation sources must contain 1–12 unique identity-lineage assets'
    )
  }

  for (
    const assetId
    of sourceAssetIds
  ) {
    if (
      !allowedSourceAssetIds.has(
        assetId
      )
    ) {
      throw new Error(
        'Avatar generation source does not belong to the identity lineage'
      )
    }
  }

  if (
    sourceAssetIds.length > 1
    && !engine.capabilities
      .includes(
        'multi-reference'
      )
  ) {
    throw new Error(
      'Avatar engine does not declare multi-reference identity preservation'
    )
  }

  const referencePack =
    input.referencePackId
      ? avatar.referencePacks.find(
          pack =>
            pack.id ===
            input.referencePackId
        )
      : undefined

  if (
    input.referencePackId
    && (
      !referencePack
      || avatar.activeReferencePackId
        !== referencePack.id
      || referencePack.assetIds.length
        !== sourceAssetIds.length
      || !referencePack.assetIds.every(
        (
          assetId,
          index
        ) =>
          assetId
            === sourceAssetIds[
              index
            ]
      )
    )
  ) {
    throw new Error(
      'Avatar Reference Pack does not match the generated take sources'
    )
  }

  const sourceHashes = {
    ...(input.sourceHashes ?? {})
  }

  for (
    const assetId
    of Object.keys(sourceHashes)
  ) {
    if (
      !sourceAssetIds.includes(
        assetId
      )
    ) {
      throw new Error(
        'Avatar source hash does not belong to the identity lineage'
      )
    }
  }

  const existing =
    project.avatarCreationReceipts
      .find(
        receipt =>
          receipt.outputAssetId
            === asset.id
      )

  if (existing) {
    if (
      existing.avatarId
        !== avatar.id
      || existing.versionId
        !== version.id
    ) {
      throw new Error(
        'Generated output already belongs to a different avatar lineage'
      )
    }

    return {
      project,
      receipt: existing,
      asset
    }
  }

  const receipt =
    avatarCreationReceiptSchema.parse({
      id: crypto.randomUUID(),
      createdAt:
        now.toISOString(),
      avatarId:
        avatar.id,
      versionId:
        version.id,
      ...(instance
        ? {
            instanceId:
              instance.id
          }
        : {}),
      outputAssetId:
        asset.id,
      outputKind:
        asset.kind,
      jobId:
        input.jobId,
      ...(input.seed
        !== undefined
        ? { seed: input.seed }
        : {}),
      prompt:
        input.prompt
        ?? version.prompt,
      editInstruction:
        version.editInstruction,
      engine,
      sourceAssetIds,
      sourceHashes,
      ...(input.outputSha256
        ? {
            outputSha256:
              input.outputSha256
          }
        : {}),
      metadata: {
        commercialOutputReady:
          engine.rights
            .commercialOutput
            === 'allowed',
        ...(referencePack
          ? {
              referencePackId:
                referencePack.id,
              referencePackProfileId:
                referencePack.profileId
            }
          : {})
      }
    })

  const updatedAvatar: AvatarIdentity = {
    ...avatar,
    updatedAt:
      now.toISOString(),
    versions:
      avatar.versions.map(
        item =>
          item.id === version.id
            ? {
                ...item,
                outputAssetId:
                  asset.id,
                ...(asset.kind
                  === 'image'
                  ? {
                      previewAssetId:
                        asset.id
                    }
                  : {}),
                metadata: {
                  ...item.metadata,
                  generationStatus:
                    'generated',
                  creationReceiptId:
                    receipt.id,
                  engineId:
                    engine.engineId,
                  modelId:
                    engine.modelId
                }
              }
            : item
      )
  }

  const instances =
    project.avatarInstances.map(
      item =>
        instance
        && item.id === instance.id
          ? {
              ...item,
              updatedAt:
                now.toISOString(),
              outputAssetId:
                asset.id,
              metadata: {
                ...item.metadata,
                generationStatus:
                  'generated',
                creationReceiptId:
                  receipt.id
              }
            }
          : item
    )

  const next =
    parseProject(
      touchProject(
        {
          ...project,
          avatars:
            project.avatars.map(
              item =>
                item.id ===
                updatedAvatar.id
                  ? updatedAvatar
                  : item
            ),
          avatarInstances:
            instances,
          avatarCreationReceipts: [
            ...project
              .avatarCreationReceipts,
            receipt
          ]
        },
        now
      )
    )

  return {
    project: next,
    receipt,
    asset
  }
}

export function avatarCreationReceiptDocument(
  project: KinaouProject,
  receiptId: string
) {
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

  const avatar =
    avatarById(
      project,
      receipt.avatarId
    )

  const version =
    versionById(
      avatar,
      receipt.versionId
    )

  const output =
    project.assets.find(
      asset =>
        asset.id ===
        receipt.outputAssetId
    )

  if (!output) {
    throw new Error(
      'Avatar receipt output asset not found'
    )
  }

  const sources =
    receipt.sourceAssetIds.map(
      id => {
        const asset =
          project.assets.find(
            item =>
              item.id === id
          )

        if (!asset) {
          throw new Error(
            'Avatar receipt source asset not found'
          )
        }

        return {
          id: asset.id,
          kind: asset.kind,
          uri: asset.uri,
          sha256:
            receipt.sourceHashes[
              asset.id
            ]
        }
      }
    )

  return {
    schemaVersion: 1,
    type:
      'kinaou-avatar-creation-receipt',
    project: {
      id: project.id,
      title: project.title
    },
    avatar: {
      id: avatar.id,
      name: avatar.name,
      versionId:
        version.id,
      versionLabel:
        version.label
    },
    receipt:
      structuredClone(
        receipt
      ),
    output: {
      id: output.id,
      kind: output.kind,
      uri: output.uri,
      sha256:
        receipt.outputSha256
    },
    sources
  }
}
