import { projectCourse, saveCourseOutline } from './course'
import { inspectCourseNarrationSource } from './courseNarrationPlacement'
import type { KinaouProject } from './project'

export class CourseNarrationRangeError extends Error {
  constructor(readonly code: 'notNeeded' | 'collision' | 'placed' | 'boundary' | 'stale') { super(`Course narration range: ${code}`) }
}
export interface CourseNarrationRangeReview { readonly assetId: string; readonly lessonId: string; readonly lessonTitle: string; readonly startMs: number; readonly previousEndMs: number; readonly endMs: number; readonly durationMs: number; readonly sourceRevision: number; readonly currentRevision: number }
interface Binding { baseline: string; next: KinaouProject; snapshotDone: boolean; done: boolean }
const reviews = new WeakMap<CourseNarrationRangeReview, Binding>()
function fail(code: CourseNarrationRangeError['code']): never { throw new CourseNarrationRangeError(code) }

/** Extends only the saved lesson out point. Never places, moves, trims or generates media. */
export function reviewCourseNarrationRange(project: KinaouProject, assetId: string): CourseNarrationRangeReview {
  const { asset, course, lesson, source, startMs, endMs, durationMs } = inspectCourseNarrationSource(project, assetId)
  if (endMs <= lesson.range.outMs) fail('notNeeded')
  if (!Number.isSafeInteger(endMs) || endMs > 86400000) fail('boundary')
  if (project.tracks.some(track => track.clips.some(clip => clip.assetId === asset.id))) fail('placed')
  if (course.modules.some(module => module.lessons.some(other => other.id !== lesson.id && startMs < other.range.outMs && other.range.inMs < endMs))) fail('collision')
  const review = Object.freeze({ assetId, lessonId: lesson.id, lessonTitle: lesson.title, startMs, previousEndMs: lesson.range.outMs, endMs, durationMs, sourceRevision: source.course.outlineRevision, currentRevision: course.revision })
  const next = saveCourseOutline(project, { ...course, modules: course.modules.map(module => ({ ...module, lessons: module.lessons.map(item => item.id === lesson.id ? { ...item, range: { ...item.range, outMs: endMs } } : item) })) })
  reviews.set(review, { baseline: JSON.stringify(project), next, snapshotDone: false, done: false }); return review
}
export function courseNarrationRangeIsCurrent(project: KinaouProject, review: CourseNarrationRangeReview, disabled = false) {
  const binding = reviews.get(review); if (!binding || binding.done) return false
  if (disabled || binding.baseline !== JSON.stringify(project)) { reviews.delete(review); return false }
  return true
}
export function invalidateCourseNarrationRange(review: CourseNarrationRangeReview) { reviews.delete(review) }
export function commitCourseNarrationRange(project: KinaouProject, review: CourseNarrationRangeReview, acknowledged: boolean, deps: { snapshot: (project: KinaouProject) => void; persist: (project: KinaouProject) => void }) {
  if (!acknowledged || !courseNarrationRangeIsCurrent(project, review)) fail('stale')
  const binding = reviews.get(review)!
  // Refuse even a future invalid outline; never bypass ordinary course validation.
  projectCourse(binding.next)
  if (!binding.snapshotDone) { deps.snapshot(project); binding.snapshotDone = true }
  deps.persist(binding.next); binding.done = true; return binding.next
}
