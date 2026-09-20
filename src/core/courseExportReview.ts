import type { courseLessonChoices } from './course'
import type { RenderRange } from './renderRange'

type Choice = ReturnType<typeof courseLessonChoices>[number]
export interface CourseExportReview { projectId: string; lessonId: string; signature: string }
const signature = (lesson: Choice) => JSON.stringify([lesson.id, lesson.range, lesson.context])
export function reviewCourseExport(projectId: string, lesson: Choice): CourseExportReview {
  if (!lesson.check.valid) throw new Error(lesson.check.reason)
  return { projectId, lessonId: lesson.id, signature: signature(lesson) }
}
/** An invalidated lesson must never silently become a custom-range export. */
export function resolveCourseExportReview(projectId: string, review: CourseExportReview | null, lessons: Choice[], range: RenderRange) {
  if (!review) return { stale: false, lesson: undefined }
  const lesson = lessons.find(value => value.id === review.lessonId)
  if (review.projectId !== projectId || !lesson?.check.valid || signature(lesson) !== review.signature || lesson.range.inMs !== range.inMs || lesson.range.outMs !== range.outMs) return { stale: true, lesson: undefined }
  return { stale: false, lesson }
}
