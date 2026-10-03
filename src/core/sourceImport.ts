import { sourceImportRequestSchema, validateSourceImportJob, type SourceImportRequest, type SourceImportJob } from '../../worker/source-import-protocol.mjs'
import { parseProject, type KinaouProject } from './project'
import { importProbedMedia } from './mediaImport'
export interface SourceImportReminder { schemaVersion:1; workerUrl:string; request:SourceImportRequest }
type Storage = Pick<globalThis.Storage, 'getItem'|'setItem'|'removeItem'>
export const sourceImportReminderKey=(projectId:string)=>`kinaou.source-import.v1:${projectId}`
export function parseSourceImportReminder(value:unknown,projectId:string):SourceImportReminder {
  const raw=value as SourceImportReminder, request=sourceImportRequestSchema.parse(raw?.request),url=new URL(raw?.workerUrl)
  if(raw?.schemaVersion!==1||request.projectId!==projectId||url.protocol!=='http:'||!['127.0.0.1','localhost'].includes(url.hostname)||url.username||url.password||url.search||url.hash||url.pathname!=='/'||raw.workerUrl!==url.origin)throw Error('Invalid retained source import reminder')
  return{schemaVersion:1,workerUrl:url.origin,request}
}
export function readSourceImportReminder(storage:Storage,projectId:string){const raw=storage.getItem(sourceImportReminderKey(projectId));return raw?parseSourceImportReminder(JSON.parse(raw),projectId):null}
export function retainSourceImportReminder(storage:Storage,value:SourceImportReminder){const valid=parseSourceImportReminder(value,value.request.projectId),key=sourceImportReminderKey(valid.request.projectId),serialized=JSON.stringify(valid);if(storage.getItem(key))throw Error('Resolve the retained source import before starting another');storage.setItem(key,serialized);if(storage.getItem(key)!==serialized)throw Error('Source import reminder could not be read back');return valid}
export function forgetSourceImportReminder(storage:Storage,projectId:string){const key=sourceImportReminderKey(projectId);storage.removeItem(key);if(storage.getItem(key)!==null)throw Error('Source import reminder could not be removed')}

/** Stable registration only. Downloading never writes the project or places a timeline clip. */
export class SourceImportRegistration {
  private baseline:string
  private active=true
  private snapshotDone=false
  private running=false
  private done=false
  private next:KinaouProject
  constructor(project:KinaouProject,job:SourceImportJob){
    const input=parseProject(project),valid=validateSourceImportJob(job),result=valid.result
    if(valid.state!=='succeeded'||!result||valid.request.projectId!==input.id)throw Error('A completed source download for this project is required')
    if(input.assets.some(a=>a.uri===result.managedPath))throw Error('This source file is already registered')
    this.baseline=JSON.stringify(project)
    const imported=importProbedMedia(input,{kind:'video',managedPath:result.managedPath,name:valid.request.name,probe:{...result.probe,mimeType:result.mimeType}}),oldIds=new Set(input.assets.map(a=>a.id))
    this.next=parseProject({...imported,assets:imported.assets.map(a=>oldIds.has(a.id)?a:{...a,metadata:{...a.metadata,width:result.probe.width,height:result.probe.height,fps:result.probe.fps,videoCodec:result.probe.videoCodec,audioCodec:result.probe.audioCodec,sourceImport:{schemaVersion:1,request:valid.request,result}}})})
  }
  observe(project:KinaouProject){if(JSON.stringify(project)!==this.baseline)this.active=false}
  commit(project:KinaouProject,snapshot:(value:KinaouProject)=>unknown,persist:(value:KinaouProject)=>unknown){
    this.observe(project);if(!this.active||this.done||this.running)throw Error('Source import registration is stale or already used')
    this.running=true
    try{if(!this.snapshotDone){if(snapshot(structuredClone(project))===false)throw Error('Source import safety version was not saved');this.snapshotDone=true}if(persist(structuredClone(this.next))===false)throw Error('Source import project was not saved');this.done=true;return structuredClone(this.next)}finally{this.running=false}
  }
}
