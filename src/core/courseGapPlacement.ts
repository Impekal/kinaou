import type {KinaouProject} from './project'
import {courseProductionOverview,type CourseInterval} from './courseProductionOverview'
import {isUiLanguage,type UiLanguage} from './uiLanguage'

export interface CourseGapPlacement {readonly lessonId:string;readonly label:string;readonly lessonOffsetMs:number;readonly durationMs:number}
const bindings=new WeakMap<CourseGapPlacement,{project:string;language:UiLanguage}>()
/** Exact saved visual gap only. No inferred source selection, trimming, insertion or persistence. */
export function prepareCourseGapPlacement(project:KinaouProject,lessonId:string,gap:CourseInterval,language:UiLanguage):CourseGapPlacement{
  const row=courseProductionOverview(project).find(r=>r.lessonId===lessonId)
  if(!isUiLanguage(language)||!row||!row.visuals.gaps.some(g=>g.startMs===gap.startMs&&g.endMs===gap.endMs)||gap.endMs-gap.startMs<250)throw Error('Select a current visual gap of at least 250 ms')
  const start=row.range.inMs+gap.startMs,end=row.range.inMs+gap.endMs,visual=new Set(['video','broll','image','avatar','overlay'])
  // Excluded/offline clips can create overview gaps, but must never be silently covered.
  if(project.tracks.some(t=>!t.muted&&visual.has(t.type)&&t.clips.some(c=>c.startMs<end&&c.startMs+c.durationMs>start)))throw Error('Existing visual clips occupy this interval; review them in Studio first')
  const value=Object.freeze({lessonId,label:row.label,lessonOffsetMs:gap.startMs,durationMs:gap.endMs-gap.startMs})
  bindings.set(value,{project:JSON.stringify(project),language});return value
}
export function courseGapPlacementIsCurrent(project:KinaouProject,value:CourseGapPlacement,language:UiLanguage,dirty=false):boolean{
  const bound=bindings.get(value);if(!bound)return false
  if(dirty||bound.language!==language||bound.project!==JSON.stringify(project)){bindings.delete(value);return false}
  return true
}
export function courseGapPlacementDraft(project:KinaouProject,value:CourseGapPlacement,language:UiLanguage,dirty=false){
  if(!courseGapPlacementIsCurrent(project,value,language,dirty))throw Error('Gap selection is no longer current')
  return {lessonId:value.lessonId,demoId:'',offset:String(value.lessonOffsetMs/1000),duration:String(value.durationMs/1000),sourceOffset:'0'}
}
