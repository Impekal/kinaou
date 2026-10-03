import { useRef, useState } from 'react'
import type { KinaouAsset, KinaouProject } from '../core/project'
import type { PersistentVersionHistory } from '../core/versioning'
import { CourseNarrationPlacementError } from '../core/courseNarrationPlacement'
import { commitCourseNarrationRange, courseNarrationRangeIsCurrent, CourseNarrationRangeError, invalidateCourseNarrationRange, reviewCourseNarrationRange, type CourseNarrationRangeReview } from '../core/courseNarrationRange'
import type { UiMessageKey } from '../core/uiMessages'
import { useUiLanguage } from './UiLanguageProvider'

export function CourseNarrationRangeControl({ project, asset, history, onProjectChange, disabled = false }: { project: KinaouProject; asset: KinaouAsset; history: PersistentVersionHistory; onProjectChange: (next: KinaouProject) => void; disabled?: boolean }) {
 const {t,language}=useUiLanguage(),[review,setReview]=useState<CourseNarrationRangeReview|null>(null),[ack,setAck]=useState(false),[feedback,setFeedback]=useState<{project:KinaouProject;key:UiMessageKey;detail?:string}|null>(null)
 const scope=JSON.stringify([asset.id,language,disabled]),previous=useRef(scope)
 if(previous.current!==scope){if(review)invalidateCourseNarrationRange(review);previous.current=scope}
 const current=!!review&&courseNarrationRangeIsCurrent(project,review,disabled),shown=feedback?.project===project?feedback:null
 function report(cause:unknown){const key:UiMessageKey=cause instanceof CourseNarrationRangeError?`course.voiceRange.${cause.code}`:cause instanceof CourseNarrationPlacementError?`course.voicePlace.${cause.code==='track'?'trackError':cause.code}`:'course.voiceRange.failed';setFeedback({project,key,detail:cause instanceof CourseNarrationRangeError||cause instanceof CourseNarrationPlacementError?undefined:String(cause)})}
 function inspect(){if(disabled)return;setReview(null);setAck(false);setFeedback(null);try{setReview(reviewCourseNarrationRange(project,asset.id))}catch(cause){report(cause)}}
 function save(){if(!review||!current||!ack||disabled)return;try{const next=commitCourseNarrationRange(project,review,ack,{snapshot:value=>{history.snapshot(value,'Before extending lesson for full narration','system')},persist:onProjectChange});setReview(null);setAck(false);setFeedback({project:next,key:'course.voiceRange.saved'})}catch(cause){report(cause)}}
 const seconds=(value:number)=>(value/1000).toLocaleString(language,{maximumFractionDigits:3})
 return <details className="stack courseNarrationRange"><summary>{t('course.voiceRange.heading')}</summary><p>{t('course.voiceRange.help')}</p><button className="secondaryButton" disabled={disabled} onClick={inspect}>{t('course.voiceRange.review')}</button>
 {review&&<><p>{t('course.voiceRange.summary',{lesson:review.lessonTitle,start:seconds(review.startMs),previous:seconds(review.previousEndMs),end:seconds(review.endMs),duration:seconds(review.durationMs),source:review.sourceRevision,current:review.currentRevision})}</p>{!current&&<p role="alert">{t('course.voiceRange.stale')}</p>}<label><input type="checkbox" checked={ack&&current} disabled={!current} onChange={event=>setAck(event.target.checked)}/>{t('course.voiceRange.ack')}</label><button className="secondaryButton" disabled={!current||!ack} onClick={save}>{t('course.voiceRange.apply')}</button></>}
 {shown&&<p role={shown.key==='course.voiceRange.saved'?'status':'alert'}>{t(shown.key)}{shown.detail&&<code>{shown.detail}</code>}</p>}</details>
}
