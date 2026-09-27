import type { CourseOutline } from './course'

// Drafts may temporarily have blank titles or invalid ranges. Reordering must not
// normalize/drop authored fields; validate identity/shape only and save separately.
function identities(draft: CourseOutline) {
  if (!Array.isArray(draft.modules) || draft.modules.length > 50 || draft.modules.some(module => !Array.isArray(module.lessons) || module.lessons.length > 100)) throw Error('Invalid course draft structure')
  const lessons = draft.modules.flatMap(module => module.lessons)
  const ids = [draft.id, ...draft.modules.map(module => module.id), ...lessons.map(lesson => lesson.id)]
  if (lessons.length > 200 || ids.some(id => typeof id !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(id)) || new Set(ids).size !== ids.length) throw Error('Course identities must be valid and unique')
}
function position(index: number, max: number) { if (!Number.isInteger(index) || index < 0 || index > max) throw Error('Invalid course destination position') }
export function reorderCourseModule(draft: CourseOutline, moduleId: string, targetIndex: number): CourseOutline {
  identities(draft)
  const sourceIndex = draft.modules.findIndex(module => module.id === moduleId)
  if (sourceIndex < 0) throw Error('Course module no longer exists')
  position(targetIndex, draft.modules.length - 1)
  if (sourceIndex === targetIndex) return draft
  const modules = [...draft.modules], [module] = modules.splice(sourceIndex, 1); modules.splice(targetIndex, 0, module)
  return { ...draft, modules }
}
/** targetIndex is the final index, after removing the lesson from its old position. */
export function moveCourseLesson(draft: CourseOutline, sourceModuleId: string, lessonId: string, targetModuleId: string, targetIndex: number): CourseOutline {
  identities(draft)
  const source = draft.modules.find(module => module.id === sourceModuleId), target = draft.modules.find(module => module.id === targetModuleId)
  const sourceIndex = source?.lessons.findIndex(lesson => lesson.id === lessonId) ?? -1
  if (!source || !target || sourceIndex < 0) throw Error('Course module or lesson no longer exists')
  const same = source === target
  if (!same && target.lessons.length >= 100) throw Error('Destination module already contains 100 lessons')
  position(targetIndex, target.lessons.length - (same ? 1 : 0))
  if (same && sourceIndex === targetIndex) return draft
  const remaining = source.lessons.filter(lesson => lesson.id !== lessonId), destination = same ? remaining : [...target.lessons]
  destination.splice(targetIndex, 0, source.lessons[sourceIndex])
  return { ...draft, modules: draft.modules.map(module => module === target ? { ...module, lessons: destination } : module === source ? { ...module, lessons: remaining } : module) }
}
