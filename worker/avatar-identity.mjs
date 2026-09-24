import path from 'node:path'

export const AVATAR_IDENTITY_ADAPTER_ID =
  'sdxl-ip-adapter-plus-face'

export const AVATAR_IDENTITY_BASE_MODEL =
  'stabilityai/stable-diffusion-xl-base-1.0'

export const AVATAR_IDENTITY_IP_ADAPTER =
  'h94/IP-Adapter'

export const AVATAR_IDENTITY_IP_WEIGHT =
  'sdxl_models/ip-adapter-plus-face_sdxl_vit-h.safetensors'

function absolute(
  value,
  label
) {
  if (
    typeof value !== 'string'
    || !path.isAbsolute(value)
  ) {
    throw new Error(
      `${label} must be an absolute path`
    )
  }

  return value
}

function model(
  value,
  repoId,
  label
) {
  if (
    !value
    || typeof value !== 'object'
    || value.repoId !== repoId
    || typeof value.available
      !== 'boolean'
  ) {
    throw new Error(
      `Invalid ${label} runtime descriptor`
    )
  }

  if (
    value.snapshot !== undefined
    && (
      typeof value.snapshot
        !== 'string'
      || !path.isAbsolute(
        value.snapshot
      )
    )
  ) {
    throw new Error(
      `Invalid ${label} snapshot`
    )
  }

  if (
    value.revision !== undefined
    && (
      typeof value.revision
        !== 'string'
      || !/^[a-f0-9]{7,64}$/i
        .test(value.revision)
    )
  ) {
    throw new Error(
      `Invalid ${label} revision`
    )
  }

  return {
    repoId,
    available:
      value.available,
    ...(value.snapshot
      ? {
          snapshot:
            value.snapshot
        }
      : {}),
    ...(value.revision
      ? {
          revision:
            value.revision
        }
      : {})
  }
}

export function buildAvatarIdentityProbeCommand({
  pythonPath,
  bridgePath,
  cachePath,
  manifestPath,
  device = 'mps'
}) {
  if (
    ![
      'mps',
      'cpu'
    ].includes(device)
  ) {
    throw new Error(
      'Avatar identity device must be mps or cpu'
    )
  }

  return {
    executable:
      absolute(
        pythonPath,
        'Avatar identity Python'
      ),
    args: [
      absolute(
        bridgePath,
        'Avatar identity bridge'
      ),
      '--probe',
      '--device',
      device,
      '--cache',
      absolute(
        cachePath,
        'Avatar identity cache'
      ),
      '--manifest',
      absolute(
        manifestPath,
        'Avatar identity manifest'
      )
    ]
  }
}

export function unconfiguredAvatarIdentityRuntime(
  device = 'mps'
) {
  return {
    configured: false,
    available: false,
    offlineOnly: true,
    adapterId:
      AVATAR_IDENTITY_ADAPTER_ID,
    device,
    packageVersions: {},
    models: {
      baseModel: {
        repoId:
          AVATAR_IDENTITY_BASE_MODEL,
        available: false
      },
      ipAdapter: {
        repoId:
          AVATAR_IDENTITY_IP_ADAPTER,
        available: false
      }
    },
    missing: [
      'runtime:configuration'
    ],
    notes: [
      'Set KINAOU_AVATAR_PYTHON and KINAOU_AVATAR_HF_HOME to an isolated local runtime and cache.'
    ],
    rightsReview: {
      baseModelLicense:
        'CreativeML Open RAIL++-M',
      adapterLicense:
        'Apache-2.0',
      commercialOutput:
        'pending-verification'
    }
  }
}

export function failedAvatarIdentityRuntime(
  device,
  message
) {
  return {
    ...unconfiguredAvatarIdentityRuntime(
      device
    ),
    configured: true,
    missing: [
      'runtime:probe'
    ],
    notes: [
      String(message)
        .slice(0, 1000)
    ]
  }
}

export function parseAvatarIdentityProbe(
  value
) {
  if (
    !value
    || typeof value !== 'object'
    || value.configured
      !== true
    || typeof value.available
      !== 'boolean'
    || value.offlineOnly
      !== true
    || value.adapterId
      !== AVATAR_IDENTITY_ADAPTER_ID
    || ![
      'mps',
      'cpu'
    ].includes(value.device)
    || !value.packageVersions
    || typeof value
      .packageVersions
      !== 'object'
    || Array.isArray(
      value.packageVersions
    )
    || !Array.isArray(
      value.missing
    )
    || !value.missing.every(
      entry =>
        typeof entry
          === 'string'
    )
    || !Array.isArray(
      value.notes
    )
    || !value.notes.every(
      entry =>
        typeof entry
          === 'string'
    )
  ) {
    throw new Error(
      'Invalid avatar identity runtime probe'
    )
  }

  const models = {
    baseModel:
      model(
        value.models
          ?.baseModel,
        AVATAR_IDENTITY_BASE_MODEL,
        'base model'
      ),
    ipAdapter:
      model(
        value.models
          ?.ipAdapter,
        AVATAR_IDENTITY_IP_ADAPTER,
        'IP-Adapter'
      )
  }

  const packageVersions = {}

  for (
    const [
      name,
      version
    ]
    of Object.entries(
      value.packageVersions
    )
  ) {
    if (
      typeof name !== 'string'
      || !name
      || (
        version !== null
        && typeof version
          !== 'string'
      )
    ) {
      throw new Error(
        'Invalid avatar identity package version'
      )
    }

    packageVersions[name] =
      version
  }

  const parsed = {
    configured: true,
    available:
      value.available,
    offlineOnly: true,
    adapterId:
      AVATAR_IDENTITY_ADAPTER_ID,
    device:
      value.device,
    ...(typeof value
      .pythonVersion
      === 'string'
      ? {
          pythonVersion:
            value.pythonVersion
        }
      : {}),
    packageVersions,
    models,
    missing:
      [...value.missing],
    notes:
      [...value.notes],
    rightsReview: {
      baseModelLicense:
        'CreativeML Open RAIL++-M',
      adapterLicense:
        'Apache-2.0',
      commercialOutput:
        'pending-verification'
    }
  }

  if (
    parsed.available
    && (
      parsed.missing.length
        > 0
      || !models.baseModel
        .available
      || !models.ipAdapter
        .available
    )
  ) {
    throw new Error(
      'Avatar identity runtime claims availability with missing dependencies'
    )
  }

  return parsed
}
