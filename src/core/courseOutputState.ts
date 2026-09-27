import { projectCourse } from './course'
import type { ExportReceipt } from './exportHistory'
import type { KinaouProject } from './project'
export function courseOutputState(project: KinaouProject, receipt: ExportReceipt): 'matches' | 'changed' | 'removed' | 'otherCourse' {
  const course = projectCourse(project), context = receipt.courseLesson
  if (!course || !context || course.id !== context.courseId) return 'otherCourse'
  const module = course.modules.find(entry => entry.id === context.moduleId)
  const lesson = module?.lessons.find(entry => entry.id === context.lessonId)
  if (!lesson) return course.modules.some(entry => entry.lessons.some(item => item.id === context.lessonId)) ? 'changed' : 'removed'
  return course.revision === context.outlineRevision && course.title === context.courseTitle
    && course.language === context.language && module?.title === context.moduleTitle && lesson.title === context.lessonTitle
    && lesson.range.inMs === receipt.range.inMs && lesson.range.outMs === receipt.range.outMs ? 'matches' : 'changed'
}
