import {
  avatarEngineDescriptorSchema,
  type AvatarEngineDescriptor
} from './project'

export const FLUX2_KLEIN_ADAPTER_ID =
  'mflux-flux2-klein-edit'

export const FLUX2_KLEIN_ENGINE_ID =
  'mflux-flux2-klein-4b-edit'

export const FLUX2_KLEIN_ENGINE_VERSION =
  'mflux-0.20.0'

export const FLUX2_KLEIN_MODEL_ID =
  'Runpod/FLUX.2-klein-4B-mflux-4bit'

export const FLUX2_KLEIN_MODEL_REVISION =
  '73dcaa322be48ea49374b32b4b23aab1a3e59b87'

export const FLUX2_KLEIN_BASE_MODEL_ID =
  'black-forest-labs/FLUX.2-klein-4B'

export const FLUX2_KLEIN_BASE_REVISION =
  '6dfcebfd3cb91f82d131896f70845e96d902a304'

export const FLUX2_KLEIN_MFLUX_RELEASE_COMMIT =
  '83ca6f2c230830e8e90e106ef7adb33abc93c9fc'

export const FLUX2_KLEIN_ACCEPTED_WIDTH =
  512

export const FLUX2_KLEIN_ACCEPTED_HEIGHT =
  512

export const FLUX2_KLEIN_ACCEPTED_STEPS =
  4

export function flux2KleinAvatarEngine(
  capturedAt: string
): AvatarEngineDescriptor {
  return avatarEngineDescriptorSchema.parse({
    adapterId:
      FLUX2_KLEIN_ADAPTER_ID,
    engineId:
      FLUX2_KLEIN_ENGINE_ID,
    engineVersion:
      FLUX2_KLEIN_ENGINE_VERSION,
    modelId:
      FLUX2_KLEIN_MODEL_ID,
    modelVersion:
      FLUX2_KLEIN_MODEL_REVISION,
    capabilities: [
      'identity-preservation',
      'targeted-edit',
      'image-reference',
      'multi-reference',
      'scene-image'
    ],
    rights: {
      licenseName:
        'Apache License 2.0',
      licenseUrl:
        `https://huggingface.co/${FLUX2_KLEIN_BASE_MODEL_ID}/blob/${FLUX2_KLEIN_BASE_REVISION}/LICENSE.md`,
      licenseSnapshotAt:
        capturedAt,
      privateUse:
        'allowed',
      commercialOutput:
        'allowed',
      commercialSoftwareUse:
        'allowed',
      modelRedistribution:
        'allowed',
      attributionRequired:
        false,
      notes: [
        'The accepted KINAOU identity-preservation path uses FLUX.2 Klein 4B image-conditioned editing through MFLUX 0.20.0.',
        'The development runtime uses a pinned 4-bit MFLUX conversion derived from the Apache-2.0 FLUX.2 Klein 4B base model.',
        'Human acceptance on 2026-09-25 found the same fictional identity preserved across single-reference edits and a three-image Reference Pack under same-outfit, combined clothing/environment/camera stress, opposite-angle, new-environment, independent-seed and reference-order tests.',
        'The accepted multi-reference product profile is exactly three human-approved images: an Identity Master plus two complementary approved views.',
        'This acceptance covers still-image identity-preserving editing at the tested 512x512 four-step profile; it does not claim prompt-only identity generation, video identity, motion, expression, lip sync or character replacement.',
        'Apache-2.0 redistribution conditions and notices still apply when redistributing model/runtime material.',
        'Commercial-output permission concerns model-license permission only; reference-image rights, personality/publicity rights, trademarks, copyright in third-party material and legality of a particular output remain separate.'
      ].join(' ')
    }
  })
}
