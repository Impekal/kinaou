import { projectCourse, courseExportContextSchema } from './course'
import { formatCourseExercises } from './courseExercises'
import { courseInstructorSignature } from './courseInstructorReview'
import { projectCourseOutputIndex } from './exportHistory'
import type { KinaouProject } from './project'
import { lessonDeliveryRequestSchema, type LessonDeliveryRequest } from './courseLessonDelivery'
import { lessonDeliveryMaterialsSchema, type LessonDeliveryMaterials } from './courseDeliveryMaterialSchema'

export interface CourseDeliveryMaterialReview { readonly source: LessonDeliveryMaterials['source']; readonly files: LessonDeliveryMaterials['files']; readonly exportRevision: number; readonly bytes: number }
const reviews = new WeakMap<CourseDeliveryMaterialReview, { baseline: string; jobId: string; materials: LessonDeliveryMaterials }>()
function freeze<T>(value: T): T { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value) } return value }
async function digest(text: string) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map(byte => byte.toString(16).padStart(2, '0')).join('') }
export async function reviewCourseDeliveryMaterials(project: KinaouProject, jobId: string): Promise<CourseDeliveryMaterialReview> {
  const snapshot = structuredClone(project), baseline = JSON.stringify(project), course = projectCourse(snapshot)
  const receipt = projectCourseOutputIndex(snapshot).find(entry => entry.jobId === jobId), context = receipt?.courseLesson
  const module = course?.modules.find(entry => entry.id === context?.moduleId), lesson = module?.lessons.find(entry => entry.id === context?.lessonId)
  if (!course || !module || !lesson || !context || !receipt || course.id !== context.courseId || course.language !== context.language
    || lesson.range.inMs !== receipt.range.inMs || lesson.range.outMs !== receipt.range.outMs) throw Error('Materials require the same course/lesson, declared language and video range; changed revisions need explicit review')
  const files: Array<{ path: string; text: string }> = [{ path: 'instructor/lesson.json', text: JSON.stringify({ draft: true, expertApproval: false, module: { id: module.id, title: module.title }, lesson }, null, 2) + '\n' }]
  if (lesson.script?.trim()) files.push({ path: 'instructor/script.txt', text: lesson.script })
  for (const material of lesson.materials ?? []) {
    if (!material.body.trim()) throw Error(`Empty saved lesson material: ${material.title}`)
    files.push({ path: `${material.audience}/material-${material.id}.txt`, text: `${material.title}\n\n${material.body}` })
  }
  if (lesson.exercises?.length) {
    files.push({ path: 'learner/worksheet.txt', text: formatCourseExercises(course, lesson.id, 'worksheet').text })
    files.push({ path: 'instructor/answer-key.txt', text: formatCourseExercises(course, lesson.id, 'answer-key').text })
  }
  const source = { context: courseExportContextSchema.parse({ courseId: course.id, moduleId: module.id, lessonId: lesson.id, courseTitle: course.title, moduleTitle: module.title, lessonTitle: lesson.title, outlineRevision: course.revision, language: course.language }), range: lesson.range, projectMetadataSha256: await courseInstructorSignature(snapshot), preparedAt: new Date().toISOString() }
  const materials = lessonDeliveryMaterialsSchema.parse({ acknowledgeTextVideoMatch: true, source, files: await Promise.all(files.map(async file => ({ ...file, sha256: await digest(file.text) }))) })
  const review = freeze({ source: materials.source, files: materials.files, exportRevision: context.outlineRevision, bytes: materials.files.reduce((sum, file) => sum + new TextEncoder().encode(file.text).length, 0) })
  reviews.set(review, { baseline, jobId, materials }); return review
}
export function useReviewedCourseDeliveryMaterials(project: KinaouProject, review: CourseDeliveryMaterialReview, request: LessonDeliveryRequest, acknowledged: boolean): LessonDeliveryRequest {
  const record = reviews.get(review)
  if (!record || !acknowledged || record.baseline !== JSON.stringify(project) || request.projectId !== project.id || request.export.jobId !== record.jobId) throw Error('Review the current lesson files and their video match again')
  const receipt = projectCourseOutputIndex(project).find(entry => entry.jobId === record.jobId)
  if (JSON.stringify(receipt) !== JSON.stringify(request.export)) throw Error('Material review belongs to another export receipt')
  return lessonDeliveryRequestSchema.parse({ ...request, schemaVersion: 2, materials: record.materials })
}
