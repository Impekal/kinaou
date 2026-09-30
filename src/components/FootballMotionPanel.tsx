import {useEffect,useRef,useState} from 'react'
import {footballSequenceAsset} from '../core/footballSequence'
import {footballBoardSvg,parseFootballTactics} from '../core/footballTactics'
import {footballMotionFrame,parseFootballMotion,placeFootballMotion,validateFootballMotionProbe,type FootballMotion} from '../core/footballMotion'
import {encodeFootballMotion} from '../core/footballMotionEncoder'
import {AssetImportSession,type AssetImportFeedback} from '../core/assetImportSession'
import {WorkerClient} from '../core/workerClient'
import {compatibleTracks} from '../core/timelinePlacement'
import type {KinaouProject} from '../core/project'
import type {PersistentVersionHistory} from '../core/versioning'
import {AssetImportStatus} from './AssetUploadPanel'
import {AssetPlacementControl} from './AssetPlacementControl'
import {useUiLanguage} from './UiLanguageProvider'
interface Props {project:KinaouProject;history:PersistentVersionHistory;workerUrl:string;workerToken:string;workerConnected:boolean;workerCapabilities:string[];managedRoots:string[];onProjectChange:(project:KinaouProject)=>void}
export function FootballMotionPanel({project,history,workerUrl,workerToken,workerConnected,workerCapabilities,managedRoots,onProjectChange}:Props){
  const {t}=useUiLanguage(),choices=project.assets.filter(footballSequenceAsset)
  const [from,setFrom]=useState(''),[to,setTo]=useState(''),[title,setTitle]=useState(''),[seconds,setSeconds]=useState(4),[review,setReview]=useState<{motion:FootballMotion;scope:number}|null>(null),[ack,setAck]=useState(false),[busy,setBusy]=useState(false),[progress,setProgress]=useState(0),[error,setError]=useState(''),[cancelled,setCancelled]=useState(false),[feedback,setFeedback]=useState<AssetImportFeedback|null>(null)
  const connection=JSON.stringify([workerUrl,workerToken,workerConnected,[...workerCapabilities].sort(),managedRoots]),identity=JSON.stringify([project,connection,from,to,title,seconds]),observed=useRef({identity,generation:0})
  if(observed.current.identity!==identity)observed.current={identity,generation:observed.current.generation+1}
  const current=review?.scope===observed.current.generation?review:null,controller=useRef<AbortController|null>(null),session=useRef<AssetImportSession|null>(null),mounted=useRef(true),flight=useRef(false),environment=useRef({project,connection});environment.current={project,connection};session.current?.observe(project,connection)
  useEffect(()=>()=>{controller.current?.abort()},[identity])
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;controller.current?.abort();session.current?.detach()}},[])
  const locked=busy||Boolean(session.current?.unresolved),available=workerConnected&&!!workerToken.trim()&&workerCapabilities.includes('asset-upload'),videos=project.assets.filter(a=>a.kind==='video'&&a.metadata.sourceKind==='authored-football-motion-v1')
  function changed(){setReview(null);setAck(false);setError('');setCancelled(false)}
  function prepare(){changed();try{const a=choices.find(a=>a.id===from),b=choices.find(a=>a.id===to);if(!a||!b)throw Error('Select two saved compatible boards');setReview({motion:parseFootballMotion({schemaVersion:1,from:a.metadata.board,to:b.metadata.board,title,durationMs:seconds*1000}),scope:observed.current.generation})}catch(cause){setError(String(cause))}}
  async function generate(){
    if(!current||!ack||!available||locked||flight.current)return
    const accepted=current,abort=new AbortController();controller.current=abort;flight.current=true;setBusy(true);setProgress(0);setError('');setCancelled(false)
    const valid=()=>mounted.current&&!abort.signal.aborted&&observed.current.generation===accepted.scope
    try{
      const file=await encodeFootballMotion(accepted.motion,abort.signal,(done,total)=>{if(valid())setProgress(Math.round(done/total*100))})
      if(!valid())return
      const client=new WorkerClient({baseUrl:workerUrl,token:workerToken})
      const task=new AssetImportSession(project,connection,file,'video',{client:{importAsset:(blob,name)=>client.importAsset(blob,name),probe:async path=>validateFootballMotionProbe(await client.probe(path),accepted.motion.durationMs)},environment:()=>environment.current,
        assetMetadata:{sourceKind:'authored-football-motion-v1',authored:true,illustrationOnly:true,renderer:'webcodecs-vp8-ivf-v1',fromAssetId:from,toAssetId:to,motion:accepted.motion,interpolation:'linear',arrows:'omitted',fps:25},
        snapshot:p=>{history.snapshot(p,'Before saving imported media','system')},persist:p=>{onProjectChange(p);environment.current={project:p,connection}},publish:value=>{if(mounted.current&&session.current===task){setFeedback(value);if(value.phase==='succeeded'){setReview(null);setAck(false)}}}})
      session.current=task;setBusy(false);await task.run()
    }catch(cause){if(mounted.current){if(abort.signal.aborted)setCancelled(true);else setError(String(cause))}}finally{flight.current=false;if(controller.current===abort)controller.current=null;if(mounted.current)setBusy(false)}
  }
  const visibleFeedback=feedback&&session.current?.wasDetached?{...feedback,phase:'detached' as const}:feedback
  function newTrack(id:string){try{const next=placeFootballMotion(project,id,t('tactics.motionHeading'));history.snapshot(project,'Before manual timeline edit','system');onProjectChange(next);setError('')}catch(cause){setError(String(cause))}}
  return <section className="card stack tacticsSequence"><h3>{t('tactics.motionHeading')}</h3><p>{t('tactics.motionHelp')}</p><p>{t('tactics.motionBoundary')}</p>
    {([['from',from,setFrom],['to',to,setTo]] as const).map(([key,value,set])=><label key={key}>{t(key==='from'?'tactics.motionFrom':'tactics.motionTo')}<select disabled={locked} value={value} onChange={e=>{changed();set(e.target.value)}}><option value="">{t('tactics.sequenceChoose')}</option>{choices.map(a=><option key={a.id} value={a.id}>{parseFootballTactics(a.metadata.board).title||String(a.metadata.name??a.id)}</option>)}</select></label>)}
    <label>{t('tactics.title')}<input maxLength={60} disabled={locked} value={title} onChange={e=>{changed();setTitle(e.target.value)}}/></label>
    <label>{t('tactics.motionDuration')}<input type="number" min={2} max={10} step={1} disabled={locked} value={Number.isFinite(seconds)?seconds:''} onChange={e=>{changed();setSeconds(e.target.valueAsNumber)}}/></label>
    <button className="secondaryButton" disabled={locked||!from||!to} onClick={prepare}>{t('tactics.motionReview')}</button>
    {current&&<div className="stack"><div className="tacticsSequenceReview">{[0,Math.floor(current.motion.durationMs/80),current.motion.durationMs/40-1].map((frame,index)=><div key={frame}><strong>{t(index===0?'tactics.motionFrom':index===1?'tactics.motionMiddle':'tactics.motionTo')}</strong><img alt={t('tactics.preview')} src={'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(footballBoardSvg(footballMotionFrame(current.motion,frame)))}/></div>)}</div><label className="tacticsAck"><input type="checkbox" checked={ack} disabled={locked} onChange={e=>setAck(e.target.checked)}/>{t('tactics.motionAck')}</label><button className="primary" disabled={locked||!available||!ack} onClick={()=>void generate()}>{t('tactics.motionGenerate')}</button></div>}
    {!available&&<p>{t('tactics.unavailable')}</p>}
    {busy&&<div role="status">{t('tactics.motionProgress')} {progress}% <button className="secondaryButton" onClick={()=>controller.current?.abort()}>{t('tactics.motionCancel')}</button></div>}
    {cancelled&&<p role="status">{t('tactics.motionCancelled')}</p>}
    {visibleFeedback&&<AssetImportStatus feedback={visibleFeedback} onRetry={()=>void session.current?.run()} onDetach={()=>{session.current?.detach();setFeedback(v=>v?{...v,phase:'detached'}:null)}}/>}
    {error&&<div role="alert">{t('tactics.motionError')}<details><summary>{t('common.details')}</summary>{error}</details></div>}
    {videos.map(asset=><div className="tacticsSaved" key={asset.id}><code>{asset.uri}</code>{!compatibleTracks(project,asset).length&&<button disabled={locked} className="secondaryButton" onClick={()=>newTrack(asset.id)}>{t('tactics.motionPlace')}</button>}<AssetPlacementControl project={project} asset={asset} onProjectChange={next=>{history.snapshot(project,'Before manual timeline edit','system');onProjectChange(next)}}/></div>)}
  </section>
}
