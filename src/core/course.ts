import { z } from 'zod'
import { touchProject, type KinaouProject } from './project'
import { contentLanguageSchema, projectContentProfile } from './contentProfile'
import { createRangeRenderPlan, validateRenderRange } from './renderRange'
import type { RenderPlan } from './render'

const id = z.string().regex(/^[a-zA-Z0-9-]{1,100}$/)
const title = z.string().trim().min(1).max(120)
export const courseLessonSchema = z.object({
  id, title, objective: z.string().trim().max(2000),
  range: z.object({ inMs: z.number().int().min(0).max(86400000), outMs: z.number().int().positive().max(86400000) }).strict().refine((range) => range.outMs > range.inMs, 'Lesson Out must be later than In')
}).strict()
export const courseOutlineSchema = z.object({
  schemaVersion: z.literal(1), id, revision: z.number().int().positive(), title,
  language: contentLanguageSchema,
  audience: z.string().trim().max(2000), prerequisites: z.string().trim().max(4000), learningOutcomes: z.string().trim().max(8000),
  modules: z.array(z.object({ id, title, lessons: z.array(courseLessonSchema).max(100) }).strict()).max(50)
}).strict().superRefine((course, ctx) => {
  const ids = [course.id, ...course.modules.flatMap((module) => [module.id, ...module.lessons.map((lesson) => lesson.id)])]
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', message: 'Course, module and lesson IDs must be unique' })
  if (course.modules.reduce((count, module) => count + module.lessons.length, 0) > 200) ctx.addIssue({ code: 'custom', message: 'A course can contain at most 200 lessons' })
})
export type CourseOutline = z.infer<typeof courseOutlineSchema>
export type CourseLesson = z.infer<typeof courseLessonSchema>

// A receipt describes the outline at submission, not a mutable/current approval status.
export const courseExportContextSchema = z.object({
  courseId: id, moduleId: id, lessonId: id, outlineRevision: z.number().int().positive(),
  courseTitle: title, moduleTitle: title, lessonTitle: title, language: contentLanguageSchema
}).strict()

export function projectCourse(project: KinaouProject): CourseOutline | null {
  if (!Object.hasOwn(project.metadata, 'courseOutline')) return null
  const parsed = courseOutlineSchema.safeParse(project.metadata.courseOutline)
  if (!parsed.success) throw new Error('Saved course outline is invalid. Restore a valid version before editing; it has not been overwritten.')
  return parsed.data
}

export function newCourseOutline(project: KinaouProject): CourseOutline {
  const profile = projectContentProfile(project)
  return { schemaVersion: 1, id: crypto.randomUUID(), revision: 1, title: project.title.slice(0, 120), language: profile.outputLanguage, audience: profile.audience, prerequisites: '', learningOutcomes: '', modules: [] }
}

export function saveCourseOutline(project: KinaouProject, value: CourseOutline, now = new Date()): KinaouProject {
  const current = projectCourse(project)
  const parsed = courseOutlineSchema.parse(value)
  if (current && (current.id !== parsed.id || current.revision !== parsed.revision)) throw new Error('The saved course changed. Reload the outline before saving your edits.')
  if (current && JSON.stringify(current) === JSON.stringify(parsed)) return project
  return touchProject({ ...project, metadata: { ...project.metadata, courseOutline: { ...parsed, revision: current ? current.revision + 1 : 1 } } }, now)
}

export function courseLessonChoices(project: KinaouProject, timelineDurationMs: number) {
  const course = projectCourse(project)
  return course?.modules.flatMap((module, moduleIndex) => module.lessons.map((lesson, lessonIndex) => ({
    ...lesson,
    label: `${moduleIndex + 1}.${lessonIndex + 1} · ${module.title} / ${lesson.title}`,
    check: validateRenderRange(lesson.range, timelineDurationMs),
    context: courseExportContextSchema.parse({ courseId: course.id, moduleId: module.id, lessonId: lesson.id, outlineRevision: course.revision, courseTitle: course.title, moduleTitle: module.title, lessonTitle: lesson.title, language: course.language })
  }))) ?? []
}

export function planCourseLessonExport(project: KinaouProject, lessonId: string, fullPlan: RenderPlan, outputRelativePath: string) {
  if (fullPlan.projectId !== project.id || fullPlan.purpose !== 'export') throw new Error('Lesson export requires this project’s export plan')
  const lesson = courseLessonChoices(project, fullPlan.durationMs).find((entry) => entry.id === lessonId)
  if (!lesson) throw new Error('Saved course lesson not found')
  if (!lesson.check.valid) throw new Error(lesson.check.reason)
  return { plan: createRangeRenderPlan(fullPlan, lesson.range, outputRelativePath), context: lesson.context, range: { ...lesson.range }, label: `Lesson · ${lesson.title}` }
}
