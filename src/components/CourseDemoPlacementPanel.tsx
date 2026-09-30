import {useEffect,useRef,useState} from 'react'
import type {KinaouProject} from '../core/project'
import type {PersistentVersionHistory} from '../core/versioning'
import {AiEditorRequestScope} from '../core/aiEditorReview'
import {courseDemoPlacementChoices,parseDemoSeconds,reviewCourseDemoPlacement,courseDemoPlacementIsCurrent,commitCourseDemoPlacement,CourseDemoPlacementError,type CourseDemoPlacementReview} from '../core/courseDemoPlacement'
import {useUiLanguage} from './UiLanguageProvider'
export function CourseDemoPlacementPanel({project,dirty,history,onProjectChange}:{project:KinaouProject;dirty:boolean;history:PersistentVersionHistory;onProjectChange:(project:KinaouProject)=>void}){
  const {t,language}=useUiLanguage(),[lessonId,setLessonId]=useState(''),[demoId,setDemoId]=useState(''),[offset,setOffset]=useState('0'),[sourceOffset,setSourceOffset]=useState('0'),[duration,setDuration]=useState('5'),[ack,setAck]=useState(false)
  const [review,setReview]=useState<{value:CourseDemoPlacementReview;current:()=>boolean}|null>(null),[feedback,setFeedback]=useState<{project:KinaouProject;code:'saved'|'failed'|CourseDemoPlacementError['code'];detail?:string}|null>(null)
  const scope=useRef(new AiEditorRequestScope());scope.current.update(JSON.stringify([project,dirty,lessonId,demoId,offset,sourceOffset,duration,language]))
  useEffect(()=>{scope.current.attach();return()=>scope.current.detach()},[])
  let choices:ReturnType<typeof courseDemoPlacementChoices>=[],invalid='';try{choices=courseDemoPlacementChoices(project)}catch(cause){invalid=String(cause)}
  const lesson=choices.find(c=>c.lesson.id===lessonId)?.lesson,demo=lesson?.demonstrations?.find(d=>d.id===demoId),asset=project.assets.find(a=>a.id===demo?.evidence?.assetId)
  const current=!!review&&review.current()&&courseDemoPlacementIsCurrent(project,review.value)&&!dirty
  const shown=feedback?.project===project?feedback:null
  const seconds=(ms:number)=>(ms/1000).toLocaleString(language,{maximumFractionDigits:3})
  function change(action:()=>void){action();setReview(null);setAck(false);setFeedback(null)}
  function report(cause:unknown){setFeedback(cause instanceof CourseDemoPlacementError?{project,code:cause.code}:{project,code:'failed',detail:String(cause)})}
  function inspect(){if(dirty)return;setFeedback(null);setReview(null);setAck(false);try{const value=reviewCourseDemoPlacement(project,{lessonId,demoId,lessonOffsetMs:parseDemoSeconds(offset),sourceOffsetMs:parseDemoSeconds(sourceOffset),durationMs:parseDemoSeconds(duration)});setReview({value,current:scope.current.begin()})}catch(cause){report(cause)}}
  function save(){if(!current||!review||!ack)return;try{const next=commitCourseDemoPlacement(project,review.value,ack,{snapshot:p=>{history.snapshot(p,'Before placing lesson demonstration','system')},persist:onProjectChange});setReview(null);setAck(false);setFeedback({project:next,code:'saved'})}catch(cause){report(cause)}}
  return <section className="card stack"><h3>{t('course.demoPlace.heading')}</h3><p>{t('course.demoPlace.help')}</p><p className="note">{t('course.demoPlace.boundary')}</p>
    <label>{t('course.demoPlace.lesson')}<select disabled={dirty||!!invalid} value={lessonId} onChange={e=>change(()=>{setLessonId(e.target.value);setDemoId('')})}><option value="">{t('course.narration.choose')}</option>{choices.map(c=><option key={c.lesson.id} value={c.lesson.id}>{c.label}</option>)}</select></label>
    <label>{t('course.demoPlace.demo')}<select disabled={dirty||!lesson} value={demoId} onChange={e=>change(()=>{setDemoId(e.target.value);setSourceOffset('0')})}><option value="">{t('course.demoPlace.choose')}</option>{lesson?.demonstrations?.map(d=><option key={d.id} value={d.id}>{d.title}</option>)}</select></label>
    {lesson&&<p>{t('course.demoPlace.lessonRange',{start:seconds(lesson.range.inMs),end:seconds(lesson.range.outMs)})}</p>}
    {demo&&<div className="stack"><strong>{demo.title}</strong><code>{demo.evidence?.uri??t('course.evidence.none')}</code>{asset?.metadata.sourceKind!==undefined&&<small>{String(asset.metadata.sourceKind)}</small>}{asset?.kind==='video'&&typeof asset.metadata.durationMs==='number'&&<p>{t('course.demoPlace.mediaDuration',{seconds:seconds(asset.metadata.durationMs)})}</p>}</div>}
    <div className="formRow"><label>{t('course.demoPlace.offset')}<input inputMode="decimal" value={offset} disabled={dirty} onChange={e=>change(()=>setOffset(e.target.value))}/></label><label>{t('course.demoPlace.duration')}<input inputMode="decimal" value={duration} disabled={dirty} onChange={e=>change(()=>setDuration(e.target.value))}/></label><label>{t('course.demoPlace.sourceOffset')}<input inputMode="decimal" value={sourceOffset} disabled={dirty||asset?.kind==='image'} onChange={e=>change(()=>setSourceOffset(e.target.value))}/></label></div>
    <button disabled={dirty||!demo||!!invalid} onClick={inspect}>{t('course.demoPlace.review')}</button>
    {review&&!current&&<p role="alert">{t('course.demoPlace.stale')}</p>}
    {review&&current&&<div className="stack"><p>{t('course.demoPlace.summary',{lesson:review.value.lessonTitle,demo:review.value.demoTitle,start:seconds(review.value.startMs),end:seconds(review.value.endMs),source:seconds(review.value.sourceOffsetMs),duration:seconds(review.value.durationMs),revision:review.value.revision})}</p><code>{review.value.uri}</code><label className="researchBriefAck"><input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)}/>{t('course.demoPlace.ack')}</label><button disabled={!ack} onClick={save}>{t('course.demoPlace.save')}</button></div>}
    {dirty&&<p>{t('course.workspace.draft')}</p>}
    {(invalid||shown)&&<div role={shown?.code==='saved'?'status':'alert'}>{t(`course.demoPlace.${invalid?'source':shown!.code==='ack'?'ackError':shown!.code}`)}{(invalid||shown?.detail)&&<details><summary>{t('common.details')}</summary>{invalid||shown?.detail}</details>}</div>}
  </section>
}
