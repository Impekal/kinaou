import { z } from 'zod'
export const courseMaterialLimits = { perLesson: 10, body: 20000, courseCharacters: 400000 } as const
export const courseMaterialSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9-]{1,100}$/),
  title: z.string().trim().min(1).max(120),
  audience: z.enum(['learner', 'instructor']),
  body: z.string().max(courseMaterialLimits.body)
}).strict()
export type CourseMaterial = z.infer<typeof courseMaterialSchema>
