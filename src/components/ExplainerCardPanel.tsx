import { useEffect, useRef, useState } from 'react'
import { createExplainerCard, parseExplainerCard, rasterizeExplainerCard, validateExplainerProbe, placeExplainerOnNewTrack, type ExplainerCard } from '../core/explainerCard'
import { projectContentProfile } from '../core/contentProfile'
import { compatibleTracks } from '../core/timelinePlacement'
import { AssetImportSession, type AssetImportFeedback } from '../core/assetImportSession'
import { AiEditorRequestScope } from '../core/aiEditorReview'
import type { KinaouProject } from '../core/project'
import type { PersistentVersionHistory } from '../core/versioning'
import { WorkerClient } from '../core/workerClient'
import { AssetImportStatus } from './AssetUploadPanel'
import { AssetPlacementControl } from './AssetPlacementControl'
import { useUiLanguage } from './UiLanguageProvider'

interface Props { project: KinaouProject; history: PersistentVersionHistory; workerUrl: string; workerToken: string; workerConnected: boolean; workerCapabilities: string[]; managedRoots: string[]; onProjectChange: (project: KinaouProject) => void }
export function ExplainerCardPanel({project,history,workerUrl,workerToken,workerConnected,workerCapabilities,managedRoots,onProjectChange}:Props) {
  const {t,language}=useUiLanguage(),[card,setCard]=useState(()=>createExplainerCard(projectContentProfile(project).outputLanguage))
  const [review,setReview]=useState<{card:ExplainerCard;file:File;url:string;current:()=>boolean}|null>(null),[ack,setAck]=useState(false),[preparing,setPreparing]=useState(false),[error,setError]=useState(''),[feedback,setFeedback]=useState<AssetImportFeedback|null>(null)
  const scope=useRef(new AiEditorRequestScope()),session=useRef<AssetImportSession|null>(null),mounted=useRef(true),flight=useRef(false)
  const persist=useRef(onProjectChange);persist.current=onProjectChange
  const connection=JSON.stringify([workerUrl,workerToken,workerConnected,[...workerCapabilities].sort(),managedRoots]),environment=useRef({project,connection});environment.current={project,connection}
  session.current?.observe(project,connection);scope.current.update(JSON.stringify([project,connection,card,language]))
  useEffect(()=>{mounted.current=true;scope.current.attach();return()=>{mounted.current=false;scope.current.detach();session.current?.detach()}},[])
  useEffect(()=>()=>{if(review)URL.revokeObjectURL(review.url)},[review])
  const locked=preparing||Boolean(session.current?.unresolved),available=workerConnected&&!!workerToken.trim()&&workerCapabilities.includes('asset-upload'),current=review?.current()
  const saved=project.assets.filter(asset=>asset.kind==='image'&&asset.metadata.sourceKind==='authored-explainer-card-v1')
  function edit(patch:Partial<ExplainerCard>){if(locked)return;setCard(value=>({...value,...patch}));setReview(null);setAck(false);setError('')}
  async function prepare(){
    if(locked||flight.current)return
    flight.current=true;setPreparing(true);setReview(null);setAck(false);setError('')
    const isCurrent=scope.current.begin()
    try{const value=parseExplainerCard(card),file=await rasterizeExplainerCard(value);if(isCurrent()&&mounted.current)setReview({card:value,file,url:URL.createObjectURL(file),current:isCurrent})}
    catch(cause){if(isCurrent()&&mounted.current)setError(String(cause))}
    finally{flight.current=false;if(mounted.current)setPreparing(false)}
  }
  async function save(){
    if(!review||!current||!ack||!available||locked||flight.current)return
    flight.current=true;setError('')
    const client=new WorkerClient({baseUrl:workerUrl,token:workerToken})
    try{
      const task=new AssetImportSession(project,connection,review.file,'image',{
        client:{importAsset:(blob,name)=>client.importAsset(blob,name),probe:async path=>validateExplainerProbe(await client.probe(path),review.card)},
        environment:()=>environment.current,assetMetadata:{sourceKind:'authored-explainer-card-v1',authored:true,illustrationOnly:true,renderer:'canvas-explainer-png-v1',card:review.card},
        snapshot:value=>{history.snapshot(value,'Before saving imported media','system')},persist:value=>{persist.current(value);environment.current={project:value,connection}},
        publish:value=>{if(mounted.current&&session.current===task){setFeedback(value);if(value.phase==='succeeded'){setAck(false);setReview(null)}}}
      });session.current=task;await task.run()
    }catch(cause){if(mounted.current)setError(String(cause))}finally{flight.current=false}
  }
  function newTrack(assetId:string){try{const next=placeExplainerOnNewTrack(project,assetId,t('explainer.heading'));history.snapshot(project,'Before manual timeline edit','system');onProjectChange(next);setError('')}catch(cause){setError(String(cause))}}
  const visibleFeedback=feedback&&session.current?.wasDetached?{...feedback,phase:'detached' as const}:feedback
  return <section className="card stack explainerPanel"><h2>{t('explainer.heading')}</h2><p>{t('explainer.help')}</p><p className="note">{t('explainer.boundary')}</p><p>{t('explainer.draft')}</p>
    <div className="formRow"><label>{t('explainer.format')}<select value={card.format} disabled={locked} onChange={e=>edit({format:e.target.value as ExplainerCard['format']})}>{(['landscape','portrait','square'] as const).map(value=><option key={value} value={value}>{t(`explainer.${value}`)}</option>)}</select></label><label>{t('explainer.theme')}<select value={card.theme} disabled={locked} onChange={e=>edit({theme:e.target.value as ExplainerCard['theme']})}>{(['indigo','paper'] as const).map(value=><option key={value} value={value}>{t(`explainer.${value}`)}</option>)}</select></label></div>
    <label>{t('explainer.language')}<select value={card.language} disabled={locked} onChange={e=>edit({language:e.target.value as ExplainerCard['language']})}><option value="de">Deutsch</option><option value="en">English</option><option value="fr">Français</option></select></label><small>{t('explainer.languageHelp')}</small>
    <label>{t('explainer.label')}<input maxLength={40} value={card.label} disabled={locked} onChange={e=>edit({label:e.target.value})}/></label>
    <label>{t('explainer.title')}<textarea maxLength={90} value={card.title} disabled={locked} onChange={e=>edit({title:e.target.value})}/></label>
    {card.points.map((point,index)=><label key={index}>{t('explainer.point',{index:index+1})}<textarea maxLength={240} value={point} disabled={locked} onChange={e=>edit({points:card.points.map((value,i)=>i===index?e.target.value:value)})}/></label>)}
    <div className="directorActions"><button className="secondaryButton" disabled={locked||card.points.length>=4} onClick={()=>edit({points:[...card.points,'']})}>{t('explainer.add')}</button><button className="secondaryButton" disabled={locked||card.points.length<=1} onClick={()=>edit({points:card.points.slice(0,-1)})}>{t('explainer.remove')}</button></div>
    <label>{t('explainer.source')}<textarea maxLength={160} value={card.source} disabled={locked} onChange={e=>edit({source:e.target.value})}/></label>
    <button disabled={locked} onClick={()=>void prepare()}>{t(preparing?'explainer.preparing':'explainer.prepare')}</button>
    {review&&!current&&<p role="alert">{t('explainer.stale')}</p>}
    {review&&current&&<div className="stack"><img className="explainerPreview" src={review.url} alt={t('explainer.preview')}/><p>{t('explainer.preview')} · {review.file.size.toLocaleString(language)} bytes</p><label className="researchBriefAck"><input type="checkbox" checked={ack} disabled={locked} onChange={e=>setAck(e.target.checked)}/>{t('explainer.ack')}</label><button className="primary" disabled={!available||!ack||locked} onClick={()=>void save()}>{t('explainer.save')}</button></div>}
    {!available&&<p>{t('explainer.unavailable')}</p>}
    {visibleFeedback&&<AssetImportStatus feedback={visibleFeedback} onRetry={()=>void session.current?.run()} onDetach={()=>{session.current?.detach();setFeedback(value=>value?{...value,phase:'detached'}:null)}}/>}
    {error&&<div role="alert">{t('explainer.error')}<details><summary>{t('common.details')}</summary>{error}</details></div>}
    {!!saved.length&&<section className="stack"><h3>{t('explainer.saved')}</h3>{saved.map(asset=><div key={asset.id} className="card stack"><strong>{String((asset.metadata.card as ExplainerCard|undefined)?.title??'')}</strong><code>{asset.uri}</code><button disabled={locked} onClick={()=>{try{const value=parseExplainerCard(asset.metadata.card);edit(value)}catch(cause){setError(String(cause))}}}>{t('explainer.edit')}</button>{!compatibleTracks(project,asset).length&&<button disabled={locked} onClick={()=>newTrack(asset.id)}>{t('explainer.newTrack')}</button>}<AssetPlacementControl project={project} asset={asset} onProjectChange={value=>{history.snapshot(project,'Before manual timeline edit','system');onProjectChange(value)}}/></div>)}</section>}
  </section>
}
