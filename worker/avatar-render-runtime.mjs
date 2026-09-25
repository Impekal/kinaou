import path from 'node:path'


const ALLOWED_CAPABILITIES =
  new Set([
    'identity-generation',
    'identity-preservation',
    'targeted-edit',
    'image-reference',
    'video-reference',
    'multi-reference',
    'scene-image',
    'scene-video',
    'motion',
    'expression',
    'lip-sync',
    'character-replacement'
  ])


const REQUIRED_FINAL_CAPABILITIES = [
  'identity-preservation',
  'scene-video',
  'motion'
]


const RIGHT_STATUSES =
  new Set([
    'allowed',
    'restricted',
    'unknown'
  ])


function text(
  value,
  label,
  max = 240
) {
  if (
    typeof value !== 'string'
    || !value.trim()
    || value.length > max
  ) {
    throw new Error(
      `Invalid ${label}`
    )
  }

  return value
}


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


function rights(
  value
) {
  if (
    !value
    || typeof value !== 'object'
    || Array.isArray(value)
  ) {
    throw new Error(
      'Invalid Avatar final engine rights'
    )
  }

  const parsed = {
    licenseName:
      text(
        value.licenseName,
        'Avatar final engine license',
        200
      ),

    ...(value.licenseUrl
      ? {
          licenseUrl:
            text(
              value.licenseUrl,
              'Avatar final engine license URL',
              2000
            )
        }
      : {}),

    licenseSnapshotAt:
      text(
        value.licenseSnapshotAt,
        'Avatar final engine license snapshot',
        100
      ),

    privateUse:
      value.privateUse,

    commercialOutput:
      value.commercialOutput,

    commercialSoftwareUse:
      value.commercialSoftwareUse,

    modelRedistribution:
      value.modelRedistribution,

    attributionRequired:
      value.attributionRequired,

    notes:
      typeof value.notes
        === 'string'
        ? value.notes.slice(
            0,
            4000
          )
        : ''
  }

  for (
    const [
      label,
      status
    ]
    of [
      [
        'privateUse',
        parsed.privateUse
      ],
      [
        'commercialOutput',
        parsed.commercialOutput
      ],
      [
        'commercialSoftwareUse',
        parsed.commercialSoftwareUse
      ],
      [
        'modelRedistribution',
        parsed.modelRedistribution
      ]
    ]
  ) {
    if (
      !RIGHT_STATUSES.has(
        status
      )
    ) {
      throw new Error(
        `Invalid Avatar final engine right: ${label}`
      )
    }
  }

  if (
    typeof parsed
      .attributionRequired
      !== 'boolean'
  ) {
    throw new Error(
      'Invalid Avatar final engine attribution requirement'
    )
  }

  if (
    Number.isNaN(
      Date.parse(
        parsed.licenseSnapshotAt
      )
    )
  ) {
    throw new Error(
      'Invalid Avatar final engine license snapshot timestamp'
    )
  }

  return parsed
}


function engine(
  value
) {
  if (
    !value
    || typeof value !== 'object'
    || Array.isArray(value)
  ) {
    throw new Error(
      'Invalid Avatar final engine'
    )
  }

  if (
    !Array.isArray(
      value.capabilities
    )
    || value.capabilities.length < 1
    || value.capabilities.length > 12
    || !value.capabilities.every(
      capability =>
        ALLOWED_CAPABILITIES.has(
          capability
        )
    )
    || new Set(
      value.capabilities
    ).size
      !== value.capabilities.length
  ) {
    throw new Error(
      'Invalid Avatar final engine capabilities'
    )
  }

  const parsed = {
    adapterId:
      text(
        value.adapterId,
        'Avatar final adapter ID',
        120
      ),

    engineId:
      text(
        value.engineId,
        'Avatar final engine ID',
        160
      ),

    engineVersion:
      text(
        value.engineVersion,
        'Avatar final engine version',
        160
      ),

    modelId:
      text(
        value.modelId,
        'Avatar final model ID',
        240
      ),

    ...(value.modelVersion
      ? {
          modelVersion:
            text(
              value.modelVersion,
              'Avatar final model version',
              160
            )
        }
      : {}),

    capabilities:
      [...value.capabilities],

    rights:
      rights(
        value.rights
      )
  }

  for (
    const capability
    of REQUIRED_FINAL_CAPABILITIES
  ) {
    if (
      !parsed.capabilities
        .includes(
          capability
        )
    ) {
      throw new Error(
        `Avatar final engine is missing required capability: ${capability}`
      )
    }
  }

  if (
    parsed.rights
      .commercialOutput
      !== 'allowed'
  ) {
    throw new Error(
      'Avatar final engine commercial output rights are not verified'
    )
  }

  if (
    parsed.rights
      .commercialSoftwareUse
      !== 'allowed'
  ) {
    throw new Error(
      'Avatar final engine commercial software rights are not verified'
    )
  }

  return parsed
}


