import {useEffect,useRef,useState} from 'react'
import type {KinaouProject} from '../core/project'
import type {PersistentVersionHistory} from '../core/versioning'
import {WorkerClient} from '../core/workerClient'
import {sourceImportRequestSchema,sourceImportPath,type SourceImportRequest,type SourceImportJob} from '../../worker/source-import-protocol.mjs'
import {readSourceImportReminder,retainSourceImportReminder,forgetSourceImportReminder,SourceImportRegistration,type SourceImportReminder} from '../core/sourceImport'
import {useUiLanguage} from './UiLanguageProvider'
type Props={project:KinaouProject;history:PersistentVersionHistory;workerUrl:string;workerToken:string;workerConnected:boolean;workerCapabilities:string[];onProjectChange:(project:KinaouProject)=>unknown}
function Registration({project,job,history,onProjectChange}:{project:KinaouProject;job:SourceImportJob;history:PersistentVersionHistory;onProjectChange:Props['onProjectChange']}){
 const{t}=useUiLanguage(),[ack,setAck]=useState(false),[error,setError]=useState(''),registration=useRef<SourceImportRegistration|null>(null)
 const already=project.assets.some(a=>a.uri===job.result?.managedPath)
 registration.current?.observe(project)
 function save(){if(!ack||already)return;try{registration.current??=new SourceImportRegistration(project,job);registration.current.commit(project,p=>history.snapshot(p,t('sourceImport.history'),'system'),onProjectChange);setError('')}catch(cause){setError(String(cause))}}
 return already?<p role="status">{t('sourceImport.saved')}</p>:<div className="stack"><label><input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)}/>{t('sourceImport.accept')}</label><button className="primary" disabled={!ack} onClick={save}>{t('sourceImport.register')}</button>{error&&<div role="alert">{t('sourceImport.saveFailed')}<details><summary>{t('common.details')}</summary>{error}</details></div>}</div>
}
export function SourceImportPanel(props:Props){
 const{t,language}=useUiLanguage(),available=props.workerConnected&&!!props.workerToken.trim()&&props.workerCapabilities.includes('source-import')
 const[form,setForm]=useState({name:'',downloadUrl:'',sourcePageUrl:'',creator:'',permissionBasis:'license' as SourceImportRequest['permissionBasis'],evidence:'',attribution:'',intendedUse:''})
 const[boot]=useState(()=>{try{return{reminder:typeof window==='undefined'?null:readSourceImportReminder(window.localStorage,props.project.id),error:''}}catch(cause){return{reminder:null,error:String(cause)}}})
 const[reminder,setReminder]=useState<SourceImportReminder|null>(boot.reminder),[error,setError]=useState(boot.error),[busy,setBusy]=useState(false),[forgetEpoch,setForgetEpoch]=useState<number|null>(null)
 const[review,setReview]=useState<{request:SourceImportRequest;stamp:string}|null>(null),[acquisition,setAcquisition]=useState(false),[reuse,setReuse]=useState(false)
 const signature=JSON.stringify([props.project,props.workerUrl,props.workerToken,available,language]),environment=useRef({signature,epoch:0})
 if(environment.current.signature!==signature)environment.current={signature,epoch:environment.current.epoch+1}
 const epoch=environment.current.epoch,stamp=JSON.stringify([epoch,form]),[shown,setShown]=useState<{epoch:number;job:SourceImportJob}|null>(null),[requestError,setRequestError]=useState<{epoch:number;detail:string}|null>(null)
 const running=useRef(false),mounted=useRef(true)
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[])
 const job=shown?.epoch===epoch?shown.job:null,reviewed=review?.stamp===stamp?review:null,forgetAck=forgetEpoch===epoch
 const registered=!!reminder&&props.project.assets.some(asset=>asset.uri===sourceImportPath(reminder.request.id))
 let sameWorker=false;try{sameWorker=!!reminder&&new URL(props.workerUrl).origin===reminder.workerUrl}catch{/* unavailable */}
 function edit(key:keyof typeof form,value:string){setForm(old=>({...old,[key]:value}));setReview(null);setAcquisition(false);setReuse(false);setError('')}
 function prepare(){try{setReview({stamp,request:sourceImportRequestSchema.parse({...form,id:crypto.randomUUID(),projectId:props.project.id,acquisitionConfirmed:true,reuseConfirmed:true,reviewedAt:new Date().toISOString()})});setAcquisition(false);setReuse(false);setError('')}catch(cause){setError(String(cause))}}
 async function run(start:boolean){if(!available||running.current||(start?(!reviewed||!acquisition||!reuse||!!reminder):!sameWorker))return
  const ownEpoch=epoch,current=()=>mounted.current&&environment.current.epoch===ownEpoch;running.current=true;setBusy(true);setRequestError(null)
  try{let ticket=reminder
   if(start){ticket=retainSourceImportReminder(window.localStorage,{schemaVersion:1,workerUrl:new URL(props.workerUrl).origin,request:reviewed!.request});setReminder(ticket);setReview(null)}
   if(!ticket)throw Error('Missing retained source import')
   const client=new WorkerClient({baseUrl:ticket.workerUrl,token:props.workerToken});let result=start?await client.startSourceImport(ticket.request):await client.sourceImportStatus(ticket.request)
   while(current()){setShown({epoch:ownEpoch,job:result});if(['succeeded','failed','cancelled'].includes(result.state))break;await new Promise(resolve=>setTimeout(resolve,500));if(!current())break;result=await client.sourceImportStatus(ticket.request)}
  }catch(cause){if(current())setRequestError({epoch:ownEpoch,detail:String(cause)})}finally{running.current=false;if(mounted.current)setBusy(false)}
 }
 async function cancel(){if(!available||!sameWorker||!reminder)return;const ownEpoch=epoch;try{await new WorkerClient({baseUrl:reminder.workerUrl,token:props.workerToken}).sourceImportStatus(reminder.request,true)}catch(cause){if(mounted.current&&environment.current.epoch===ownEpoch)setRequestError({epoch:ownEpoch,detail:String(cause)})}}
 function forget(){if(!forgetAck||busy)return;try{forgetSourceImportReminder(window.localStorage,props.project.id);setReminder(null);setShown(null);setRequestError(null);setError('');setForgetEpoch(null)}catch(cause){setError(String(cause))}}
 return <details className="card sourceImportPanel"><summary>{t('sourceImport.heading')}</summary><div className="stack"><p>{t('sourceImport.help')}</p><p className="note">{t('sourceImport.scope')}</p>{!available&&<p>{t('sourceImport.unavailable')}</p>}
  {!reminder&&<><div className="formStack">{(['name','downloadUrl','sourcePageUrl','creator'] as const).map(key=><label key={key}>{t(`sourceImport.${key}`)}<input value={form[key]} maxLength={key==='name'?150:key==='creator'?200:2048} disabled={busy} onChange={e=>edit(key,e.target.value)}/></label>)}<label>{t('sourceImport.permissionBasis')}<select value={form.permissionBasis} disabled={busy} onChange={e=>edit('permissionBasis',e.target.value)}>{(['own','permission','license'] as const).map(value=><option key={value} value={value}>{t(`sourceImport.${value}`)}</option>)}</select></label>{(['evidence','attribution','intendedUse'] as const).map(key=><label key={key}>{t(`sourceImport.${key}`)}<textarea rows={3} value={form[key]} maxLength={key==='evidence'?4000:2000} disabled={busy} onChange={e=>edit(key,e.target.value)}/></label>)}</div><button className="secondaryButton" disabled={busy||!available} onClick={prepare}>{t('sourceImport.review')}</button>
   {reviewed&&<div className="renderJob stack"><dl>{Object.entries(form).map(([key,value])=><div key={key}><dt>{t(`sourceImport.${key}` as 'sourceImport.name')}</dt><dd>{key==='permissionBasis'?t(`sourceImport.${form.permissionBasis}`):value}</dd></div>)}</dl><label><input type="checkbox" checked={acquisition} onChange={e=>setAcquisition(e.target.checked)}/>{t('sourceImport.acquisition')}</label><label><input type="checkbox" checked={reuse} onChange={e=>setReuse(e.target.checked)}/>{t('sourceImport.reuse')}</label><button className="primary" disabled={!acquisition||!reuse||busy||!available} onClick={()=>void run(true)}>{t('sourceImport.start')}</button></div>}
  </>}
  {error&&<div role="alert">{t('sourceImport.error')}<details><summary>{t('common.details')}</summary>{error}</details></div>}
  {reminder&&<div className="renderJob stack"><strong>{t('sourceImport.pending',{id:reminder.request.id,name:reminder.request.name})}</strong><code>{reminder.workerUrl}</code><button className="secondaryButton" disabled={busy||!available||!sameWorker} onClick={()=>void run(false)}>{t('sourceImport.check')}</button><button className="secondaryButton" disabled={!available||!sameWorker||!job||['succeeded','failed','cancelled','committing'].includes(job.state)} onClick={()=>void cancel()}>{t('sourceImport.cancel')}</button>
   {registered&&<p role="status">{t('sourceImport.saved')}</p>}
   {requestError?.epoch===epoch&&<div role="alert">{t('sourceImport.uncertain')}<details><summary>{t('common.details')}</summary>{requestError.detail}</details></div>}
   {job&&<>{!(registered&&job.state==='succeeded')&&<p role="status">{t(`sourceImport.${job.state}`,{bytes:(job.receivedBytes/1024**2).toLocaleString(language,{maximumFractionDigits:1})})}</p>}{job.error&&<details><summary>{t('common.details')}</summary>{job.error}</details>}{job.result&&<><details><summary>{t('sourceImport.review')}</summary><pre>{JSON.stringify({request:job.request,result:job.result},null,2)}</pre></details>{!registered&&<Registration key={JSON.stringify([epoch,job.request.id,job.result.sha256])} project={props.project} job={job} history={props.history} onProjectChange={props.onProjectChange}/>}</>}</>}
   <label><input type="checkbox" checked={forgetAck} disabled={busy} onChange={e=>setForgetEpoch(e.target.checked?epoch:null)}/>{t('sourceImport.forgetAck')}</label><button className="secondaryButton" disabled={!forgetAck||busy} onClick={forget}>{t('sourceImport.forget')}</button>
  </div>}
 </div></details>
}
