import type { CourseProductionRow } from './courseProductionOverview'

/** In the order a lesson is normally made, so the first open item is the sensible next step. */
export const courseDeliveryItems = ['script', 'visuals', 'voice', 'captions', 'media', 'exercises', 'demonstrations', 'export', 'review'] as const
export type CourseDeliveryItem = typeof courseDeliveryItems[number]

export type CourseReviewState = 'none' | 'current' | 'stale' | 'unknown'

export interface CourseDeliveryGap { item: CourseDeliveryItem; count: number }

export interface LessonDeliveryStatus {
  lessonId: string
  moduleId: string
  label: string
  gaps: CourseDeliveryGap[]
  /** The first open item, or null when nothing computed is open. */
  next: CourseDeliveryItem | null
}

/**
 * Turns the saved production facts of one lesson into a list of what is still open.
 * Every item is something countable in the saved project. None of them says the lesson
 * is good: a lesson with nothing open has simply not been found lacking by a computer.
 */
export function lessonDeliveryStatus(row: CourseProductionRow, review: CourseReviewState): LessonDeliveryStatus {
  const gaps: CourseDeliveryGap[] = []
  const add = (item: CourseDeliveryItem, count: number) => { if (count > 0) gaps.push({ item, count }) }
  add('script', row.scriptPresent ? 0 : 1)
  add('visuals', row.visuals.gaps.length)
  add('voice', row.voice.gaps.length)
  add('captions', row.captionClips === 0 ? 1 : 0)
  add('media', row.excludedClips)
  // Exercises and demonstrations are optional; only ones that were started and left incomplete count.
  add('exercises', row.exercises - row.completeExercises)
  add('demonstrations', row.demonstrations - row.linkedDemonstrations)
  add('export', row.matchingOutlineExports === 0 ? 1 : 0)
  // An unknown review state is reported as open: it must never read as reviewed.
  add('review', review === 'current' ? 0 : 1)
  return { lessonId: row.lessonId, moduleId: row.moduleId, label: row.label, gaps, next: gaps[0]?.item ?? null }
}

export interface CourseDeliverySummary { lessons: number; clear: number; open: number; byItem: Array<{ item: CourseDeliveryItem; lessons: number }> }

export function summarizeCourseDelivery(statuses: readonly LessonDeliveryStatus[]): CourseDeliverySummary {
  const clear = statuses.filter(status => !status.gaps.length).length
  return {
    lessons: statuses.length, clear, open: statuses.length - clear,
    byItem: courseDeliveryItems.map(item => ({ item, lessons: statuses.filter(status => status.gaps.some(gap => gap.item === item)).length })).filter(entry => entry.lessons > 0)
  }
}
