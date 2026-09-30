import { useEffect, useRef, useState, type ComponentProps } from 'react'
import { createExplainerReveal, explainerRevealDuration, placeExplainerReveal, validateExplainerRevealProbe, type ExplainerReveal } from '../core/explainerReveal'
import { encodeExplainerReveal, type PreparedExplainerReveal } from '../core/explainerRevealEncoder'
import { AssetImportSession, type AssetImportFeedback } from '../core/assetImportSession'
import { AiEditorRequestScope } from '../core/aiEditorReview'
import { WorkerClient } from '../core/workerClient'
import { compatibleTracks } from '../core/timelinePlacement'
import { ExplainerCardPanel } from './ExplainerCardPanel'
import { AssetImportStatus } from './AssetUploadPanel'
import { AssetPlacementControl } from './AssetPlacementControl'
import { useUiLanguage } from './UiLanguageProvider'

export function ExplainerRevealPanel({project,history,workerUrl,workerToken,workerConnected,workerCapabilities,managedRoots,onProjectChange}:ComponentProps<typeof ExplainerCardPanel>){
  const {t,language}=useUiLanguage(),[sourceId,setSourceId]=useState(''),[stepMs,setStepMs]=useState(2000),[ack,setAck]=useState(false),[error,setError]=useState('')
  const [review,setReview]=useState<(PreparedExplainerReveal&{reveal:ExplainerReveal;current:()=>boolean})|null>(null),[progress,setProgress]=useState<number|null>(null),[feedback,setFeedback]=useState<AssetImportFeedback|null>(null),[cancelled,setCancelled]=useState(false)
  const scope=useRef(new AiEditorRequestScope()),session=useRef<AssetImportSession|null>(null),mounted=useRef(true),flight=useRef(false),controller=useRef<AbortController|null>(null)
  const persist=useRef(onProjectChange);persist.current=onProjectChange
  const connection=JSON.stringify([workerUrl,workerToken,workerConnected,[...workerCapabilities].sort(),managedRoots]),environment=useRef({project,connection});environment.current={project,connection}
  const identity=JSON.stringify([project,connection,sourceId,stepMs,language]),observed=useRef(identity)
  if(observed.current!==identity){observed.current=identity;controller.current?.abort()}
  scope.current.update(identity);session.current?.observe(project,connection)
  useEffect(()=>{mounted.current=true;scope.current.attach();return()=>{mounted.current=false;scope.current.detach();controller.current?.abort();session.current?.detach()}},[])
  const sources=project.assets.filter(a=>a.kind==='image'&&a.metadata.sourceKind==='authored-explainer-card-v1'),saved=project.assets.filter(a=>a.kind==='video'&&a.metadata.sourceKind==='authored-explainer-reveal-v1')
  const busy=progress!==null,locked=busy||Boolean(session.current?.unresolved),available=workerConnected&&!!workerToken.trim()&&workerCapabilities.includes('asset-upload'),current=review?.current()
  function change(source:string,step:number){if(locked)return;setSourceId(source);setStepMs(step);setReview(null);setAck(false);setError('')}
  async function prepare(){
    if(locked||flight.current)return
    flight.current=true;setReview(null);setAck(false);setError('');setCancelled(false);setProgress(0)
    const isCurrent=scope.current.begin(),abort=new AbortController();controller.current=abort
    try{const reveal=createExplainerReveal(project,sourceId,stepMs),result=await encodeExplainerReveal(reveal,abort.signal,(done,total)=>{if(isCurrent()&&mounted.current)setProgress(Math.round(done/total*100))});if(isCurrent()&&mounted.current)setReview({...result,reveal,current:isCurrent})}
    catch(cause){if(isCurrent()&&mounted.current){if(cause instanceof DOMException&&cause.name==='AbortError')setCancelled(true);else setError(String(cause))}}
    finally{flight.current=false;controller.current=null;if(mounted.current)setProgress(null)}
  }
  async function save(){
    if(!review||!current||!ack||!available||locked||flight.current)return
    flight.current=true;setError('')
    const client=new WorkerClient({baseUrl:workerUrl,token:workerToken})
    try{
      const task=new AssetImportSession(project,connection,review.file,'video',{
        client:{importAsset:(blob,name)=>client.importAsset(blob,name),probe:async path=>validateExplainerRevealProbe(await client.probe(path),review.reveal)},environment:()=>environment.current,
        assetMetadata:{sourceKind:'authored-explainer-reveal-v1',authored:true,illustrationOnly:true,renderer:'canvas-vp8-reveal-v1',reveal:review.reveal},
        snapshot:value=>{history.snapshot(value,'Before saving explainer reveal','system')},persist:value=>{persist.current(value);environment.current={project:value,connection}},
        publish:value=>{if(mounted.current&&session.current===task){setFeedback(value);if(value.phase==='succeeded'){setAck(false);setReview(null)}}}
      });session.current=task;await task.run()
    }catch(cause){if(mounted.current)setError(String(cause))}finally{flight.current=false}
  }
  const visibleFeedback=feedback&&session.current?.wasDetached?{...feedback,phase:'detached' as const}:feedback
  return <section className="card stack"><h2>{t('reveal.heading')}</h2><p>{t('reveal.help')}</p><p className="note">{t('reveal.boundary')}</p><p>{t('explainer.draft')}</p>
    <label>{t('reveal.source')}<select disabled={locked} value={sourceId} onChange={e=>change(e.target.value,stepMs)}><option value="">{t('reveal.choose')}</option>{sources.map(asset=><option key={asset.id} value={asset.id}>{String((asset.metadata.card as {title?:string})?.title??asset.id)}</option>)}</select></label>
    {!sources.length&&<p>{t('reveal.empty')}</p>}
    <label>{t('reveal.step')}<select disabled={locked} value={stepMs} onChange={e=>change(sourceId,Number(e.target.value))}>{[1000,2000,3000].map(ms=><option key={ms} value={ms}>{t('reveal.seconds',{seconds:ms/1000})}</option>)}</select></label>
    <button disabled={locked||!sourceId} onClick={()=>void prepare()}>{t('reveal.prepare')}</button>
    {busy&&<><p role="status">{t('reveal.progress',{percent:progress!})}</p><button onClick={()=>controller.current?.abort()}>{t('reveal.cancel')}</button></>}
    {cancelled&&<p role="status">{t('reveal.cancelled')}</p>}
    {review&&!current&&<p role="alert">{t('explainer.stale')}</p>}
    {review&&current&&<section className="stack"><h3>{review.reveal.card.title}</h3><p>{t('reveal.duration',{seconds:explainerRevealDuration(review.reveal)/1000})} · {review.file.size.toLocaleString(language)} bytes</p><p>{t('reveal.preview')}</p>
      <div className="revealFrames">{review.frames.map(frame=><figure key={frame.frame}><img src={frame.png} alt={t('reveal.frame',{seconds:(frame.frame*.04).toFixed(2)})}/><figcaption>{t('reveal.frame',{seconds:(frame.frame*.04).toFixed(2)})}</figcaption></figure>)}</div>
      <ol>{review.reveal.card.points.map((point,index)=><li key={index}>{t('reveal.at',{seconds:1+index*review.reveal.stepMs/1000})} — {point}</li>)}</ol>
      <label className="researchBriefAck"><input type="checkbox" checked={ack} disabled={locked} onChange={e=>setAck(e.target.checked)}/>{t('reveal.ack')}</label><button disabled={!available||!ack||locked} onClick={()=>void save()}>{t('reveal.save')}</button>
    </section>}
    {!available&&<p>{t('explainer.unavailable')}</p>}
    {visibleFeedback&&<AssetImportStatus feedback={visibleFeedback} onRetry={()=>void session.current?.run()} onDetach={()=>{session.current?.detach();setFeedback(value=>value?{...value,phase:'detached'}:null)}}/>}
    {error&&<div role="alert">{t('reveal.error')}<details><summary>{t('common.details')}</summary>{error}</details></div>}
    {!!saved.length&&<section className="stack"><h3>{t('reveal.saved')}</h3>{saved.map(asset=><div key={asset.id} className="card stack"><strong>{String((asset.metadata.reveal as ExplainerReveal|undefined)?.card?.title??asset.id)}</strong><code>{asset.uri}</code>{!compatibleTracks(project,asset).length&&<button disabled={locked} onClick={()=>{try{const next=placeExplainerReveal(project,asset.id,t('reveal.heading'));history.snapshot(project,'Before manual timeline edit','system');onProjectChange(next);setError('')}catch(cause){setError(String(cause))}}}>{t('reveal.newTrack')}</button>}<AssetPlacementControl project={project} asset={asset} onProjectChange={value=>{history.snapshot(project,'Before manual timeline edit','system');onProjectChange(value)}}/></div>)}</section>}
  </section>
}
