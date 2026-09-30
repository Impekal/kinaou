import type { CourseOutline } from './course'

export interface CourseOutlineFocus { moduleId: string; lessonId: string }

/** View-only identity resolution: incomplete drafts must never be parsed or normalized here. */
export function resolveCourseOutlineFocus(draft: CourseOutline, requested?: CourseOutlineFocus): CourseOutlineFocus {
  const owner = requested?.lessonId ? draft.modules.find(module => module.lessons.some(lesson => lesson.id === requested.lessonId)) : undefined
  const module = owner ?? draft.modules.find(module => module.id === requested?.moduleId) ?? draft.modules[0]
  return { moduleId: module?.id ?? '', lessonId: owner ? requested!.lessonId : module?.lessons[0]?.id ?? '' }
}

/** Resolve a schema issue to the authored item without replacing or repairing its value. */
export function courseOutlineIssueFocus(draft: CourseOutline, path: readonly PropertyKey[]): CourseOutlineFocus | null {
  if (path[0] !== 'modules' || typeof path[1] !== 'number' || !Number.isInteger(path[1])) return null
  const module = draft.modules[path[1]]
  if (!module) return null
  const lesson = path[2] === 'lessons' && typeof path[3] === 'number' && Number.isInteger(path[3]) ? module.lessons[path[3]] : undefined
  return { moduleId: module.id, lessonId: lesson?.id ?? module.lessons[0]?.id ?? '' }
}
