import { projectCourse } from './course'
import type { KinaouProject } from './project'
import { serializeWebVtt, webVttLimits, type WebVttCue } from './webvtt'

export type CourseSubtitleErrorCode = 'lesson' | 'captions' | 'unsupported' | 'overlap' | 'text' | 'limit' | 'stale'
export class CourseSubtitleError extends Error {
  constructor(readonly code: CourseSubtitleErrorCode) { super(`Course subtitle export: ${code}`) }
}
export interface CourseSubtitleReview {
  readonly lessonId: string; readonly lessonTitle: string; readonly language: string; readonly revision: number
  readonly durationMs: number; readonly clippedCues: number; readonly filename: string
  readonly cues: ReadonlyArray<Readonly<WebVttCue>>
}
const reviews = new WeakMap<CourseSubtitleReview, { baseline: string; text: string }>()
function fail(code: CourseSubtitleErrorCode): never { throw new CourseSubtitleError(code) }

/** A read-only current-timeline sidecar, not a certificate for an earlier MP4. */
export function reviewCourseSubtitleExport(project: KinaouProject, lessonId: string): CourseSubtitleReview {
  let course
  try { course = projectCourse(project) } catch { fail('lesson') }
  const lesson = course?.modules.flatMap(module => module.lessons).find(entry => entry.id === lessonId)
  if (!course || !lesson) fail('lesson')
  const cues: WebVttCue[] = []; let clippedCues = 0
  for (const track of project.tracks) {
    if (track.muted) continue
    for (const clip of track.clips) {
      if (clip.startMs >= lesson.range.outMs || clip.startMs + clip.durationMs <= lesson.range.inMs) continue
      const assets = project.assets.filter(asset => asset.id === clip.assetId), asset = assets[0]
      if (track.type !== 'caption' && asset?.kind !== 'caption') continue
      if (track.type !== 'caption' || assets.length !== 1 || asset.kind !== 'caption' || asset.offline || !asset.managed || clip.speed !== 1) fail('unsupported')
      if (typeof asset.metadata.text !== 'string' || !asset.metadata.text.trim()) fail('text')
      const start = Math.max(clip.startMs, lesson.range.inMs), end = Math.min(clip.startMs + clip.durationMs, lesson.range.outMs)
      if (start !== clip.startMs || end !== clip.startMs + clip.durationMs) clippedCues++
      cues.push({ startMs: start - lesson.range.inMs, endMs: end - lesson.range.inMs, text: asset.metadata.text })
    }
  }
  if (!cues.length) fail('captions')
  if (cues.length > webVttLimits.cues) fail('limit')
  cues.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs)
  if (cues.some((cue, index) => index > 0 && cue.startMs < cues[index - 1].endMs)) fail('overlap')
  let text
  try { text = serializeWebVtt(cues) } catch (cause) {
    if (cause instanceof Error && cause.message.includes('limit')) fail('limit')
    fail('text')
  }
  const review = Object.freeze({ lessonId, lessonTitle: lesson.title, language: course.language, revision: course.revision,
    durationMs: lesson.range.outMs - lesson.range.inMs, clippedCues, filename: `lesson-${lesson.id}-${course.language}-r${course.revision}.vtt`,
    cues: Object.freeze(cues.map(cue => Object.freeze(cue))) })
  reviews.set(review, { baseline: JSON.stringify(project), text })
  return review
}
export function courseSubtitleReviewIsCurrent(project: KinaouProject, review: CourseSubtitleReview): boolean {
  return reviews.get(review)?.baseline === JSON.stringify(project)
}
export function downloadReviewedCourseSubtitles(project: KinaouProject, review: CourseSubtitleReview) {
  const scope = reviews.get(review)
  if (!scope || !courseSubtitleReviewIsCurrent(project, review)) fail('stale')
  return { filename: review.filename, mimeType: 'text/vtt;charset=utf-8', text: scope.text }
}
