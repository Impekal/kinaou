import { z } from 'zod'
import { courseExerciseContextSchema, courseExerciseProposalSchema, validateCourseExerciseProposal, type CourseExerciseContext, type CourseExerciseProposal } from '../../worker/course-exercise.mjs'
import { projectCourse, saveCourseOutline } from './course'
import { courseExerciseLimits, courseExerciseSchema } from './courseExercises'
import { parseProject, type KinaouProject } from './project'
export type { CourseExerciseContext, CourseExerciseProposal } from '../../worker/course-exercise.mjs'

const resultSchema = z.object({ proposal: courseExerciseProposalSchema, modelId: z.string().trim().min(1).max(200), adapterId: z.literal('ollama') }).strict()
export type CourseExerciseResult = z.infer<typeof resultSchema>
export function courseExerciseContext(project: KinaouProject, lessonId: string, count: number): CourseExerciseContext {
  const course = projectCourse(project), lesson = course?.modules.flatMap(module => module.lessons).find(item => item.id === lessonId)
  if (!course || !lesson) throw Error('Choose a saved lesson before preparing exercises')
  if ((lesson.exercises?.length ?? 0) + count > courseExerciseLimits.perLesson) throw Error('This lesson has insufficient room for the requested exercises')
  return courseExerciseContextSchema.parse({ schemaVersion: 1, courseId: course.id, lessonId, revision: course.revision, language: course.language, courseTitle: course.title, lessonTitle: lesson.title, audience: course.audience, objective: lesson.objective, script: lesson.script ?? '', count })
}
export function parseCourseExerciseResult(context: CourseExerciseContext, input: unknown, expectedModel: string): CourseExerciseResult {
  const result = resultSchema.parse(input)
  if (result.modelId !== expectedModel) throw Error('Exercise response does not match the selected model')
  validateCourseExerciseProposal(context, result.proposal); return result
}
const recordSchema = z.object({ schemaVersion: z.literal(1), projectId: z.string().min(1), savedAt: z.string().datetime(), context: courseExerciseContextSchema, generated: courseExerciseProposalSchema, accepted: courseExerciseProposalSchema, exerciseIds: z.array(courseExerciseSchema.shape.id).min(1).max(3), modelId: z.string().trim().min(1).max(200), adapterId: z.literal('ollama'), edited: z.boolean() }).strict()
export type CourseExerciseRecord = z.infer<typeof recordSchema>
const ledgerSchema = z.object({ schemaVersion: z.literal(1), records: z.array(recordSchema).max(200) }).strict()
function validateLedger(projectId: string, input: unknown): CourseExerciseRecord[] {
  const ledger = ledgerSchema.parse(input), ids = new Set<string>(), exerciseIds = new Set<string>()
  if (new TextEncoder().encode(JSON.stringify(ledger)).length > 4_000_000) throw Error('Exercise provenance exceeds 4,000,000 bytes; preserve a backup before changing records')
  for (const record of ledger.records) {
    const key = JSON.stringify([record.context.courseId, record.context.lessonId])
    if (record.projectId !== projectId || ids.has(key)) throw Error('Invalid exercise provenance identity')
    ids.add(key); validateCourseExerciseProposal(record.context, record.generated); validateCourseExerciseProposal(record.context, record.accepted)
    if (record.edited !== (JSON.stringify(record.generated) !== JSON.stringify(record.accepted)) || record.exerciseIds.length !== record.accepted.exercises.length) throw Error('Invalid exercise edit provenance')
    for (const id of record.exerciseIds) { if (exerciseIds.has(id)) throw Error('Duplicate provenance exercise identity'); exerciseIds.add(id) }
  }
  return ledger.records
}
export function projectCourseExerciseRecords(project: KinaouProject) { return project.metadata.courseExerciseDrafts === undefined ? [] : validateLedger(project.id, project.metadata.courseExerciseDrafts) }
export interface CourseExerciseReview { readonly record: CourseExerciseRecord }
interface Binding { baseline: string; record: string; snapshotDone: boolean; next?: KinaouProject; done: boolean }
const bindings = new WeakMap<CourseExerciseReview, Binding>()
const normalizedPrompt = (value: string) => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en')
export function reviewCourseExercises(project: KinaouProject, context: CourseExerciseContext, generated: CourseExerciseResult, input: CourseExerciseProposal): CourseExerciseReview {
  if (JSON.stringify(context) !== JSON.stringify(courseExerciseContext(project, context.lessonId, context.count))) throw Error('Saved lesson changed; generate fresh exercises')
  projectCourseExerciseRecords(project)
  const result = parseCourseExerciseResult(context, generated, generated.modelId), accepted = validateCourseExerciseProposal(context, input)
  const lesson = projectCourse(project)!.modules.flatMap(module => module.lessons).find(item => item.id === context.lessonId)!
  const existing = new Set((lesson.exercises ?? []).map(item => normalizedPrompt(item.prompt)))
  if (accepted.exercises.some(item => existing.has(normalizedPrompt(item.prompt)))) throw Error('An exercise with this prompt is already saved; edit the duplicate before reviewing')
  const record = recordSchema.parse({ schemaVersion: 1, projectId: project.id, savedAt: new Date().toISOString(), context, generated: result.proposal, accepted, exerciseIds: accepted.exercises.map(() => crypto.randomUUID()), modelId: result.modelId, adapterId: result.adapterId, edited: JSON.stringify(result.proposal) !== JSON.stringify(accepted) })
  const review = Object.freeze({ record }); bindings.set(review, { baseline: JSON.stringify(project), record: JSON.stringify(record), snapshotDone: false, done: false }); return review
}
export function courseExerciseReviewIsCurrent(project: KinaouProject, review: CourseExerciseReview, dirty = false) {
  const binding = bindings.get(review)
  if (!binding || binding.done) return false
  if (dirty || binding.baseline !== JSON.stringify(project) || binding.record !== JSON.stringify(review.record)) { bindings.delete(review); return false }
  return true
}
/** Append to one exact saved lesson; no replacements, media changes or automatic re-generation on retry. */
export function commitCourseExercises(project: KinaouProject, review: CourseExerciseReview, acknowledged: boolean, deps: { snapshot: (project: KinaouProject) => void; persist: (project: KinaouProject) => void }): KinaouProject {
  if (!acknowledged || !courseExerciseReviewIsCurrent(project, review)) throw Error('A current unchanged exercise review and acknowledgement are required')
  const binding = bindings.get(review)!
  if (!binding.next) {
    const course = projectCourse(project)!, record = review.record
    const records = projectCourseExerciseRecords(project).filter(item => item.context.courseId !== record.context.courseId || item.context.lessonId !== record.context.lessonId)
    records.push(record); const ledger = { schemaVersion: 1, records }; validateLedger(project.id, ledger)
    const exercises = record.accepted.exercises.map(({ sourceQuote: _source, ...item }, index) => courseExerciseSchema.parse({ ...item, id: record.exerciseIds[index] }))
    const next = saveCourseOutline(project, { ...course, modules: course.modules.map(module => ({ ...module, lessons: module.lessons.map(lesson => lesson.id === record.context.lessonId ? { ...lesson, exercises: [...(lesson.exercises ?? []), ...exercises] } : lesson) })) }, new Date(record.savedAt))
    binding.next = parseProject({ ...next, updatedAt: record.savedAt, metadata: { ...next.metadata, courseExerciseDrafts: ledger } })
  }
  if (!binding.snapshotDone) { deps.snapshot(project); binding.snapshotDone = true }
  deps.persist(binding.next); binding.done = true; return binding.next
}
