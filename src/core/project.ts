import { z } from 'zod'

export const assetSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['video', 'image', 'audio', 'caption', 'document', 'other']),
  uri: z.string().min(1),
  managed: z.boolean().default(false),
  offline: z.boolean().default(false),
  metadata: z.record(z.string(), z.unknown()).default({})
})

export const clipSchema = z.object({
  id: z.string().min(1),
  assetId: z.string().min(1),
  startMs: z.number().int().nonnegative(),
  durationMs: z.number().int().positive(),
  sourceOffsetMs: z.number().int().nonnegative().default(0),
  gain: z.number().default(1),
  speed: z.number().positive().default(1),
  transform: z.object({
    x: z.number().finite().default(0),
    y: z.number().finite().default(0),
    scale: z.number().min(0.1).max(4).default(1),
    cropLeft: z.number().int().nonnegative().default(0),
    cropTop: z.number().int().nonnegative().default(0),
    cropRight: z.number().int().nonnegative().default(0),
    cropBottom: z.number().int().nonnegative().default(0)
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
    durationMs: z.number().int().positive()
  })).default([]),
  assets: z.array(assetSchema).default([]),
  tracks: z.array(trackSchema).default([]),
  metadata: z.record(z.string(), z.unknown()).default({})
})

export type KinaouProject = z.infer<typeof projectSchema>
export type KinaouAsset = z.infer<typeof assetSchema>
export type TimelineTrack = z.infer<typeof trackSchema>
export type TimelineClip = z.infer<typeof clipSchema>

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
    metadata: {}
  })
}

export function parseProject(value: unknown): KinaouProject {
  return projectSchema.parse(value)
}

export function touchProject(project: KinaouProject, now = new Date()): KinaouProject {
  return { ...project, updatedAt: now.toISOString() }
}
