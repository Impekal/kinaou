import { z } from 'zod'
import { projectCourse } from './course'
import { touchProject, type KinaouProject } from './project'

export const courseInstructorChecks = ['accuracy', 'demonstrations', 'exercises'] as const
const checksSchema = z.object({ accuracy: z.literal(true), demonstrations: z.literal(true), exercises: z.literal(true) }).strict()
export const courseInstructorInputSchema = z.object({
  reviewer: z.string().trim().min(1).max(120),
  notes: z.string().trim().min(1).max(4000),
  checks: checksSchema
}).strict()
export type CourseInstructorInput = z.infer<typeof courseInstructorInputSchema>
const recordSchema = courseInstructorInputSchema.extend({
  projectId: z.string().min(1), courseId: z.string().min(1), lessonId: z.string().min(1),
  outlineRevision: z.number().int().positive(), reviewedAt: z.string().datetime(),
  signature: z.string().regex(/^[a-f0-9]{64}$/),
  scope: z.literal('course-project-metadata-v1')
}).strict()
const ledgerSchema = z.object({ schemaVersion: z.literal(1), records: z.array(recordSchema).max(200) }).strict().superRefine((ledger, ctx) => {
  const ids = ledger.records.map(record => JSON.stringify([record.courseId, record.lessonId]))
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', message: 'Duplicate lesson review records' })
})
export type CourseInstructorReview = z.infer<typeof recordSchema>
const key = 'courseInstructorReviews'
export function projectCourseInstructorReviews(project: KinaouProject): CourseInstructorReview[] {
  if (!Object.hasOwn(project.metadata, key)) return []
  const result = ledgerSchema.safeParse(project.metadata[key])
  if (!result.success) throw new Error('Saved instructor review records are invalid; restore a valid project version')
  return result.data.records
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value === null || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([name, entry]) => [name, canonical(entry)]))
}
/** Conservative metadata snapshot, not a hash/check of media bytes or external web sources. */
export async function courseInstructorSignature(project: KinaouProject): Promise<string> {
  if (!projectCourse(project)) throw new Error('Save a course before recording its review')
  const { [key]: _reviews, ...metadata } = project.metadata
  const { createdAt: _created, updatedAt: _updated, metadata: _metadata, ...content } = project
  const serialized = JSON.stringify(canonical({ ...content, metadata }))
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(serialized))
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}
export function courseInstructorReviewState(project: KinaouProject, lessonId: string, signature: string): 'none' | 'current' | 'stale' {
  const course = projectCourse(project)
  const review = projectCourseInstructorReviews(project).find(record => record.courseId === course?.id && record.lessonId === lessonId)
  if (!review) return 'none'
  return review.projectId === project.id && course?.modules.some(module => module.lessons.some(lesson => lesson.id === lessonId))
    && review.outlineRevision === course.revision && review.signature === signature ? 'current' : 'stale'
}
export async function recordCourseInstructorReview(project: KinaouProject, lessonId: string, input: CourseInstructorInput, now = new Date()): Promise<KinaouProject> {
  const course = projectCourse(project)
  if (!course?.modules.some(module => module.lessons.some(lesson => lesson.id === lessonId))) throw new Error('Select an existing saved lesson')
  const parsed = courseInstructorInputSchema.parse(input)
  const records = projectCourseInstructorReviews(project)
  const signature = await courseInstructorSignature(project)
  const record = recordSchema.parse({ ...parsed, projectId: project.id, courseId: course.id, lessonId,
    outlineRevision: course.revision, signature, reviewedAt: now.toISOString(), scope: 'course-project-metadata-v1' })
  const ledger = ledgerSchema.parse({ schemaVersion: 1, records: [...records.filter(entry => entry.courseId !== course.id || entry.lessonId !== lessonId), record] })
  return touchProject({ ...project, metadata: { ...project.metadata, [key]: ledger } }, now)
}
export function clearCourseInstructorReviews(project: KinaouProject): KinaouProject {
  projectCourseInstructorReviews(project) // Never silently replace corrupt data.
  if (!Object.hasOwn(project.metadata, key)) return project
  const { [key]: _reviews, ...metadata } = project.metadata
  return touchProject({ ...project, metadata })
}

/** A late digest must never overwrite newer project data or a detached UI. */
export class CourseInstructorReviewSession {
  private current: KinaouProject | null = null
  private generation = 0
  constructor(private readonly prepare = recordCourseInstructorReview) {}
  bind(project: KinaouProject) {
    if (this.current !== project) { this.current = project; this.generation++ }
  }
  detach() { this.current = null; this.generation++ }
  async record(project: KinaouProject, lessonId: string, input: CourseInstructorInput, commit: (next: KinaouProject) => void): Promise<boolean> {
    if (this.current !== project) return false
    const generation = ++this.generation
    const next = await this.prepare(project, lessonId, input)
    if (this.current !== project || this.generation !== generation) return false
    commit(next) // Caller snapshots and persists synchronously; failures propagate without success.
    return true
  }
}
