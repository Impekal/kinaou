import {useEffect,useMemo,useState} from 'react'
import type {KinaouProject} from '../core/project'
import {courseProductionOverview,filterCourseOverview,type CourseOverviewFilter,type CourseCoverage} from '../core/courseProductionOverview'
import {useUiLanguage} from './UiLanguageProvider'
function Coverage({value,kind}:{value:CourseCoverage;kind:'visuals'|'voice'}){
  const {t,language}=useUiLanguage(),[shown,setShown]=useState(20),seconds=(ms:number)=>(ms/1000).toLocaleString(language,{maximumFractionDigits:3})
  return <div className="stack"><p>{t(`course.overview.${kind}`,{covered:seconds(value.coveredMs),total:seconds(value.durationMs)})}</p><meter min={0} max={value.durationMs} value={value.coveredMs} aria-label={t(`course.overview.${kind}Label`)}/>{value.gaps.length?<details><summary>{t('course.overview.gaps',{count:value.gaps.length})}</summary><p>{t('course.overview.relative')}</p><ol>{value.gaps.slice(0,shown).map(g=><li key={g.startMs}>{seconds(g.startMs)}–{seconds(g.endMs)} s</li>)}</ol>{shown<value.gaps.length&&<button className="secondaryButton" onClick={()=>setShown(n=>n+20)}>{t('course.overview.moreGaps',{shown,total:value.gaps.length})}</button>}</details>:<small>{t('course.overview.noGaps')}</small>}</div>
}
export function CourseProductionOverviewPanel({project,dirty,onEditLesson}:{project:KinaouProject;dirty:boolean;onEditLesson:(moduleId:string,lessonId:string)=>void}){
  const {t,language}=useUiLanguage(),[filter,setFilter]=useState<CourseOverviewFilter>('all'),[page,setPage]=useState(0)
  const result=useMemo(()=>{try{return {rows:courseProductionOverview(project),error:''}}catch(cause){return {rows:[],error:String(cause)}}},[project])
  useEffect(()=>setPage(0),[project,filter])
  const rows=filterCourseOverview(result.rows,filter),last=Math.max(0,Math.ceil(rows.length/10)-1),current=Math.min(page,last)
  return <section className="card stack"><h3>{t('course.overview.heading')}</h3><p>{t('course.overview.help')}</p><p className="note">{t('course.overview.boundary')}</p>{dirty&&<p>{t('course.overview.dirty')}</p>}
    <label>{t('course.overview.filter')}<select value={filter} onChange={e=>setFilter(e.target.value as CourseOverviewFilter)}>{(['all','visualGaps','noScript','noExports'] as const).map(value=><option key={value} value={value}>{t(`course.overview.filter.${value}`)}</option>)}</select></label>
    {result.error?<div role="alert">{t('course.overview.error')}<details><summary>{t('common.details')}</summary>{result.error}</details></div>:<p>{t('course.overview.count',{shown:rows.length,total:result.rows.length})}</p>}
    {!result.error&&!rows.length&&<p>{t('course.overview.empty')}</p>}
    {rows.slice(current*10,current*10+10).map(row=><article className="card stack" key={JSON.stringify([project.id,row.lessonId,row.range,row.visuals.gaps,row.voice.gaps])}><h4>{row.label}</h4><p>{(row.range.inMs/1000).toLocaleString(language)}–{(row.range.outMs/1000).toLocaleString(language)} s · {t(row.scriptPresent?'course.overview.script':'course.overview.missingScript')}</p>
      <div className="courseCoverage"><Coverage value={row.visuals} kind="visuals"/><Coverage value={row.voice} kind="voice"/></div>
      <p>{t('course.overview.records',{captions:row.captionClips,linked:row.linkedDemonstrations,demos:row.demonstrations,complete:row.completeExercises,exercises:row.exercises,materials:row.materials})}</p>
      <p>{t('course.overview.exports',{total:row.exports,matching:row.matchingOutlineExports})}</p>{row.excludedClips>0&&<p className="note">{t('course.overview.excluded',{count:row.excludedClips})}</p>}
      <button disabled={dirty} onClick={()=>onEditLesson(row.moduleId,row.lessonId)}>{t('course.overview.edit')}</button>
    </article>)}
    {rows.length>10&&<div className="directorActions"><button disabled={!current} onClick={()=>setPage(current-1)}>{t('course.overview.previous')}</button><span>{t('course.overview.page',{current:current+1,total:last+1})}</span><button disabled={current===last} onClick={()=>setPage(current+1)}>{t('course.overview.next')}</button></div>}
  </section>
}
