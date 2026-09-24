import {
  z
} from 'zod'

const modelSchema =
  z.object({
    repoId:
      z.string().min(1),
    available:
      z.boolean(),
    snapshot:
      z.string().optional(),
    revision:
      z.string().optional()
  }).strict()

export const avatarIdentityRuntimeSchema =
  z.object({
    configured:
      z.boolean(),
    available:
      z.boolean(),
    offlineOnly:
      z.literal(true),
    adapterId:
      z.literal(
        'sdxl-ip-adapter-plus-face'
      ),
    device:
      z.enum([
        'mps',
        'cpu'
      ]),
    pythonVersion:
      z.string().optional(),
    packageVersions:
      z.record(
        z.string(),
        z.string().nullable()
      ),
    models:
      z.object({
        baseModel:
          modelSchema,
        ipAdapter:
          modelSchema
      }).strict(),
    missing:
      z.array(
        z.string().min(1)
      ),
    notes:
      z.array(
        z.string()
      ),
    rightsReview:
      z.object({
        baseModelLicense:
          z.literal(
            'CreativeML Open RAIL++-M'
          ),
        adapterLicense:
          z.literal(
            'Apache-2.0'
          ),
        commercialOutput:
          z.literal(
            'pending-verification'
          )
      }).strict()
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
          || value.missing.length
            > 0
          || !value.models
            .baseModel
            .available
          || !value.models
            .ipAdapter
            .available
        )
      ) {
        context.addIssue({
          code: 'custom',
          message:
            'Available avatar identity runtime is internally inconsistent'
        })
      }
    }
  )

export type AvatarIdentityRuntime =
  z.infer<
    typeof avatarIdentityRuntimeSchema
  >
