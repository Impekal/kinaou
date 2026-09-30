import { useRef, useState } from 'react'
import { commitFootballSequence, footballSequenceAsset, reviewFootballSequence, type FootballSequenceDraft, type FootballSequenceReview } from '../core/footballSequence'
import { footballBoardSvg, parseFootballTactics } from '../core/footballTactics'
import type { KinaouProject } from '../core/project'
import type { PersistentVersionHistory } from '../core/versioning'
import { useUiLanguage } from './UiLanguageProvider'
export function FootballSequencePanel({project,history,onProjectChange}:{project:KinaouProject;history:PersistentVersionHistory;onProjectChange:(project:KinaouProject)=>void}) {
  const {t}=useUiLanguage(), choices=project.assets.filter(footballSequenceAsset)
  const [draft,setDraft]=useState<FootballSequenceDraft>({name:'',startMs:0,steps:[]}),[review,setReview]=useState<{value:FootballSequenceReview;scope:number}|null>(null),[ack,setAck]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState('')
  const identity=JSON.stringify([project,draft]),observed=useRef({identity,generation:0})
  if(observed.current.identity!==identity)observed.current={identity,generation:observed.current.generation+1}
  const current=review?.scope===observed.current.generation?review.value:null
  function edit(next:FootballSequenceDraft){setDraft(next);setReview(null);setAck(false);setError('');setSaved('')}
  function move(index:number,delta:number){const steps=[...draft.steps];[steps[index],steps[index+delta]]=[steps[index+delta],steps[index]];edit({...draft,steps})}
  function prepare(){setReview(null);setAck(false);setError('');setSaved('');try{setReview({value:reviewFootballSequence(project,draft),scope:observed.current.generation})}catch(cause){setError(String(cause))}}
  function save(){if(!current||!ack)return;try{commitFootballSequence(project,current,ack,p=>{history.snapshot(p,'Before manual timeline edit','system')},onProjectChange);setSaved(current.draft.name);setReview(null);setAck(false);setError('')}catch(cause){setError(String(cause))}}
  const label=(id:string)=>{const asset=choices.find(a=>a.id===id);return asset?parseFootballTactics(asset.metadata.board).title||String(asset.metadata.name??asset.id):t('tactics.sequenceMissing')}
  return <section className="card stack tacticsSequence">
    <h3>{t('tactics.sequenceHeading')}</h3><p>{t('tactics.sequenceHelp')}</p>
    {!choices.length&&<p>{t('tactics.sequenceEmpty')}</p>}
    <label>{t('tactics.sequenceName')}<input maxLength={120} value={draft.name} onChange={e=>edit({...draft,name:e.target.value})}/></label>
    <label>{t('tactics.sequenceStart')}<input type="number" min={0} max={3600} step={0.1} value={Number.isFinite(draft.startMs)?draft.startMs/1000:''} onChange={e=>edit({...draft,startMs:Math.round(e.target.valueAsNumber*1000)})}/></label>
    {draft.steps.map((step,index)=><fieldset key={index}><legend>{t('tactics.sequenceStep')} {index+1}</legend>
      <label>{t('tactics.sequenceImage')}<select value={step.assetId} onChange={e=>edit({...draft,steps:draft.steps.map((s,i)=>i===index?{...s,assetId:e.target.value}:s)})}><option value="">{t('tactics.sequenceChoose')}</option>{choices.map(a=><option key={a.id} value={a.id}>{label(a.id)} · {String(a.metadata.name??a.id)}</option>)}</select></label>
      <label>{t('tactics.sequenceDuration')}<input type="number" min={1} max={60} step={0.1} value={Number.isFinite(step.durationMs)?step.durationMs/1000:''} onChange={e=>edit({...draft,steps:draft.steps.map((s,i)=>i===index?{...s,durationMs:Math.round(e.target.valueAsNumber*1000)}:s)})}/></label>
      <div className="directorActions"><button className="secondaryButton" disabled={index===0} onClick={()=>move(index,-1)}>{t('tactics.sequenceUp')}</button><button className="secondaryButton" disabled={index===draft.steps.length-1} onClick={()=>move(index,1)}>{t('tactics.sequenceDown')}</button><button className="secondaryButton" onClick={()=>edit({...draft,steps:draft.steps.filter((_,i)=>i!==index)})}>{t('tactics.sequenceRemove')}</button></div>
    </fieldset>)}
    <button className="secondaryButton" disabled={!choices.length||draft.steps.length>=12} onClick={()=>edit({...draft,steps:[...draft.steps,{assetId:'',durationMs:5000}]})}>{t('tactics.sequenceAdd')}</button>
    <button className="secondaryButton" disabled={draft.steps.length<2} onClick={prepare}>{t('tactics.sequenceReview')}</button>
    {current&&<div className="stack"><h4>{t('tactics.sequenceProposal')}</h4><p>{current.draft.name} · {current.draft.startMs/1000}–{current.endMs/1000} s</p><p>{t('tactics.sequencePreviewHelp')}</p>
      <ol className="tacticsSequenceReview">{current.draft.steps.map((step,index)=>{const asset=choices.find(a=>a.id===step.assetId)!;return <li key={index}><strong>{label(asset.id)}</strong> · {step.durationMs/1000} s<img alt={t('tactics.preview')} src={'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(footballBoardSvg(parseFootballTactics(asset.metadata.board)))}/><code>{asset.uri}</code></li>})}</ol>
      <label className="tacticsAck"><input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)}/>{t('tactics.sequenceAck')}</label><button className="primary" disabled={!ack} onClick={save}>{t('tactics.sequenceSave')}</button>
    </div>}
    {review&&!current&&<p role="status">{t('tactics.sequenceStale')}</p>}
    {error&&<div role="alert">{t('tactics.sequenceError')}<details><summary>{t('common.details')}</summary>{error}</details></div>}
    {saved&&<p role="status">{t('tactics.sequenceSaved')} {saved}</p>}
  </section>
}
