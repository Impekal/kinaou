import { z } from 'zod'
import { touchProject, type KinaouProject } from './project'
import { contentLanguageSchema, projectContentProfile } from './contentProfile'
import { createRangeRenderPlan, validateRenderRange } from './renderRange'
import type { RenderPlan } from './render'
import { courseDemonstrationSchema, courseDemoEvidenceState, courseEvidenceLimits, courseSourceSchema } from './courseEvidence'
import { courseExerciseLimits, courseExerciseSchema, formatCourseExercises, type CourseExerciseDocument } from './courseExercises'

const id = z.string().regex(/^[a-zA-Z0-9-]{1,100}$/)
const title = z.string().trim().min(1).max(120)
export const courseScriptLimits = { lesson: 20000, course: 200000 } as const
export const courseLessonSchema = z.object({
  id, title, objective: z.string().trim().max(2000),
  // Optional for existing outlines; preserve authored whitespace and language exactly.
  script: z.string().max(courseScriptLimits.lesson).optional(),
  sources: z.array(courseSourceSchema).max(courseEvidenceLimits.sourcesPerLesson).optional(),
  demonstrations: z.array(courseDemonstrationSchema).max(courseEvidenceLimits.demosPerLesson).optional(),
  exercises: z.array(courseExerciseSchema).max(courseExerciseLimits.perLesson).optional(),
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
  const scriptLength = course.modules.reduce((count, module) => count + module.lessons.reduce((sum, lesson) => sum + (lesson.script?.length ?? 0), 0), 0)
  if (scriptLength > courseScriptLimits.course) ctx.addIssue({ code: 'custom', path: ['modules'], message: 'Course scripts can contain at most 200000 characters in total' })
  let evidenceLength = 0
  for (const module of course.modules) for (const lesson of module.lessons) {
    const evidenceIds = [...(lesson.sources ?? []), ...(lesson.demonstrations ?? [])].map(entry => entry.id)
    if (new Set(evidenceIds).size !== evidenceIds.length) ctx.addIssue({ code: 'custom', message: 'Source and demonstration IDs must be unique within each lesson' })
    evidenceLength += JSON.stringify(lesson.sources ?? []).length + JSON.stringify(lesson.demonstrations ?? []).length
  }
  if (evidenceLength > courseEvidenceLimits.courseCharacters) ctx.addIssue({ code: 'custom', path: ['modules'], message: 'Course evidence exceeds the total size limit' })
  let exerciseLength = 0
  for (const module of course.modules) for (const lesson of module.lessons) {
    const exercises = lesson.exercises ?? []
    if (new Set(exercises.map(exercise => exercise.id)).size !== exercises.length) ctx.addIssue({ code: 'custom', message: 'Exercise IDs must be unique within each lesson' })
    exerciseLength += JSON.stringify(exercises).length
  }
  if (exerciseLength > courseExerciseLimits.courseCharacters) ctx.addIssue({ code: 'custom', path: ['modules'], message: 'Course exercises exceed the total size limit' })
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
  for (const module of parsed.modules) for (const lesson of module.lessons) for (const demo of lesson.demonstrations ?? []) {
    if (!demo.evidence) continue
    const previous = current?.modules.flatMap(module => module.lessons).find(entry => entry.id === lesson.id)?.demonstrations?.find(entry => entry.id === demo.id)
    // Retain old references when media becomes offline/missing; never silently rebind them.
    if (JSON.stringify(previous?.evidence) === JSON.stringify(demo.evidence)) continue
    if (courseDemoEvidenceState(project, demo) !== 'linked') throw new Error('A new demonstration reference must match an available managed asset in this project')
  }
  if (current && JSON.stringify(current) === JSON.stringify(parsed)) return project
  return touchProject({ ...project, metadata: { ...project.metadata, courseOutline: { ...parsed, revision: current ? current.revision + 1 : 1 } } }, now)
}

/** Exports only the saved lesson text, never an unsaved UI draft or generated narration. */
export function courseLessonScriptExport(project: KinaouProject, lessonId: string) {
  const course = projectCourse(project)
  const lesson = course?.modules.flatMap(module => module.lessons).find(lesson => lesson.id === lessonId)
  if (!lesson?.script?.trim()) throw new Error('No saved script for this course lesson')
  return { filename: `lesson-${lesson.id}.txt`, text: lesson.script, mimeType: 'text/plain;charset=utf-8' }
}

export function courseLessonExercisesExport(project: KinaouProject, lessonId: string, kind: CourseExerciseDocument) {
  const course = projectCourse(project)
  if (!course) throw new Error('No saved course')
  return formatCourseExercises(course, lessonId, kind)
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
