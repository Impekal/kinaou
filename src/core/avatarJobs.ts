import {
  parseProject,
  touchProject,
  type KinaouAsset,
  type KinaouProject
} from './project'

export type AvatarEditJobState =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'

export interface AvatarEditJobParameters {
  prompt: string
  seed: number
  referencePaths: string[]
}

export interface AvatarEditJobProvenance {
  kind: 'local-model'
  adapterId: 'mflux-flux2-klein-edit'
  engineId: 'mflux-flux2-klein-4b-edit'
  engineVersion: 'mflux-0.20.0'
  modelId:
    'Runpod/FLUX.2-klein-4B-mflux-4bit'
  modelVersion:
    '73dcaa322be48ea49374b32b4b23aab1a3e59b87'
  prompt: string
  seed: number
  steps: 4
  width: 512
  height: 512
  referencePaths: string[]
}

export interface AvatarEditJobRecord {
  id: string
  state: AvatarEditJobState
  progress: number
  createdAt: string
  updatedAt: string
  provenance: AvatarEditJobProvenance
  outputPath?: string
  sizeBytes?: number
  error?: string
}

export const GENERATED_AVATAR_PREFIX =
  'KINAOU/Assets/GeneratedAvatars/'

function managedReference(
  value: unknown
): string {
  if (
    typeof value !== 'string'
    || !value.startsWith(
      'KINAOU/Assets/'
    )
    || !/\.(png|jpe?g|webp)$/i
      .test(value)
  ) {
    throw new Error(
      'Avatar edit references must be managed image assets'
    )
  }

  return value
}

export function parseAvatarEditJob(
  value: unknown
): AvatarEditJobRecord {
  if (
    !value
    || typeof value !== 'object'
  ) {
    throw new Error(
      'Invalid Avatar edit job'
    )
  }

  const job =
    value as Partial<
      AvatarEditJobRecord
    >

  if (
    typeof job.id !== 'string'
    || ![
      'queued',
      'running',
      'succeeded',
      'failed',
      'cancelled'
    ].includes(
      String(job.state)
    )
  ) {
    throw new Error(
      'Invalid Avatar edit job identity or state'
    )
  }

  if (
    typeof job.progress !== 'number'
    || job.progress < 0
    || job.progress > 1
    || typeof job.createdAt !== 'string'
    || typeof job.updatedAt !== 'string'
  ) {
    throw new Error(
      'Invalid Avatar edit job progress or timestamps'
    )
  }

  const provenance =
    job.provenance as
      Partial<AvatarEditJobProvenance>
      | undefined

  if (
    !provenance
    || provenance.kind !== 'local-model'
    || provenance.adapterId
      !== 'mflux-flux2-klein-edit'
    || provenance.engineId
      !== 'mflux-flux2-klein-4b-edit'
    || provenance.engineVersion
      !== 'mflux-0.20.0'
    || provenance.modelId
      !== 'Runpod/FLUX.2-klein-4B-mflux-4bit'
    || provenance.modelVersion
      !== '73dcaa322be48ea49374b32b4b23aab1a3e59b87'
    || typeof provenance.prompt !== 'string'
    || !provenance.prompt.trim()
    || !Number.isSafeInteger(
      provenance.seed
    )
    || (
      provenance.seed as number
    ) < 0
    || provenance.steps !== 4
    || provenance.width !== 512
    || provenance.height !== 512
    || !Array.isArray(
      provenance.referencePaths
    )
    || provenance.referencePaths.length !== 1
  ) {
    throw new Error(
      'Invalid Avatar edit provenance'
    )
  }

  const references =
    provenance.referencePaths.map(
      managedReference
    )

  if (
    new Set(references).size
      !== references.length
  ) {
    throw new Error(
      'Avatar edit references must be unique'
    )
  }

  if (
    job.state === 'succeeded'
    && (
      typeof job.outputPath
        !== 'string'
      || !job.outputPath.startsWith(
        GENERATED_AVATAR_PREFIX
      )
      || !job.outputPath.endsWith(
        '.png'
      )
      || typeof job.sizeBytes
        !== 'number'
      || job.sizeBytes <= 0
    )
  ) {
    throw new Error(
      'Invalid completed Avatar edit output'
    )
  }

  return job as AvatarEditJobRecord
}

export function registerGeneratedAvatarImage(
  project: KinaouProject,
  jobValue: AvatarEditJobRecord
): {
  project: KinaouProject
  asset: KinaouAsset
} {
  const job =
    parseAvatarEditJob(
      jobValue
    )

  if (
    job.state !== 'succeeded'
    || !job.outputPath
    || !job.sizeBytes
  ) {
    throw new Error(
      'Completed Avatar edit job required'
    )
  }

  const existing =
    project.assets.find(
      asset =>
        asset.uri ===
        job.outputPath
    )

  if (existing) {
    return {
      project,
      asset:
        existing
    }
  }

  const asset: KinaouAsset = {
    id:
      crypto.randomUUID(),
    kind:
      'image',
    uri:
      job.outputPath,
    managed:
      true,
    offline:
      false,
    metadata: {
      name:
        `Avatar take · ${job.provenance.prompt.slice(0, 60)}`,
      mimeType:
        'image/png',
      sizeBytes:
        job.sizeBytes,
      generated:
        true,
      adapterId:
        job.provenance.adapterId,
      avatarJobId:
        job.id,
      engineId:
        job.provenance.engineId,
      engineVersion:
        job.provenance.engineVersion,
      modelId:
        job.provenance.modelId,
      modelVersion:
        job.provenance.modelVersion,
      seed:
        job.provenance.seed,
      steps:
        job.provenance.steps,
      width:
        job.provenance.width,
      height:
        job.provenance.height,
      prompt:
        job.provenance.prompt,
      referencePaths:
        job.provenance.referencePaths,
      generatedAt:
        job.updatedAt
    }
  }

  const next =
    parseProject(
      touchProject({
        ...project,
        assets: [
          ...project.assets,
          asset
        ]
      })
    )

  return {
    project: next,
    asset
  }
}
