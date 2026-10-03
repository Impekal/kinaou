import { z } from 'zod'
import { courseCurriculumContextSchema, courseCurriculumProposalSchema, validateCourseCurriculumContext, validateCourseCurriculumProposal, type CourseCurriculumContext, type CourseCurriculumProposal } from '../../worker/course-curriculum.mjs'
import { courseOutlineSchema, projectCourse, saveCourseOutline } from './course'
import { parseProject, type KinaouProject } from './project'
export type { CourseCurriculumContext, CourseCurriculumProposal } from '../../worker/course-curriculum.mjs'

const resultSchema = z.object({ proposal: courseCurriculumProposalSchema, modelId: z.string().trim().min(1).max(200), adapterId: z.literal('ollama') }).strict()
export type CourseCurriculumResult = z.infer<typeof resultSchema>
export function courseCurriculumContext(project: KinaouProject, sourceNotes: string, lessonCount: number): CourseCurriculumContext {
  const course = projectCourse(project); if (!course) throw Error('Save a course before drafting its curriculum')
  return validateCourseCurriculumContext({ schemaVersion: 1, courseId: course.id, revision: course.revision, language: course.language, courseTitle: course.title, audience: course.audience, prerequisites: course.prerequisites, learningOutcomes: course.learningOutcomes, sourceNotes, lessonCount })
}
export function parseCourseCurriculumResult(context: CourseCurriculumContext, input: unknown, expectedModel: string): CourseCurriculumResult {
  const result = resultSchema.parse(input); if (result.modelId !== expectedModel) throw Error('Curriculum response model mismatch')
  validateCourseCurriculumProposal(context, result.proposal); return result
}
const timingSchema = z.object({ startMs: z.number().int().min(0).max(86400000), slotMs: z.number().int().positive().max(86400000) }).strict()
export type CourseCurriculumTiming = z.infer<typeof timingSchema>
const moduleSchema = courseOutlineSchema.shape.modules.element
const recordSchema = z.object({ schemaVersion: z.literal(1), projectId: z.string().min(1), savedAt: z.string().datetime(), context: courseCurriculumContextSchema, generated: courseCurriculumProposalSchema, accepted: courseCurriculumProposalSchema, timing: timingSchema, modules: z.array(moduleSchema).min(1).max(3), modelId: z.string().trim().min(1).max(200), adapterId: z.literal('ollama'), edited: z.boolean() }).strict()
export type CourseCurriculumRecord = z.infer<typeof recordSchema>
function validateRecord(project: KinaouProject, input: unknown): CourseCurriculumRecord {
  const record = recordSchema.parse(input)
  if (new TextEncoder().encode(JSON.stringify(record)).length > 200000 || record.projectId !== project.id) throw Error('Invalid curriculum provenance size or project')
  validateCourseCurriculumProposal(record.context, record.generated); validateCourseCurriculumProposal(record.context, record.accepted)
  if (record.edited !== (JSON.stringify(record.generated) !== JSON.stringify(record.accepted))) throw Error('Invalid curriculum edit provenance')
  let index = 0
  const expected = record.accepted.modules.map((module, m) => ({ id: record.modules[m]?.id, title: module.title, lessons: module.lessons.map((lesson, l) => { const inMs = record.timing.startMs + index++ * record.timing.slotMs; return { id: record.modules[m]?.lessons[l]?.id, title: lesson.title, objective: lesson.objective, range: { inMs, outMs: inMs + record.timing.slotMs } } }) }))
  if (JSON.stringify(record.modules) !== JSON.stringify(expected)) throw Error('Invalid curriculum module/range provenance')
  courseOutlineSchema.parse({ schemaVersion: 1, id: record.context.courseId, revision: record.context.revision, title: record.context.courseTitle, language: record.context.language, audience: record.context.audience, prerequisites: record.context.prerequisites, learningOutcomes: record.context.learningOutcomes, modules: record.modules })
  return record
}
/** Latest batch only. Earlier accepted batches remain in the outline and safety history. */
export function projectCourseCurriculumRecord(project: KinaouProject) { return project.metadata.courseCurriculumDraft === undefined ? null : validateRecord(project, project.metadata.courseCurriculumDraft) }
export interface CourseCurriculumReview { readonly record: CourseCurriculumRecord }
interface Binding { baseline: string; record: string; next: KinaouProject; snapshotDone: boolean; done: boolean }
const bindings = new WeakMap<CourseCurriculumReview, Binding>()
export function reviewCourseCurriculum(project: KinaouProject, context: CourseCurriculumContext, generated: CourseCurriculumResult, input: CourseCurriculumProposal, timingInput: CourseCurriculumTiming): CourseCurriculumReview {
  if (JSON.stringify(context) !== JSON.stringify(courseCurriculumContext(project, context.sourceNotes, context.lessonCount))) throw Error('Saved course changed; generate a fresh curriculum')
  projectCourseCurriculumRecord(project)
  const result = parseCourseCurriculumResult(context, generated, generated.modelId), accepted = validateCourseCurriculumProposal(context, input), timing = timingSchema.parse(timingInput), course = projectCourse(project)!
  let index = 0
  const modules = accepted.modules.map(module => ({ id: crypto.randomUUID(), title: module.title, lessons: module.lessons.map(lesson => { const inMs = timing.startMs + index++ * timing.slotMs; return { id: crypto.randomUUID(), title: lesson.title, objective: lesson.objective, range: { inMs, outMs: inMs + timing.slotMs } } }) }))
  const oldLessons = course.modules.flatMap(module => module.lessons), newLessons = modules.flatMap(module => module.lessons), normalized = (text: string) => text.normalize('NFKC').toLowerCase()
  if (modules.some(module => course.modules.some(old => normalized(old.title) === normalized(module.title))) || newLessons.some(lesson => oldLessons.some(old => normalized(old.title) === normalized(lesson.title)))) throw Error('New module or lesson title already exists; edit the proposal')
  if (newLessons.some(lesson => oldLessons.some(old => lesson.range.inMs < old.range.outMs && old.range.inMs < lesson.range.outMs))) throw Error('Planned lesson ranges overlap existing lessons; choose another start')
  const savedAt = new Date().toISOString(), record = validateRecord(project, { schemaVersion: 1, projectId: project.id, savedAt, context, generated: result.proposal, accepted, timing, modules, modelId: result.modelId, adapterId: result.adapterId, edited: JSON.stringify(result.proposal) !== JSON.stringify(accepted) })
  const nextCourse = saveCourseOutline(project, { ...course, modules: [...course.modules, ...modules] }, new Date(savedAt))
  const next = parseProject({ ...nextCourse, metadata: { ...nextCourse.metadata, courseCurriculumDraft: record } })
  const review = Object.freeze({ record }); bindings.set(review, { baseline: JSON.stringify(project), record: JSON.stringify(record), next, snapshotDone: false, done: false }); return review
}
export function courseCurriculumReviewIsCurrent(project: KinaouProject, review: CourseCurriculumReview, dirty = false) {
  const binding = bindings.get(review); if (!binding || binding.done) return false
  if (dirty || binding.baseline !== JSON.stringify(project) || binding.record !== JSON.stringify(review.record)) { bindings.delete(review); return false }
  return true
}
export function commitCourseCurriculum(project: KinaouProject, review: CourseCurriculumReview, acknowledged: boolean, deps: { snapshot: (project: KinaouProject) => void; persist: (project: KinaouProject) => void }): KinaouProject {
  if (!acknowledged || !courseCurriculumReviewIsCurrent(project, review)) throw Error('Current curriculum review and acknowledgement required')
  const binding = bindings.get(review)!
  if (!binding.snapshotDone) { deps.snapshot(project); binding.snapshotDone = true }
  deps.persist(binding.next); binding.done = true; return binding.next
}