export function parseAvatarFinalRuntimeManifest(
  value
) {
  if (
    !value
    || typeof value !== 'object'
    || Array.isArray(value)
    || value.schemaVersion !== 1
    || value.kind
      !== 'kinaou-avatar-local-generative-runtime'
    || value.offlineOnly !== true
  ) {
    throw new Error(
      'Invalid Avatar final runtime manifest'
    )
  }

  if (
    !Array.isArray(
      value.modelPaths
    )
    || value.modelPaths.length < 1
    || value.modelPaths.length > 32
  ) {
    throw new Error(
      'Avatar final runtime requires local model paths'
    )
  }

  const modelPaths =
    value.modelPaths.map(
      item =>
        absolute(
          item,
          'Avatar final model path'
        )
    )

  if (
    new Set(
      modelPaths
    ).size
      !== modelPaths.length
  ) {
    throw new Error(
      'Avatar final model paths must be unique'
    )
  }

  const notes =
    Array.isArray(
      value.notes
    )
      ? value.notes.map(
          item =>
            text(
              item,
              'Avatar final runtime note',
              1000
            )
        )
      : []

  return {
    schemaVersion:
      1,

    kind:
      'kinaou-avatar-local-generative-runtime',

    offlineOnly:
      true,

    executable:
      absolute(
        value.executable,
        'Avatar final executable'
      ),

    modelPaths,

    engine:
      engine(
        value.engine
      ),

    notes
  }
}


export function buildNvidiaSmiProbeCommand() {
  return {
    executable:
      'nvidia-smi',

    args: [
      '--query-gpu=name,memory.total',
      '--format=csv,noheader,nounits'
    ]
  }
}


export function parseNvidiaSmiOutput(
  value
) {
  if (
    typeof value !== 'string'
  ) {
    throw new Error(
      'Invalid nvidia-smi output'
    )
  }

  const line =
    value
      .split('\n')
      .map(
        item =>
          item.trim()
      )
      .filter(Boolean)
      .at(0)

  if (!line) {
    throw new Error(
      'nvidia-smi returned no GPU'
    )
  }

  const match =
    /^(.*),\s*([0-9]+(?:\.[0-9]+)?)$/
      .exec(line)

  if (!match) {
    throw new Error(
      'Could not parse nvidia-smi GPU information'
    )
  }

  const memoryMiB =
    Number(
      match[2]
    )

  if (
    !Number.isFinite(
      memoryMiB
    )
    || memoryMiB <= 0
  ) {
    throw new Error(
      'Invalid CUDA VRAM amount'
    )
  }

  return {
    accelerator:
      'cuda',

    acceleratorName:
      match[1].trim(),

    vramBytes:
      Math.round(
        memoryMiB
        * 1024
        * 1024
      )
  }
}


export function buildAvatarRenderHost({
  platform,
  arch,
  cpuModel,
  systemMemoryBytes,
  cuda
}) {
  if (
    ![
      'darwin',
      'win32',
      'linux'
    ].includes(
      platform
    )
  ) {
    throw new Error(
      'Unsupported Avatar render host platform'
    )
  }

  if (
    ![
      'arm64',
      'x64'
    ].includes(
      arch
    )
  ) {
    throw new Error(
      'Unsupported Avatar render host architecture'
    )
  }

  if (
    !Number.isSafeInteger(
      systemMemoryBytes
    )
    || systemMemoryBytes < 0
  ) {
    throw new Error(
      'Invalid Avatar render host memory'
    )
  }

  if (cuda) {
    return {
      platform,
      arch,
      accelerator:
        'cuda',
      acceleratorName:
        text(
          cuda.acceleratorName,
          'CUDA GPU name'
        ),
      vramBytes:
        cuda.vramBytes,
      systemMemoryBytes
    }
  }

  if (
    platform === 'darwin'
    && arch === 'arm64'
  ) {
    return {
      platform,
      arch,
      accelerator:
        'mps',
      acceleratorName:
        typeof cpuModel
          === 'string'
          && cpuModel.trim()
            ? cpuModel.trim()
            : 'Apple Silicon',
      systemMemoryBytes
    }
  }

  return {
    platform,
    arch,
    accelerator:
      'cpu',
    ...(typeof cpuModel
      === 'string'
      && cpuModel.trim()
      ? {
          acceleratorName:
            cpuModel.trim()
        }
      : {}),
    systemMemoryBytes
  }
}


function previewRuntime() {
  return {
    configured:
      false,
    available:
      false,
    offlineOnly:
      true,
    notes: [
      'Local Avatar preview acceptance is not yet bound to the worker runtime contract.'
    ]
  }
}


export function unconfiguredAvatarRenderRuntime(
  host
) {
  return {
    schemaVersion:
      1,

    host,

    preview:
      previewRuntime(),

    localGenerative: {
      configured:
        false,

      available:
        false,

      offlineOnly:
        true,

      missing: [
        'runtime:configuration'
      ],

      notes: [
        'Set KINAOU_AVATAR_FINAL_MANIFEST to a verified local generative runtime manifest.'
      ]
    }
  }
}


export function failedAvatarRenderRuntime(
  host,
  message
) {
  return {
    schemaVersion:
      1,

    host,

    preview:
      previewRuntime(),

    localGenerative: {
      configured:
        true,

      available:
        false,

      offlineOnly:
        true,

      missing: [
        'runtime:probe'
      ],

      notes: [
        String(
          message
        ).slice(
          0,
          1000
        )
      ]
    }
  }
}


export function incompleteAvatarRenderRuntime(
  host,
  manifest,
  missing
) {
  return {
    schemaVersion:
      1,

    host,

    preview:
      previewRuntime(),

    localGenerative: {
      configured:
        true,

      available:
        false,

      offlineOnly:
        true,

      engine:
        manifest.engine,

      missing:
        [...missing],

      notes: [
        ...manifest.notes,
        'Configured local final runtime is incomplete.'
      ]
    }
  }
}


export function availableAvatarRenderRuntime(
  host,
  manifest
) {
  return {
    schemaVersion:
      1,

    host,

    preview:
      previewRuntime(),

    localGenerative: {
      configured:
        true,

      available:
        true,

      offlineOnly:
        true,

      engine:
        manifest.engine,

      missing: [],

      notes:
        [...manifest.notes]
    }
  }
}
