import path from 'node:path'

export const FLUX2_KLEIN_MODEL_ID =
  'Runpod/FLUX.2-klein-4B-mflux-4bit'

export const FLUX2_KLEIN_MODEL_REVISION =
  '73dcaa322be48ea49374b32b4b23aab1a3e59b87'


export const FLUX2_KLEIN_MODEL_AGGREGATE_SHA256 =
  '59f63035f2800752eb18f6afb24d88bbc6ae5759bb9d46a02038fbc7c2d05f32'

export const FLUX2_KLEIN_RUNTIME_VERSION =
  '0.20.0'

export const FLUX2_KLEIN_RUNTIME_RELEASE_COMMIT =
  '83ca6f2c230830e8e90e106ef7adb33abc93c9fc'

export const FLUX2_KLEIN_BASE_MODEL_ID =
  'black-forest-labs/FLUX.2-klein-4B'

export const FLUX2_KLEIN_BASE_LICENSE_REVISION =
  '6dfcebfd3cb91f82d131896f70845e96d902a304'

export const FLUX2_KLEIN_BASE_MODEL =
  'flux2-klein-4b'

export const FLUX2_KLEIN_ACCEPTED_STEPS =
  4

export const FLUX2_KLEIN_ACCEPTED_SIZE =
  512

const MAX_PROMPT_LENGTH =
  20_000

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

function seed(
  value
) {
  if (
    !Number.isSafeInteger(value)
    || value < 0
  ) {
    throw new Error(
      'Avatar seed must be a non-negative safe integer'
    )
  }

  return value
}

function prompt(
  value
) {
  if (
    typeof value !== 'string'
  ) {
    throw new Error(
      'Avatar edit prompt is required'
    )
  }

  const normalized =
    value.trim()

  if (
    !normalized
    || normalized.length
      > MAX_PROMPT_LENGTH
  ) {
    throw new Error(
      `Avatar edit prompt must contain 1–${MAX_PROMPT_LENGTH} characters`
    )
  }

  return normalized
}

function references(
  values
) {
  if (
    !Array.isArray(values)
    || values.length < 1
    || values.length > 12
  ) {
    throw new Error(
      'Avatar edit requires 1–12 reference images'
    )
  }

  const normalized =
    values.map(
      value =>
        absolute(
          value,
          'Avatar reference'
        )
    )

  if (
    new Set(normalized)
      .size !==
      normalized.length
  ) {
    throw new Error(
      'Avatar references must be unique'
    )
  }

  return normalized
}

export function buildFlux2KleinAvatarEditCommand({
  cliPath,
  modelPath,
  referencePaths,
  prompt: promptValue,
  outputPath,
  seed: seedValue
}) {
  const executable =
    absolute(
      cliPath,
      'MFLUX edit CLI'
    )

  const model =
    absolute(
      modelPath,
      'FLUX.2 Klein model'
    )

  const output =
    absolute(
      outputPath,
      'Avatar output'
    )

  const refs =
    references(
      referencePaths
    )

  const instruction =
    prompt(
      promptValue
    )

  const entropy =
    seed(
      seedValue
    )

  return {
    executable,
    args: [
      '--model',
      model,
      '--base-model',
      FLUX2_KLEIN_BASE_MODEL,
      '--image-paths',
      ...refs,
      '--prompt',
      instruction,
      '--steps',
      String(
        FLUX2_KLEIN_ACCEPTED_STEPS
      ),
      '--seed',
      String(entropy),
      '--width',
      String(
        FLUX2_KLEIN_ACCEPTED_SIZE
      ),
      '--height',
      String(
        FLUX2_KLEIN_ACCEPTED_SIZE
      ),
      '--low-ram',
      '--vae-tile-size',
      '512',
      '--mlx-cache-limit-gb',
      '2',
      '--metadata',
      '--output',
      output
    ],
    env: {
      HF_HUB_OFFLINE:
        '1',
      TRANSFORMERS_OFFLINE:
        '1'
    }
  }
}

export const FLUX2_KLEIN_GENERATED_PREFIX =
  'KINAOU/Assets/GeneratedAvatars/'

export const FLUX2_KLEIN_TEMP_PREFIX =
  'KINAOU/Temp/GeneratedAvatars/'

function jobId(
  value
) {
  if (
    typeof value !== 'string'
    || !/^[a-zA-Z0-9-]+$/.test(value)
  ) {
    throw new Error(
      'Invalid Avatar edit job ID'
    )
  }

  return value
}

export function flux2KleinAvatarOutputRelativePath(
  value
) {
  return (
    FLUX2_KLEIN_GENERATED_PREFIX
    + jobId(value)
    + '.png'
  )
}

export function flux2KleinAvatarTempRelativePath(
  value
) {
  return (
    FLUX2_KLEIN_TEMP_PREFIX
    + jobId(value)
    + '.part.png'
  )
}


export function parseFlux2KleinRuntimeManifest(
  value
) {
  if (
    !value
    || typeof value !== 'object'
    || Array.isArray(value)
    || value.schemaVersion !== 1
    || value.runtime !== 'mflux'
    || value.runtimeVersion
      !== FLUX2_KLEIN_RUNTIME_VERSION
    || value.runtimeReleaseCommit
      !== FLUX2_KLEIN_RUNTIME_RELEASE_COMMIT
    || value.modelRepository
      !== FLUX2_KLEIN_MODEL_ID
    || value.modelRevision
      !== FLUX2_KLEIN_MODEL_REVISION
    || value.modelAggregateSha256
      !== FLUX2_KLEIN_MODEL_AGGREGATE_SHA256
    || value.baseModelRepository
      !== FLUX2_KLEIN_BASE_MODEL_ID
    || value.baseLicenseEvidenceRevision
      !== FLUX2_KLEIN_BASE_LICENSE_REVISION
    || value.licenseId
      !== 'apache-2.0'
    || value.commercialOutput
      !== 'allowed'
    || value.insightFaceUsed
      !== false
    || value.faceIdUsed
      !== false
    || value.quantization
      !== '4-bit'
  ) {
    throw new Error(
      'Invalid FLUX.2 Klein Avatar runtime manifest'
    )
  }

  return {
    schemaVersion:
      1,
    runtime:
      'mflux',
    runtimeVersion:
      FLUX2_KLEIN_RUNTIME_VERSION,
    runtimeReleaseCommit:
      FLUX2_KLEIN_RUNTIME_RELEASE_COMMIT,
    modelRepository:
      FLUX2_KLEIN_MODEL_ID,
    modelRevision:
      FLUX2_KLEIN_MODEL_REVISION,
    modelAggregateSha256:
      FLUX2_KLEIN_MODEL_AGGREGATE_SHA256,
    baseModelRepository:
      FLUX2_KLEIN_BASE_MODEL_ID,
    baseLicenseEvidenceRevision:
      FLUX2_KLEIN_BASE_LICENSE_REVISION,
    licenseId:
      'apache-2.0',
    commercialOutput:
      'allowed',
    insightFaceUsed:
      false,
    faceIdUsed:
      false,
    quantization:
      '4-bit'
  }
}
