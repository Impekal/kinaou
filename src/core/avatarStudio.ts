import {
  parseProject,
  touchProject,
  type AvatarIdentity,
  type AvatarInstance,
  type AvatarSource,
  type AvatarVersion,
  type KinaouAsset,
  type KinaouProject
} from './project'

import {
  assertSafeManagedPath
} from './storage'

import type {
  PersistentVersionHistory
} from './versioning'

export const avatarPresets = [
  {
    id: 'studio-presenter',
    label: 'Studio Presenter',
    prompt:
      'Professional presenter, clean modern wardrobe, confident neutral posture, camera-ready appearance'
  },
  {
    id: 'documentary-host',
    label: 'Documentary Host',
    prompt:
      'Documentary host, natural wardrobe, thoughtful expression, authentic editorial presence'
  },
  {
    id: 'casual-creator',
    label: 'Casual Creator',
    prompt:
      'Contemporary creator, casual wardrobe, approachable expression, energetic social-video presence'
  }
] as const

export type AvatarSourceKind =
  AvatarSource['kind']

export interface CreateAvatarInput {
  name: string
  sourceKind: AvatarSourceKind
  presetId?: string
  prompt?: string
  assetIds?: string[]
  referenceAuthorized?: boolean
  referenceRightsBasis?:
    | 'own'
    | 'authorized'
}

export interface CreateAvatarVersionInput {
  label?: string
  instruction: string
  prompt?: string
}

export interface CreateAvatarInstanceInput {
  avatarId: string
  versionId?: string
  sceneId?: string
  prompt?: string
  environmentPrompt?: string
  motionPrompt?: string
  expressionPrompt?: string
  voiceAssetId?: string
}

function clean(
  value: unknown
): string {
  return typeof value === 'string'
    ? value.trim()
    : ''
}

export function avatarReferenceAssetAvailable(
  asset: KinaouAsset
): boolean {
  if (
    !asset.managed
    || asset.offline
    || ![
      'image',
      'video'
    ].includes(asset.kind)
  ) {
    return false
  }

  try {
    return (
      assertSafeManagedPath(
        asset.uri
      ) === asset.uri
      && asset.uri.startsWith(
        'KINAOU/Assets/'
      )
    )
  } catch {
    return false
  }
}

export function avatarVoiceAssetAvailable(
  asset: KinaouAsset
): boolean {
  if (
    !asset.managed
    || asset.offline
    || asset.kind !== 'audio'
  ) {
    return false
  }

  try {
    return (
      assertSafeManagedPath(
        asset.uri
      ) === asset.uri
      && asset.uri.startsWith(
        'KINAOU/Assets/'
      )
    )
  } catch {
    return false
  }
}

function requireReferenceAssets(
  project: KinaouProject,
  ids: string[]
): KinaouAsset[] {
  return ids.map(
    id => {
      const asset =
        project.assets.find(
          entry =>
            entry.id === id
        )

      if (
        !asset
        || !avatarReferenceAssetAvailable(
          asset
        )
      ) {
        throw new Error(
          'Avatar reference asset is not available'
        )
      }

      return asset
    }
  )
}

