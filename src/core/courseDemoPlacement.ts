import {z} from 'zod'
import {projectCourse} from './course'
import {courseDemoEvidenceState} from './courseEvidence'
import {parseProject,type KinaouProject} from './project'
import {applyTimelineOperation} from './timeline'
export type CourseDemoPlacementCode='source'|'media'|'time'|'overrun'|'overlap'|'stale'|'ack'
export class CourseDemoPlacementError extends Error{constructor(readonly code:CourseDemoPlacementCode){super('Course demonstration placement: '+code)}}
function fail(code:CourseDemoPlacementCode):never{throw new CourseDemoPlacementError(code)}
const requestSchema=z.object({lessonId:z.string().min(1),demoId:z.string().min(1),lessonOffsetMs:z.number().int().min(0).max(86400000),sourceOffsetMs:z.number().int().min(0).max(86400000),durationMs:z.number().int().min(250).max(86400000)}).strict()
export type CourseDemoPlacementRequest=z.infer<typeof requestSchema>
export interface CourseDemoPlacementReview {readonly lessonTitle:string;readonly demoTitle:string;readonly assetId:string;readonly uri:string;readonly kind:'image'|'video';readonly sourceKind:string;readonly startMs:number;readonly endMs:number;readonly durationMs:number;readonly sourceOffsetMs:number;readonly sourceDurationMs:number|null;readonly revision:number}
interface Binding{baseline:string;request:CourseDemoPlacementRequest;next?:KinaouProject;snapshotDone:boolean;done:boolean}
const bindings=new WeakMap<CourseDemoPlacementReview,Binding>()
export function parseDemoSeconds(value:string):number{
  const normalized=value.trim().replace(',','.')
  if(!/^\d+(?:\.\d{1,3})?$/.test(normalized))fail('time')
  const ms=Math.round(Number(normalized)*1000);if(!Number.isSafeInteger(ms)||ms>86400000)fail('time');return ms
}
export function courseDemoPlacementChoices(project:KinaouProject){
  const course=projectCourse(project)
  return course?.modules.flatMap((module,mi)=>module.lessons.map((lesson,li)=>({lesson,label:`${mi+1}.${li+1} · ${module.title} / ${lesson.title}`})))??[]
}
function plan(project:KinaouProject,input:CourseDemoPlacementRequest):CourseDemoPlacementReview{
  const parsed=requestSchema.safeParse(input);if(!parsed.success)fail('time');const request=parsed.data
  let course;try{course=projectCourse(project)}catch{fail('source')}
  const lesson=course?.modules.flatMap(m=>m.lessons).find(l=>l.id===request.lessonId),demo=lesson?.demonstrations?.find(d=>d.id===request.demoId)
  if(!course||!lesson||!demo||courseDemoEvidenceState(project,demo)!=='linked')fail('source')
  const asset=project.assets.find(a=>a.id===demo.evidence!.assetId)!
  if(!['image','video'].includes(asset.kind)||!asset.uri.startsWith('KINAOU/Assets/'))fail('media')
  const kind=asset.kind as 'image'|'video',measured=asset.metadata.durationMs
  if(kind==='image'&&request.sourceOffsetMs!==0)fail('time')
  if(kind==='video'&&(typeof measured!=='number'||!Number.isFinite(measured)||measured<=0||measured>86400000))fail('media')
  const startMs=lesson.range.inMs+request.lessonOffsetMs,endMs=startMs+request.durationMs
  if(endMs>lesson.range.outMs||(kind==='video'&&request.sourceOffsetMs+request.durationMs>(measured as number)))fail('overrun')
  const visual=new Set(['video','broll','image','avatar','overlay'])
  // New tracks must not silently cover an existing active visual on any track.
  if(project.tracks.some(track=>!track.muted&&visual.has(track.type)&&track.clips.some(clip=>clip.startMs<endMs&&clip.startMs+clip.durationMs>startMs)))fail('overlap')
  return {lessonTitle:lesson.title,demoTitle:demo.title,assetId:asset.id,uri:asset.uri,kind,sourceKind:typeof asset.metadata.sourceKind==='string'?asset.metadata.sourceKind:'',startMs,endMs,durationMs:request.durationMs,sourceOffsetMs:request.sourceOffsetMs,sourceDurationMs:kind==='video'?measured as number:null,revision:course.revision}
}
/** Read-only registration/timing review, not byte inspection, rights verification or proof the demo was performed. */
export function reviewCourseDemoPlacement(project:KinaouProject,request:CourseDemoPlacementRequest):CourseDemoPlacementReview{
  const review=Object.freeze(plan(project,request));bindings.set(review,{baseline:JSON.stringify(project),request:structuredClone(request),snapshotDone:false,done:false});return review
}
export function courseDemoPlacementIsCurrent(project:KinaouProject,review:CourseDemoPlacementReview):boolean{
  const binding=bindings.get(review)
  if(!binding||binding.done)return false
  if(binding.baseline!==JSON.stringify(project)){bindings.delete(review);return false}
  return true
}
/** One prepared clip/track and one safety version; retry only persistence within the reviewed lifetime. */
export function commitCourseDemoPlacement(project:KinaouProject,review:CourseDemoPlacementReview,confirmed:boolean,deps:{snapshot:(project:KinaouProject)=>void;persist:(project:KinaouProject)=>void}):KinaouProject{
  if(!confirmed)fail('ack')
  if(!courseDemoPlacementIsCurrent(project,review))fail('stale')
  const binding=bindings.get(review)!,checked=plan(project,binding.request)
  if(!binding.next){
    const trackId=crypto.randomUUID(),next=applyTimelineOperation(project,{type:'add-track',track:{id:trackId,type:checked.kind,name:checked.demoTitle,muted:false,locked:false,clips:[]}})
    binding.next=parseProject(applyTimelineOperation(next,{type:'add-clip',trackId,clip:{id:crypto.randomUUID(),assetId:checked.assetId,startMs:checked.startMs,durationMs:checked.durationMs,sourceOffsetMs:checked.sourceOffsetMs,gain:0,speed:1}}))
  }
  if(!binding.snapshotDone){deps.snapshot(project);binding.snapshotDone=true}
  deps.persist(binding.next);binding.done=true;return binding.next
}
