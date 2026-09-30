import {parseProject,type KinaouProject} from './project'
import {projectCourse} from './course'
import {courseDemoEvidenceState} from './courseEvidence'
import {projectCourseOutputIndex} from './exportHistory'
import {assertSafeManagedPath} from './storage'
export interface CourseInterval {startMs:number;endMs:number}
export interface CourseCoverage {durationMs:number;coveredMs:number;intervals:CourseInterval[];gaps:CourseInterval[]}
/** Half-open lesson-relative interval union. Overlaps are counted once; missing spans are never inferred away. */
export function courseIntervalCoverage(range:{inMs:number;outMs:number},input:CourseInterval[]):CourseCoverage{
  if(!Number.isSafeInteger(range.inMs)||!Number.isSafeInteger(range.outMs)||range.inMs<0||range.outMs<=range.inMs)throw Error('Invalid lesson interval')
  const intervals:CourseInterval[]=[]
  const clipped=input.map(span=>{if(!Number.isSafeInteger(span.startMs)||!Number.isSafeInteger(span.endMs)||span.startMs<0||span.endMs<=span.startMs)throw Error('Invalid clip interval');return {startMs:Math.max(range.inMs,span.startMs)-range.inMs,endMs:Math.min(range.outMs,span.endMs)-range.inMs}}).filter(span=>span.endMs>span.startMs).sort((a,b)=>a.startMs-b.startMs||a.endMs-b.endMs)
  for(const span of clipped){const last=intervals.at(-1);if(last&&span.startMs<=last.endMs)last.endMs=Math.max(last.endMs,span.endMs);else intervals.push({...span})}
  const durationMs=range.outMs-range.inMs,gaps:CourseInterval[]=[];let cursor=0
  for(const span of intervals){if(span.startMs>cursor)gaps.push({startMs:cursor,endMs:span.startMs});cursor=span.endMs}
  if(cursor<durationMs)gaps.push({startMs:cursor,endMs:durationMs})
  return {durationMs,coveredMs:intervals.reduce((sum,span)=>sum+span.endMs-span.startMs,0),intervals,gaps}
}
export interface CourseProductionRow {
  lessonId:string;moduleId:string;label:string;range:{inMs:number;outMs:number};scriptPresent:boolean
  visuals:CourseCoverage;voice:CourseCoverage;captionClips:number;excludedClips:number
  demonstrations:number;linkedDemonstrations:number;exercises:number;completeExercises:number;materials:number
  exports:number;matchingOutlineExports:number
}
export type CourseOverviewFilter='all'|'visualGaps'|'noScript'|'noExports'
export const filterCourseOverview=(rows:CourseProductionRow[],filter:CourseOverviewFilter)=>rows.filter(row=>filter==='all'||filter==='visualGaps'&&row.visuals.gaps.length>0||filter==='noScript'&&!row.scriptPresent||filter==='noExports'&&row.exports===0)
/** Saved metadata only. Occupancy is neither actual pixels/speech nor a renderability or quality certificate. */
export function courseProductionOverview(input:KinaouProject):CourseProductionRow[]{
  const project=parseProject(input),course=projectCourse(project);if(!course)return []
  const receipts=projectCourseOutputIndex(project) // Existing parser also rejects duplicate job identities.
  const assetCounts=new Map<string,number>();for(const a of project.assets)assetCounts.set(a.id,(assetCounts.get(a.id)??0)+1)
  const assets=new Map(project.assets.map(a=>[a.id,a])),visual=new Set(['video','broll','image','avatar','overlay']),speech=new Set(['voice','dialog'])
  const clips=project.tracks.flatMap(track=>track.muted||(!visual.has(track.type)&&!speech.has(track.type)&&track.type!=='caption')?[]:track.clips.map(clip=>{
    const category=visual.has(track.type)?'visual':speech.has(track.type)?'voice':'caption',asset=assets.get(clip.assetId)
    const span={startMs:clip.startMs,endMs:clip.startMs+clip.durationMs}
    if(category==='voice'&&clip.gain<=0)return {...span,category,eligible:false,excluded:false}
    let eligible=!!asset&&!asset.offline&&asset.managed&&assetCounts.get(asset.id)===1
    if(eligible&&asset){
      if(category==='caption')eligible=asset.kind==='caption'&&asset.uri===`kinaou://caption/${asset.id}`&&typeof asset.metadata.text==='string'&&!!asset.metadata.text.trim()&&clip.speed===1
      else{
        try{eligible=assertSafeManagedPath(asset.uri)===asset.uri&&asset.uri.startsWith('KINAOU/Assets/')}catch{eligible=false}
        eligible=eligible&&(category==='visual'?['image','video'].includes(asset.kind):asset.kind==='audio')
        if(asset.kind==='image')eligible=eligible&&clip.speed===1
        else{const measured=asset.metadata.durationMs;eligible=eligible&&typeof measured==='number'&&Number.isFinite(measured)&&measured>0&&measured<=86400000&&clip.sourceOffsetMs+clip.durationMs*clip.speed<=measured+1}
      }
    }
    return {...span,category,eligible,excluded:!eligible}
  }))
  return course.modules.flatMap((module,mi)=>module.lessons.map((lesson,li)=>{
    const intersects=clips.filter(c=>c.startMs<lesson.range.outMs&&c.endMs>lesson.range.inMs),exports=receipts.filter(r=>r.courseLesson?.courseId===course.id&&r.courseLesson.lessonId===lesson.id)
    return {lessonId:lesson.id,moduleId:module.id,label:`${mi+1}.${li+1} · ${module.title} / ${lesson.title}`,range:{...lesson.range},scriptPresent:!!lesson.script?.trim(),
      visuals:courseIntervalCoverage(lesson.range,intersects.filter(c=>c.category==='visual'&&c.eligible)),voice:courseIntervalCoverage(lesson.range,intersects.filter(c=>c.category==='voice'&&c.eligible)),
      captionClips:intersects.filter(c=>c.category==='caption'&&c.eligible).length,excludedClips:intersects.filter(c=>c.excluded).length,
      demonstrations:lesson.demonstrations?.length??0,linkedDemonstrations:lesson.demonstrations?.filter(d=>courseDemoEvidenceState(project,d)==='linked').length??0,
      exercises:lesson.exercises?.length??0,completeExercises:lesson.exercises?.filter(e=>e.prompt.trim()&&e.solution.trim()).length??0,materials:lesson.materials?.filter(m=>m.body.trim()).length??0,
      exports:exports.length,matchingOutlineExports:exports.filter(r=>r.courseLesson!.moduleId===module.id&&r.courseLesson!.outlineRevision===course.revision&&r.courseLesson!.courseTitle===course.title&&r.courseLesson!.moduleTitle===module.title&&r.courseLesson!.lessonTitle===lesson.title&&r.courseLesson!.language===course.language&&r.range.inMs===lesson.range.inMs&&r.range.outMs===lesson.range.outMs).length}
  }))
}
