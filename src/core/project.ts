import { z } from 'zod'

export const assetSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['video', 'image', 'audio', 'caption', 'document', 'other']),
  uri: z.string().min(1),
  managed: z.boolean().default(false),
  offline: z.boolean().default(false),
  metadata: z.record(z.string(), z.unknown()).default({})
})

export const transformKeyframeSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  scale: z.number().min(0.1).max(4)
})

export const clipSchema = z.object({
  id: z.string().min(1),
  assetId: z.string().min(1),
  startMs: z.number().int().nonnegative(),
  durationMs: z.number().int().positive(),
  sourceOffsetMs: z.number().int().nonnegative().default(0),
  gain: z.number().default(1),
  speed: z.number().min(0.25).max(4).default(1),
  motion: z.enum(['zoom-in', 'zoom-out']).optional(),
  /** Which storyboard scene put this clip here, so a replaced visual can find its own clip again. */
  sceneId: z.string().min(1).optional(),
  transform: z.object({
    x: z.number().finite().default(0),
    y: z.number().finite().default(0),
    scale: z.number().min(0.1).max(4).default(1),
    cropLeft: z.number().int().nonnegative().default(0),
    cropTop: z.number().int().nonnegative().default(0),
    cropRight: z.number().int().nonnegative().default(0),
    cropBottom: z.number().int().nonnegative().default(0)
  }).optional(),
  transformKeyframes: z.object({
    start: transformKeyframeSchema,
    end: transformKeyframeSchema
  }).optional(),
  transitionIn: z.object({
    type: z.literal('dissolve'),
    durationMs: z.number().int().min(100).max(5000)
  }).optional(),
  fades: z.object({
    inMs: z.number().int().min(0).max(5000).default(0),
    outMs: z.number().int().min(0).max(5000).default(0)
  }).optional()
})

export const trackSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['video', 'broll', 'image', 'avatar', 'voice', 'dialog', 'music', 'sfx', 'caption', 'overlay']),
  name: z.string().min(1),
  muted: z.boolean().default(false),
  locked: z.boolean().default(false),
  clips: z.array(clipSchema).default([])
})

export const avatarSourceSchema = z.object({
  kind: z.enum([
    'preset',
    'prompt',
    'image',
    'video',
    'multi-reference'
  ]),
  presetId: z.string().min(1).optional(),
  prompt: z.string().max(8000).default(''),
  assetIds: z.array(
    z.string().min(1)
  ).max(12).default([]),
  rights: z.object({
    basis: z.enum([
      'preset',
      'generated',
      'own',
      'authorized'
    ]),
    commercialUseIntended:
      z.boolean().default(true),
    confirmedAt:
      z.string().datetime().optional()
  })
})

export const avatarVersionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1).max(120),
  createdAt: z.string().datetime(),
  parentVersionId: z.string().min(1).optional(),
  source: avatarSourceSchema,
  prompt: z.string().max(8000).default(''),
  editInstruction: z.string().max(8000).default(''),
  previewAssetId: z.string().min(1).optional(),
  outputAssetId: z.string().min(1).optional(),
  metadata: z.record(
    z.string(),
    z.unknown()
  ).default({})
})

export const avatarIdentitySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(80),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  activeVersionId: z.string().min(1),
  versions: z.array(
    avatarVersionSchema
  ).min(1),
  voiceAssetId: z.string().min(1).optional(),
  metadata: z.record(
    z.string(),
    z.unknown()
  ).default({})
})

export const avatarInstanceSchema = z.object({
  id: z.string().min(1),
  avatarId: z.string().min(1),
  versionId: z.string().min(1),
  sceneId: z.string().min(1).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  prompt: z.string().max(8000).default(''),
  environmentPrompt: z.string().max(8000).default(''),
  motionPrompt: z.string().max(8000).default(''),
  expressionPrompt: z.string().max(8000).default(''),
  voiceAssetId: z.string().min(1).optional(),
  outputAssetId: z.string().min(1).optional(),
  metadata: z.record(
    z.string(),
    z.unknown()
  ).default({})
})

export const projectSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  title: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  script: z.string().default(''),
  storyboard: z.array(z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    description: z.string().default(''),
    // Missing means a legacy description-based script; empty means intentionally silent.
    narration: z.string().trim().max(8000).optional(),
    durationMs: z.number().int().positive(),
    assetId: z.string().min(1).optional()
  })).default([]),
  assets: z.array(assetSchema).default([]),
  tracks: z.array(trackSchema).default([]),
  avatars: z.array(
    avatarIdentitySchema
  ).default([]),
  avatarInstances: z.array(
    avatarInstanceSchema
  ).default([]),
  metadata: z.record(z.string(), z.unknown()).default({})
})

export type KinaouProject = z.infer<typeof projectSchema>
export type KinaouAsset = z.infer<typeof assetSchema>
export type TimelineTrack = z.infer<typeof trackSchema>
export type TimelineClip = z.infer<typeof clipSchema>
export type AvatarSource = z.infer<typeof avatarSourceSchema>
export type AvatarVersion = z.infer<typeof avatarVersionSchema>
export type AvatarIdentity = z.infer<typeof avatarIdentitySchema>
export type AvatarInstance = z.infer<typeof avatarInstanceSchema>

export function createProject(title: string, now = new Date()): KinaouProject {
  const timestamp = now.toISOString()
  return projectSchema.parse({
    schemaVersion: 1,
    id: crypto.randomUUID(),
    title,
    createdAt: timestamp,
    updatedAt: timestamp,
    script: '',
    storyboard: [],
    assets: [],
    tracks: [],
    avatars: [],
    avatarInstances: [],
    metadata: {}
  })
}

export function parseProject(value: unknown): KinaouProject {
  return projectSchema.parse(value)
}

export function touchProject(project: KinaouProject, now = new Date()): KinaouProject {
  return { ...project, updatedAt: now.toISOString() }
}
