import {
  avatarEngineRightsSchema,
  type AvatarEngineRights
} from './project'

export const SDXL_REVISION =
  '462165984030d82259a11f4367a4eed129e94a7b'

export const IP_ADAPTER_REVISION =
  '018e402774aeeddd60609b4ecdb7e298259dc729'

export function sdxlIpAdapterRights(
  capturedAt: string
): AvatarEngineRights {
  return avatarEngineRightsSchema.parse({
    licenseName:
      'CreativeML Open RAIL++-M + Apache-2.0',
    licenseUrl:
      `https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/blob/${SDXL_REVISION}/LICENSE.md`,
    licenseSnapshotAt:
      capturedAt,
    privateUse:
      'allowed',
    commercialOutput:
      'allowed',
    commercialSoftwareUse:
      'allowed',
    modelRedistribution:
      'restricted',
    attributionRequired:
      false,
    notes: [
      'Commercial output is permitted by the pinned model licenses subject to their conditions.',
      'SDXL Open RAIL++ use restrictions remain applicable, including Attachment A.',
      'The SDXL licensor states that it claims no rights in generated output except as otherwise provided by the license.',
      'IP-Adapter is pinned to an Apache-2.0-declared revision.',
      'Model redistribution is marked restricted because redistribution of SDXL/model derivatives carries license pass-through and notice obligations.',
      'This status concerns model-license permission only; reference-image rights, personality/publicity rights, trademarks, copyright in third-party material and legality of a particular output remain separate.'
    ].join(' ')
  })
}
