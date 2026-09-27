import { courseLessonChoices, projectCourse } from './course'
import type { KinaouProject } from './project'
import { bindCourseNarration } from './courseNarration'

export type CourseProductionTarget = 'narration' | 'export'
export interface CourseProductionHandoff {
  readonly projectId: string
  readonly target: CourseProductionTarget
  readonly lessonId: string
  readonly label: string
  readonly language: string
  readonly revision: number
}
const bindings = new WeakMap<CourseProductionHandoff, string>()
export function courseProductionChoices(project: KinaouProject) {
  const duration = project.tracks.flatMap(track => track.muted ? [] : track.clips).reduce((end, clip) => Math.max(end, clip.startMs + clip.durationMs), 0)
  return courseLessonChoices(project, duration)
}
/** In-memory handoff only: no project writes, browser persistence, jobs or automatic text loading. */
export function createCourseProductionHandoff(project: KinaouProject, lessonId: string, target: CourseProductionTarget): CourseProductionHandoff {
  if (target !== 'narration' && target !== 'export') throw new Error('Unknown course production destination')
  const course = projectCourse(project), lesson = courseProductionChoices(project).find(entry => entry.id === lessonId)
  if (!course || !lesson) throw new Error('Select a saved course lesson')
  if (target === 'narration') bindCourseNarration(project, lessonId)
  if (target === 'export' && !lesson.check.valid) throw new Error(lesson.check.reason)
  const handoff = Object.freeze({ projectId: project.id, target, lessonId, label: lesson.label, language: course.language, revision: course.revision })
  bindings.set(handoff, JSON.stringify(project))
  return handoff
}
/** Full saved-project binding deliberately invalidates even same-revision edits; not media-byte verification. */
export function resolveCourseProductionHandoff(project: KinaouProject, handoff: CourseProductionHandoff, target: CourseProductionTarget) {
  if (!bindings.has(handoff) || handoff.target !== target || handoff.projectId !== project.id || bindings.get(handoff) !== JSON.stringify(project)) {
    bindings.delete(handoff) // Observed invalidation is permanent, including A → B → A.
    throw new Error('Course production handoff is no longer current; select the saved lesson again in Course')
  }
  const lesson = courseProductionChoices(project).find(entry => entry.id === handoff.lessonId)
  if (!lesson) throw new Error('Saved course lesson is unavailable')
  if (target === 'narration') bindCourseNarration(project, lesson.id)
  if (target === 'export' && !lesson.check.valid) throw new Error(lesson.check.reason)
  return lesson
}
