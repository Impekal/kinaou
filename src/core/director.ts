import { z } from 'zod'
import { parseProject, type KinaouProject } from './project'

export const directorSceneSchema = z.object({
  id: z.string().min(1).max(120),
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(4000),
  durationMs: z.number().int().min(500).max(3_600_000),
  narration: z.string().trim().max(8000).default(''),
  visualBrief: z.string().trim().max(4000).default(''),
  requiredMedia: z.array(z.enum(['video', 'image', 'voice', 'music', 'sfx'])).max(20).default([])
})

export const directorPlanSchema = z.object({
  schemaVersion: z.literal(1),
  title: z.string().trim().min(1).max(200),
  objective: z.string().trim().min(1).max(4000),
  script: z.string().trim().min(1).max(200_000),
  scenes: z.array(directorSceneSchema).min(1).max(1000),
  provenance: z.object({
    kind: z.enum(['manual', 'local-model']),
    adapterId: z.string().trim().min(1).max(160).optional(),
    modelId: z.string().trim().min(1).max(160).optional()
  }).superRefine((value, context) => {
    if (value.kind === 'local-model' && (!value.adapterId || !value.modelId)) {
      context.addIssue({ code: 'custom', message: 'Local model plans require adapterId and modelId.' })
    }
  })
}).superRefine((plan, context) => {
  const ids = new Set<string>()
  plan.scenes.forEach((scene, index) => {
    if (ids.has(scene.id)) context.addIssue({ code: 'custom', path: ['scenes', index, 'id'], message: 'Scene IDs must be unique.' })
    ids.add(scene.id)
  })
})

export type DirectorPlan = z.infer<typeof directorPlanSchema>

export function parseDirectorPlan(value: unknown): DirectorPlan {
  return directorPlanSchema.parse(value)
}

export function applyDirectorPlan(project: KinaouProject, input: unknown, now = new Date()): KinaouProject {
  const plan = parseDirectorPlan(input)
  return parseProject({
    ...project,
    updatedAt: now.toISOString(),
    script: plan.script,
    storyboard: plan.scenes.map((scene) => ({
      id: scene.id,
      title: scene.title,
      description: scene.description,
      durationMs: scene.durationMs
    })),
    metadata: {
      ...project.metadata,
      directorPlan: plan,
      directorPlanAppliedAt: now.toISOString()
    }
  })
}
