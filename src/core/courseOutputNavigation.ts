import type {KinaouProject} from './project'
import {projectCourse} from './course'
import {projectCourseOutputIndex} from './exportHistory'

export interface CourseOutputNavigation {readonly courseId:string;readonly lessonId:string;readonly label:string}
const bindings=new WeakMap<CourseOutputNavigation,string>()
/** Only prepares a retained-reference filter. No file selection, inspection, playback or persistence. */
export function createCourseOutputNavigation(project:KinaouProject,lessonId:string):CourseOutputNavigation{
  const course=projectCourse(project),module=course?.modules.find(m=>m.lessons.some(l=>l.id===lessonId)),lesson=module?.lessons.find(l=>l.id===lessonId)
  if(!course||!module||!lesson||!projectCourseOutputIndex(project).some(r=>r.courseLesson?.courseId===course.id&&r.courseLesson.lessonId===lessonId))throw Error('Select a saved lesson with retained exports')
  const value=Object.freeze({courseId:course.id,lessonId,label:`${module.title} / ${lesson.title}`});bindings.set(value,JSON.stringify(project));return value
}
export function courseOutputNavigationIsCurrent(project:KinaouProject,value:CourseOutputNavigation,dirty=false):boolean{
  const bound=bindings.get(value);if(!bound)return false
  if(dirty||bound!==JSON.stringify(project)){bindings.delete(value);return false}return true
}
export function resolveCourseOutputNavigation(project:KinaouProject,value:CourseOutputNavigation,dirty=false){
  if(!courseOutputNavigationIsCurrent(project,value,dirty))throw Error('Lesson export navigation is no longer current')
  return projectCourseOutputIndex(project).filter(r=>r.courseLesson?.courseId===value.courseId&&r.courseLesson.lessonId===value.lessonId).sort((a,b)=>Date.parse(b.completedAt)-Date.parse(a.completedAt)||a.jobId.localeCompare(b.jobId))
}
