import {
  z
} from 'zod'

import {
  avatarEngineDescriptorSchema,
  type AvatarEngineDescriptor
} from './project'

import {
  assertNoPlatformInferenceCost,
  chooseAvatarRenderBackend,
  type AvatarRenderAvailability,
  type AvatarRenderQuality,
  type AvatarRenderSelection
} from './avatarRenderPolicy'


const bytesSchema =
  z.number()
    .int()
    .nonnegative()


export const avatarRenderHostSchema =
  z.object({
    platform:
      z.enum([
        'darwin',
        'win32',
        'linux'
      ]),

    arch:
      z.enum([
        'arm64',
        'x64'
      ]),

    accelerator:
      z.enum([
        'mps',
        'cuda',
        'cpu'
      ]),

    acceleratorName:
      z.string()
        .min(1)
        .max(240)
        .optional(),

    vramBytes:
      bytesSchema
        .optional(),

    systemMemoryBytes:
      bytesSchema
        .optional()
  }).strict()


export const avatarPreviewRuntimeSchema =
  z.object({
    configured:
      z.boolean(),

    available:
      z.boolean(),

    offlineOnly:
      z.literal(true),

    engineId:
      z.string()
        .min(1)
        .max(160)
        .optional(),

    notes:
      z.array(
        z.string()
          .max(1000)
      ).default([])
  }).strict()
  .superRefine(
    (
      value,
      context
    ) => {
      if (
        value.available
        && (
          !value.configured
          || !value.engineId
        )
      ) {
        context.addIssue({
          code:
            'custom',
          message:
            'Available local Avatar preview runtime is internally inconsistent'
        })
      }
    }
  )


const REQUIRED_FINAL_CAPABILITIES = [
  'identity-preservation',
  'scene-video',
  'motion'
] as const


export const avatarLocalGenerativeRuntimeSchema =
  z.object({
    configured:
      z.boolean(),

    available:
      z.boolean(),

    offlineOnly:
      z.literal(true),

    engine:
      avatarEngineDescriptorSchema
        .optional(),

    missing:
      z.array(
        z.string()
          .min(1)
          .max(240)
      ).default([]),

    notes:
      z.array(
        z.string()
          .max(1000)
      ).default([])
  }).strict()
  .superRefine(
    (
      value,
      context
    ) => {
      if (!value.available) {
        return
      }

      if (
        !value.configured
        || !value.engine
        || value.missing.length > 0
      ) {
        context.addIssue({
          code:
            'custom',
          message:
            'Available local generative Avatar runtime is internally inconsistent'
        })

        return
      }

      for (
        const capability
        of REQUIRED_FINAL_CAPABILITIES
      ) {
        if (
          !value.engine
            .capabilities
            .includes(
              capability
            )
        ) {
          context.addIssue({
            code:
              'custom',
            message:
              `Final Avatar engine is missing required capability: ${capability}`
          })
        }
      }

      if (
        value.engine.rights
          .commercialOutput
          !== 'allowed'
      ) {
        context.addIssue({
          code:
            'custom',
          message:
            'Final Avatar engine requires verified commercial-output permission'
        })
      }

      if (
        value.engine.rights
          .commercialSoftwareUse
          !== 'allowed'
      ) {
        context.addIssue({
          code:
            'custom',
          message:
            'Final Avatar engine requires verified commercial-software permission'
        })
      }
    }
  )


export const avatarRenderRuntimeSchema =
  z.object({
    schemaVersion:
      z.literal(1),

    host:
      avatarRenderHostSchema,

    preview:
      avatarPreviewRuntimeSchema,

    localGenerative:
      avatarLocalGenerativeRuntimeSchema
  }).strict()


export type AvatarRenderHost =
  z.infer<
    typeof avatarRenderHostSchema
  >

export type AvatarRenderRuntime =
  z.infer<
    typeof avatarRenderRuntimeSchema
  >


export interface AvatarCloudByokState {
  available: boolean
  userProvidedCredential: boolean
}


export function parseAvatarRenderRuntime(
  value: unknown
): AvatarRenderRuntime {
  return avatarRenderRuntimeSchema.parse(
    value
  )
}


export function avatarRenderAvailabilityFromRuntime(
  runtimeValue: unknown,
  cloud: AvatarCloudByokState = {
    available:
      false,
    userProvidedCredential:
      false
  }
): AvatarRenderAvailability {
  const runtime =
    parseAvatarRenderRuntime(
      runtimeValue
    )

  return {
    localPreview:
      runtime.preview.available,

    localGenerative:
      runtime.localGenerative
        .available,

    cloudByok:
      cloud.available,

    userProvidedCloudCredential:
      cloud.userProvidedCredential
  }
}


export function chooseAvatarRenderForRuntime(
  quality: AvatarRenderQuality,
  runtimeValue: unknown,
  cloud?: AvatarCloudByokState
): AvatarRenderSelection {
  const availability =
    avatarRenderAvailabilityFromRuntime(
      runtimeValue,
      cloud
    )

  return assertNoPlatformInferenceCost(
    chooseAvatarRenderBackend(
      quality,
      availability
    )
  )
}


export function activeLocalGenerativeEngine(
  runtimeValue: unknown
): AvatarEngineDescriptor | undefined {
  const runtime =
    parseAvatarRenderRuntime(
      runtimeValue
    )

  if (
    !runtime.localGenerative
      .available
  ) {
    return undefined
  }

  return runtime
    .localGenerative
    .engine
}
