import { projectCourse } from './course'
import { courseNarrationSourceSchema } from './courseNarration'
import { parseProject, type KinaouProject } from './project'
import { assertSafeManagedPath } from './storage'
import { applyTimelineOperation } from './timeline'

export type CourseNarrationPlacementErrorCode = 'source' | 'media' | 'duration' | 'overrun' | 'track' | 'overlap' | 'duplicate' | 'stale'
export class CourseNarrationPlacementError extends Error {
  constructor(readonly code: CourseNarrationPlacementErrorCode) { super(`Course narration placement: ${code}`) }
}
export interface CourseNarrationPlacementReview {
  readonly assetId: string; readonly trackId: string | null; readonly lessonTitle: string
  readonly sourceRevision: number; readonly currentRevision: number
  readonly startMs: number; readonly endMs: number; readonly durationMs: number; readonly remainingMs: number
}
const reviews = new WeakMap<CourseNarrationPlacementReview, { baseline: string; assetId: string; trackId: string | null; next?: KinaouProject; snapshotDone?: boolean; done?: boolean }>()
function fail(code: CourseNarrationPlacementErrorCode): never { throw new CourseNarrationPlacementError(code) }

export function inspectCourseNarrationSource(project: KinaouProject, assetId: string) {
  const assets = project.assets.filter(asset => asset.id === assetId)
  if (assets.length !== 1) fail('media')
  const asset = assets[0]
  if (asset.kind !== 'audio' || !asset.managed || asset.offline) fail('media')
  try { if (assertSafeManagedPath(asset.uri) !== asset.uri || !asset.uri.startsWith('KINAOU/Assets/')) fail('media') } catch { fail('media') }
  const source = courseNarrationSourceSchema.safeParse(asset.metadata.courseNarrationSource)
  if (!source.success || source.data.projectId !== project.id) fail('source')
  let course
  try { course = projectCourse(project) } catch { fail('source') }
  const lesson = course?.modules.flatMap(module => module.lessons).find(entry => entry.id === source.data.course.lessonId)
  if (!course || course.id !== source.data.course.courseId || course.language !== source.data.course.language
    || !lesson?.script?.trim() || lesson.script.trim() !== asset.metadata.sourceText) fail('source')
  const measured = asset.metadata.durationMs
  if (typeof measured !== 'number' || !Number.isFinite(measured) || measured <= 0 || measured > 86400000) fail('duration')
  const durationMs = Math.ceil(measured), startMs = lesson.range.inMs, endMs = startMs + durationMs
  return { asset, course, lesson, source: source.data, durationMs, startMs, endMs }
}

function plan(project: KinaouProject, assetId: string, trackId: string | null): CourseNarrationPlacementReview {
  const { asset, course, lesson, source, durationMs, startMs, endMs } = inspectCourseNarrationSource(project, assetId)
  if (endMs > lesson.range.outMs) fail('overrun')
  if (trackId !== null) {
    const targets = project.tracks.filter(track => track.id === trackId)
    if (targets.length !== 1 || !['voice', 'dialog'].includes(targets[0].type) || targets[0].locked || targets[0].muted) fail('track')
  }
  if (project.tracks.some(track => track.clips.some(clip => clip.assetId === asset.id))) fail('duplicate')
  // Check all audible speech tracks, not only the target: a new track must not bypass this guard.
  if (project.tracks.some(track => !track.muted && track.clips.some(clip => {
    const courseAudio = project.assets.find(entry => entry.id === clip.assetId)?.metadata.courseNarrationSource !== undefined
    return (['voice', 'dialog'].includes(track.type) || courseAudio)
      && clip.startMs < endMs && clip.startMs + clip.durationMs > startMs
  }))) fail('overlap')
  return { assetId, trackId, lessonTitle: lesson.title, sourceRevision: source.course.outlineRevision, currentRevision: course.revision,
    startMs, endMs, durationMs, remainingMs: lesson.range.outMs - endMs }
}

/** Ephemeral review: no project/media writes, no claim of byte or spoken-word verification. */
export function reviewCourseNarrationPlacement(project: KinaouProject, assetId: string, trackId: string | null): CourseNarrationPlacementReview {
  const review = Object.freeze(plan(project, assetId, trackId))
  reviews.set(review, { baseline: JSON.stringify(project), assetId, trackId })
  return review
}
export function courseNarrationPlacementIsCurrent(project: KinaouProject, review: CourseNarrationPlacementReview): boolean {
  const scope = reviews.get(review)
  if (!scope || scope.done) return false
  if (scope.baseline !== JSON.stringify(project)) { reviews.delete(review); return false }
  return true
}
export function invalidateCourseNarrationPlacement(review: CourseNarrationPlacementReview) { reviews.delete(review) }
export function applyCourseNarrationPlacement(project: KinaouProject, review: CourseNarrationPlacementReview): KinaouProject {
  const scope = reviews.get(review)
  if (!scope || !courseNarrationPlacementIsCurrent(project, review)) fail('stale')
  const checked = plan(project, scope.assetId, scope.trackId)
  const trackId = scope.trackId ?? crypto.randomUUID()
  let next = project
  if (scope.trackId === null) next = applyTimelineOperation(next, { type: 'add-track', track: { id: trackId, type: 'voice', name: 'Voice', locked: false, muted: false, clips: [] } })
  next = applyTimelineOperation(next, { type: 'add-clip', trackId, clip: { id: crypto.randomUUID(), assetId: checked.assetId, startMs: checked.startMs, durationMs: checked.durationMs, sourceOffsetMs: 0, gain: 1, speed: 1 } })
  return parseProject(next)
}

/** Stable clip/track IDs and one history snapshot across persistence retries. */
export function commitCourseNarrationPlacement(project: KinaouProject, review: CourseNarrationPlacementReview, deps: { snapshot: (project: KinaouProject) => void; persist: (project: KinaouProject) => void }): KinaouProject {
  if (!courseNarrationPlacementIsCurrent(project, review)) fail('stale')
  const scope = reviews.get(review)!
  if (!scope.next) scope.next = applyCourseNarrationPlacement(project, review)
  if (!scope.snapshotDone) { deps.snapshot(project); scope.snapshotDone = true }
  deps.persist(scope.next); scope.done = true; return scope.next
}
