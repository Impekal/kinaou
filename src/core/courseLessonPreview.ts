import { courseLessonChoices } from './course'
import type { KinaouProject } from './project'
import { createRenderPlan, projectFormatPreset, type TargetFormat } from './render'
import { createRangeRenderPlan } from './renderRange'
import { renderReadiness } from './renderUi'

/** Cache-only plan; submission must call freshPreviewPlan for its own unique output file. */
export function createCourseLessonPreview(project: KinaouProject, lessonId: string, format: TargetFormat, options: Parameters<typeof createRenderPlan>[3] = {}) {
  const readiness = renderReadiness(project)
  if (!readiness.ready) throw Error(readiness.reason)
  const path = 'KINAOU/Cache/Previews/course-lesson.mp4'
  const full = createRenderPlan(project, projectFormatPreset(project, format, 'preview'), path, options)
  const lesson = courseLessonChoices(project, full.durationMs).find(value => value.id === lessonId)
  if (!lesson || !lesson.check.valid) throw Error('Select a saved course lesson with a valid timeline range')
  return { plan: createRangeRenderPlan(full, lesson.range, path), label: lesson.label, range: { ...lesson.range }, context: lesson.context }
}
