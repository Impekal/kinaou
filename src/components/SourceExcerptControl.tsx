import { useEffect,useRef,useState } from 'react'
import type { PublicSourceResult } from '../../worker/public-source-protocol.mjs'
import { SourceExcerptSession,type SourceExcerpt } from '../core/sourceExcerpt'
import { useUiLanguage } from './UiLanguageProvider'

export function SourceExcerptList({excerpts,onRemove}:{excerpts:SourceExcerpt[];onRemove?:(index:number)=>void}){
 const {t}=useUiLanguage()
 if(!excerpts.length)return null
 return <section className="stack sourceExcerpts"><h4>{t('sourceExcerpt.savedHeading')}</h4><p>{t('sourceExcerpt.boundary')}</p>{excerpts.map((excerpt,index)=><article className="sourceExcerpt stack" key={JSON.stringify([excerpt.originalUrl,excerpt.quote])}>
  <blockquote>{excerpt.quote}</blockquote><a href={excerpt.originalUrl} target="_blank" rel="noopener noreferrer">{excerpt.originalUrl}</a>
  <p>{excerpt.source.title}</p><p>{t('sourceReader.received',{date:excerpt.source.retrievedAt,bytes:excerpt.source.htmlBytes})}</p>
  <details><summary>{t('sourceReader.provenance')}</summary><p>{t('sourceExcerpt.offsets',{start:excerpt.startCharacter,end:excerpt.endCharacter})}</p><p>{t('sourceReader.mode',{mode:excerpt.source.extraction})}</p><p>{t('sourceReader.language',{language:excerpt.source.declaredLanguage??'—'})}</p><a href={excerpt.source.finalUrl} target="_blank" rel="noopener noreferrer">{excerpt.source.finalUrl}</a><ol>{excerpt.source.redirectUrls.map(url=><li key={url}>{url}</li>)}</ol><p>{excerpt.displayTruncated?t('sourceReader.truncated'):t('sourceReader.incomplete')}</p><code>SHA-256: {excerpt.source.htmlSha256}</code></details>
  {onRemove&&<button className="secondaryButton" onClick={()=>onRemove(index)}>{t('sourceExcerpt.remove',{index:index+1})}</button>}
 </article>)}</section>
}
export function SourceExcerptControl({result,originalUrl,scope,onAppend}:{result:PublicSourceResult;originalUrl:string;scope:string;onAppend:(excerpt:SourceExcerpt)=>void}){
 const {t,language}=useUiLanguage(),session=useRef(new SourceExcerptSession()),[selected,setSelected]=useState(''),[review,setReview]=useState<SourceExcerpt|null>(null),[ack,setAck]=useState(false),[error,setError]=useState(''),[added,setAdded]=useState(false)
 session.current.observe(scope,result,originalUrl,selected,language)
 useEffect(()=>()=>session.current.detach(),[])
 const current=review&&session.current.current(review)
 function prepare(){setReview(null);setAck(false);setAdded(false);setError('');try{setReview(session.current.prepare(scope,result,originalUrl,selected,language))}catch(cause){setError(String(cause))}}
 function append(){if(!review||!current||!ack)return;setError('');try{session.current.commit(review,ack,onAppend);setReview(null);setSelected('');setAck(false);setAdded(true)}catch(cause){setError(String(cause))}}
 return <section className="sourceExcerptComposer stack" aria-label={t('sourceExcerpt.heading')}><h4>{t('sourceExcerpt.heading')}</h4><p>{t('sourceExcerpt.help')}</p>
  <label>{t('sourceExcerpt.input')}<textarea rows={4} maxLength={600} value={selected} onChange={event=>{setSelected(event.target.value);setReview(null);setAck(false);setAdded(false);setError('')}}/></label>
  <button className="secondaryButton" disabled={!selected} onClick={prepare}>{t('sourceExcerpt.prepare')}</button>
  {review&&!current&&<p role="alert">{t('sourceReader.stale')}</p>}
  {review&&current&&<><SourceExcerptList excerpts={[review]}/><label className="researchBriefAck"><input type="checkbox" checked={ack} onChange={event=>setAck(event.target.checked)}/>{t('sourceExcerpt.ack')}</label><button className="primary" disabled={!ack} onClick={append}>{t('sourceExcerpt.append')}</button></>}
  {added&&<p role="status">{t('sourceExcerpt.added')}</p>}
  {error&&<div role="alert">{t('sourceExcerpt.failed')}<details><summary>{t('common.details')}</summary>{error}</details></div>}
 </section>
}