function buildAvatarSource(
  project: KinaouProject,
  input: CreateAvatarInput,
  now = new Date()
): AvatarSource {
  const prompt =
    clean(input.prompt)

  const assetIds =
    Array.from(
      new Set(
        input.assetIds ?? []
      )
    )

  const importedRights = () => {
    if (
      input.referenceAuthorized
        !== true
    ) {
      throw new Error(
        'Confirm that you own or are authorized to use the avatar references'
      )
    }

    if (
      input.referenceRightsBasis
        !== 'own'
      && input.referenceRightsBasis
        !== 'authorized'
    ) {
      throw new Error(
        'Choose the rights basis for the avatar references'
      )
    }

    return {
      basis:
        input.referenceRightsBasis,
      commercialUseIntended: true,
      confirmedAt:
        now.toISOString()
    } as const
  }

  switch (input.sourceKind) {
    case 'preset': {
      const preset =
        avatarPresets.find(
          entry =>
            entry.id ===
            input.presetId
        )

      if (!preset) {
        throw new Error(
          'Choose a valid avatar preset'
        )
      }

      return {
        kind: 'preset',
        presetId: preset.id,
        prompt:
          prompt
          || preset.prompt,
        assetIds: [],
        rights: {
          basis: 'preset',
          commercialUseIntended: true
        }
      }
    }

    case 'prompt':
      if (!prompt) {
        throw new Error(
          'Describe the avatar to create'
        )
      }

      return {
        kind: 'prompt',
        prompt,
        assetIds: [],
        rights: {
          basis: 'generated',
          commercialUseIntended: true
        }
      }

    case 'image': {
      if (assetIds.length !== 1) {
        throw new Error(
          'Choose exactly one image reference'
        )
      }

      const [asset] =
        requireReferenceAssets(
          project,
          assetIds
        )

      if (asset.kind !== 'image') {
        throw new Error(
          'Avatar image source must be an image'
        )
      }

      return {
        kind: 'image',
        prompt,
        assetIds,
        rights:
          importedRights()
      }
    }

    case 'video': {
      if (assetIds.length !== 1) {
        throw new Error(
          'Choose exactly one video reference'
        )
      }

      const [asset] =
        requireReferenceAssets(
          project,
          assetIds
        )

      if (asset.kind !== 'video') {
        throw new Error(
          'Avatar video source must be a video'
        )
      }

      return {
        kind: 'video',
        prompt,
        assetIds,
        rights:
          importedRights()
      }
    }

    case 'multi-reference': {
      if (
        assetIds.length < 2
        || assetIds.length > 12
      ) {
        throw new Error(
          'Choose 2–12 avatar reference images or videos'
        )
      }

      requireReferenceAssets(
        project,
        assetIds
      )

      return {
        kind: 'multi-reference',
        prompt,
        assetIds,
        rights:
          importedRights()
      }
    }
  }
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

export function createAvatarIdentity(
  project: KinaouProject,
  input: CreateAvatarInput,
  now = new Date()
): {
  project: KinaouProject
  avatar: AvatarIdentity
  version: AvatarVersion
} {
  const name =
    clean(input.name)

  if (
    !name
    || name.length > 80
  ) {
    throw new Error(
      'Avatar name must contain 1–80 characters'
    )
  }

  const source =
    buildAvatarSource(
      project,
      input,
      now
    )

  const timestamp =
    now.toISOString()

  const version: AvatarVersion = {
    id: crypto.randomUUID(),
    label: 'Original',
    createdAt: timestamp,
    source,
    prompt: source.prompt,
    editInstruction: '',
    metadata: {}
  }

  const avatar: AvatarIdentity = {
    id: crypto.randomUUID(),
    name,
    createdAt: timestamp,
    updatedAt: timestamp,
    activeVersionId:
      version.id,
    versions: [version],
    referencePacks: [],
    metadata: {
      identityStatus:
        'defined'
    }
  }

  const next =
    parseProject(
      touchProject(
        {
          ...project,
          avatars: [
            ...project.avatars,
            avatar
          ]
        },
        now
      )
    )

  return {
    project: next,
    avatar,
    version
  }
}

export function deriveAvatarVersion(
  project: KinaouProject,
  avatarId: string,
  input: CreateAvatarVersionInput,
  now = new Date()
): {
  project: KinaouProject
  avatar: AvatarIdentity
  version: AvatarVersion
} {
  const avatar =
    avatarById(
      project,
      avatarId
    )

  const parent =
    versionById(
      avatar,
      avatar.activeVersionId
    )

  const instruction =
    clean(input.instruction)

  if (!instruction) {
    throw new Error(
      'Describe what should change'
    )
  }

  const timestamp =
    now.toISOString()

  const version: AvatarVersion = {
    ...structuredClone(
      parent
    ),
    id: crypto.randomUUID(),
    label:
      clean(input.label)
      || `Version ${avatar.versions.length + 1}`,
    createdAt: timestamp,
    parentVersionId:
      parent.id,
    prompt:
      clean(input.prompt)
      || parent.prompt,
    editInstruction:
      instruction,
    previewAssetId:
      undefined,
    outputAssetId:
      undefined,
    metadata: {
      ...parent.metadata,
      generationStatus:
        'pending'
    }
  }

  const updated: AvatarIdentity = {
    ...avatar,
    updatedAt: timestamp,
    activeVersionId:
      version.id,
    versions: [
      ...avatar.versions,
      version
    ]
  }

  return {
    project:
      replaceAvatar(
        project,
        updated,
        now
      ),
    avatar: updated,
    version
  }
}

export function setActiveAvatarVersion(
  project: KinaouProject,
  avatarId: string,
  versionId: string,
  now = new Date()
): {
  project: KinaouProject
  avatar: AvatarIdentity
} {
  const avatar =
    avatarById(
      project,
      avatarId
    )

  versionById(
    avatar,
    versionId
  )

  if (
    avatar.activeVersionId
      === versionId
  ) {
    return {
      project,
      avatar
    }
  }

  const updated = {
    ...avatar,
    activeVersionId:
      versionId,
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
    avatar: updated
  }
}

export function bindAvatarVoice(
  project: KinaouProject,
  avatarId: string,
  voiceAssetId?: string,
  now = new Date()
): {
  project: KinaouProject
  avatar: AvatarIdentity
} {
  const avatar =
    avatarById(
      project,
      avatarId
    )

  if (voiceAssetId) {
    const asset =
      project.assets.find(
        entry =>
          entry.id ===
          voiceAssetId
      )

    if (
      !asset
      || !avatarVoiceAssetAvailable(
        asset
      )
    ) {
      throw new Error(
        'Avatar voice asset is not available'
      )
    }
  }

  const updated: AvatarIdentity = {
    ...avatar,
    updatedAt:
      now.toISOString(),
    ...(voiceAssetId
      ? { voiceAssetId }
      : {})
  }

  if (!voiceAssetId) {
    delete updated.voiceAssetId
  }

  return {
    project:
      replaceAvatar(
        project,
        updated,
        now
      ),
    avatar: updated
  }
}

export function createAvatarInstance(
  project: KinaouProject,
  input: CreateAvatarInstanceInput,
  now = new Date()
): {
  project: KinaouProject
  instance: AvatarInstance
} {
  const avatar =
    avatarById(
      project,
      input.avatarId
    )

  const versionId =
    input.versionId
    || avatar.activeVersionId

  versionById(
    avatar,
    versionId
  )

  if (
    input.sceneId
    && !project.storyboard.some(
      scene =>
        scene.id ===
        input.sceneId
    )
  ) {
    throw new Error(
      'Storyboard scene not found'
    )
  }

  const voiceAssetId =
    input.voiceAssetId
    || avatar.voiceAssetId

  if (voiceAssetId) {
    const voice =
      project.assets.find(
        entry =>
          entry.id ===
          voiceAssetId
      )

    if (
      !voice
      || !avatarVoiceAssetAvailable(
        voice
      )
    ) {
      throw new Error(
        'Avatar instance voice is not available'
      )
    }
  }

  const timestamp =
    now.toISOString()

  const instance: AvatarInstance = {
    id: crypto.randomUUID(),
    avatarId:
      avatar.id,
    versionId,
    createdAt:
      timestamp,
    updatedAt:
      timestamp,
    prompt:
      clean(input.prompt),
    environmentPrompt:
      clean(
        input.environmentPrompt
      ),
    motionPrompt:
      clean(
        input.motionPrompt
      ),
    expressionPrompt:
      clean(
        input.expressionPrompt
      ),
    ...(input.sceneId
      ? {
          sceneId:
            input.sceneId
        }
      : {}),
    ...(voiceAssetId
      ? { voiceAssetId }
      : {}),
    metadata: {
      generationStatus:
        'defined'
    }
  }

  return {
    project:
      parseProject(
        touchProject(
          {
            ...project,
            avatarInstances: [
              ...project.avatarInstances,
              instance
            ]
          },
          now
        )
      ),
    instance
  }
}

export function commitAvatarChange<
  T extends {
    project: KinaouProject
  }
>(
  project: KinaouProject,
  calculate: () => T,
  history: Pick<
    PersistentVersionHistory,
    'snapshot'
  >,
  persist: (
    project: KinaouProject
  ) => void,
  label: string
): T {
  const result =
    calculate()

  if (result.project === project) {
    return result
  }

  const next =
    parseProject(
      result.project
    )

  history.snapshot(
    project,
    label,
    'system'
  )

  persist(next)

  return {
    ...result,
    project: next
  }
}
