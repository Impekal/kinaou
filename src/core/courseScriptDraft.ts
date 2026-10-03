import { z } from 'zod'
import { courseScriptContextSchema, courseScriptProposalSchema, validateCourseScriptProposal, type CourseScriptContext, type CourseScriptProposal } from '../../worker/course-script.mjs'
import { projectCourse, saveCourseOutline } from './course'
import { parseProject, type KinaouProject } from './project'
export type { CourseScriptContext, CourseScriptProposal } from '../../worker/course-script.mjs'

const resultSchema = z.object({ proposal: courseScriptProposalSchema, modelId: z.string().trim().min(1).max(200), adapterId: z.literal('ollama') }).strict()
export type CourseScriptResult = z.infer<typeof resultSchema>
export function courseScriptContext(project: KinaouProject, lessonId: string, sourceNotes: string): CourseScriptContext {
  const course = projectCourse(project), lesson = course?.modules.flatMap(module => module.lessons).find(item => item.id === lessonId)
  if (!course || !lesson) throw Error('Choose a saved lesson before preparing a script')
  return courseScriptContextSchema.parse({ schemaVersion: 1, courseId: course.id, lessonId, revision: course.revision, language: course.language, courseTitle: course.title, lessonTitle: lesson.title, audience: course.audience, objective: lesson.objective, sourceNotes })
}
export function parseCourseScriptResult(context: CourseScriptContext, input: unknown, expectedModel: string): CourseScriptResult {
  const result = resultSchema.parse(input)
  if (result.modelId !== expectedModel) throw Error('Script response does not match the selected model')
  validateCourseScriptProposal(context, result.proposal); return result
}
export function courseScriptText(proposal: CourseScriptProposal) { return courseScriptProposalSchema.parse(proposal).paragraphs.map(item => item.text).join('\n\n') }
const recordSchema = z.object({ schemaVersion: z.literal(1), projectId: z.string().min(1), savedAt: z.string().datetime(), context: courseScriptContextSchema, previousScript: z.string().max(20000), generated: courseScriptProposalSchema, accepted: courseScriptProposalSchema, modelId: z.string().trim().min(1).max(200), adapterId: z.literal('ollama'), edited: z.boolean() }).strict()
export type CourseScriptRecord = z.infer<typeof recordSchema>
const ledgerSchema = z.object({ schemaVersion: z.literal(1), records: z.array(recordSchema).max(200) }).strict()
function validateLedger(projectId: string, input: unknown): CourseScriptRecord[] {
  const ledger = ledgerSchema.parse(input), ids = new Set<string>()
  if (new TextEncoder().encode(JSON.stringify(ledger)).length > 4_000_000) throw Error('Script provenance exceeds 4,000,000 bytes; preserve a backup before changing records')
  for (const record of ledger.records) {
    const key = JSON.stringify([record.context.courseId, record.context.lessonId])
    if (record.projectId !== projectId || ids.has(key)) throw Error('Invalid script provenance identity')
    ids.add(key); validateCourseScriptProposal(record.context, record.generated); validateCourseScriptProposal(record.context, record.accepted)
    if (record.edited !== (JSON.stringify(record.generated) !== JSON.stringify(record.accepted))) throw Error('Invalid script edit provenance')
  }
  return ledger.records
}
export function projectCourseScriptRecords(project: KinaouProject) { return project.metadata.courseScriptDrafts === undefined ? [] : validateLedger(project.id, project.metadata.courseScriptDrafts) }
export interface CourseScriptReview { readonly record: CourseScriptRecord; readonly script: string }
interface Binding { baseline: string; record: string; snapshotDone: boolean; next?: KinaouProject; done: boolean }
const bindings = new WeakMap<CourseScriptReview, Binding>()
export function reviewCourseScript(project: KinaouProject, context: CourseScriptContext, generated: CourseScriptResult, input: CourseScriptProposal): CourseScriptReview {
  if (JSON.stringify(context) !== JSON.stringify(courseScriptContext(project, context.lessonId, context.sourceNotes))) throw Error('Saved lesson changed; generate a fresh draft')
  projectCourseScriptRecords(project)
  const result = parseCourseScriptResult(context, generated, generated.modelId), accepted = validateCourseScriptProposal(context, input)
  const previousScript = projectCourse(project)!.modules.flatMap(module => module.lessons).find(lesson => lesson.id === context.lessonId)!.script ?? ''
  const record = recordSchema.parse({ schemaVersion: 1, projectId: project.id, savedAt: new Date().toISOString(), context, previousScript, generated: result.proposal, accepted, modelId: result.modelId, adapterId: result.adapterId, edited: JSON.stringify(result.proposal) !== JSON.stringify(accepted) })
  const review = Object.freeze({ record, script: courseScriptText(accepted) }); bindings.set(review, { baseline: JSON.stringify(project), record: JSON.stringify(record), snapshotDone: false, done: false }); return review
}
export function courseScriptReviewIsCurrent(project: KinaouProject, review: CourseScriptReview, dirty = false) {
  const binding = bindings.get(review)
  if (!binding || binding.done) return false
  if (dirty || binding.baseline !== JSON.stringify(project) || binding.record !== JSON.stringify(review.record) || review.script !== courseScriptText(review.record.accepted)) { bindings.delete(review); return false }
  return true
}
/** Exact one-lesson replacement, one safety snapshot, save-only retry. No media/job changes. */
export function commitCourseScript(project: KinaouProject, review: CourseScriptReview, acknowledged: boolean, deps: { snapshot: (project: KinaouProject) => void; persist: (project: KinaouProject) => void }): KinaouProject {
  if (!acknowledged || !courseScriptReviewIsCurrent(project, review)) throw Error('A current unchanged script review and acknowledgement are required')
  const binding = bindings.get(review)!
  if (!binding.next) {
    const course = projectCourse(project)!, record = review.record
    const records = projectCourseScriptRecords(project).filter(item => item.context.courseId !== record.context.courseId || item.context.lessonId !== record.context.lessonId)
    records.push(record); const ledger = { schemaVersion: 1, records }; validateLedger(project.id, ledger)
    const next = saveCourseOutline(project, { ...course, modules: course.modules.map(module => ({ ...module, lessons: module.lessons.map(lesson => lesson.id === record.context.lessonId ? { ...lesson, script: review.script } : lesson) })) }, new Date(record.savedAt))
    binding.next = parseProject({ ...next, updatedAt: record.savedAt, metadata: { ...next.metadata, courseScriptDrafts: ledger } })
  }
  if (!binding.snapshotDone) { deps.snapshot(project); binding.snapshotDone = true }
  deps.persist(binding.next); binding.done = true; return binding.next
}
