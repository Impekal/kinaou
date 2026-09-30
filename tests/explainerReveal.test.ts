import {it,expect,vi} from 'vitest'
import {createExplainerCard,layoutExplainerCard,paintExplainerLayout} from '../src/core/explainerCard'
import {parseExplainerReveal,explainerRevealDuration,explainerRevealOpacity,createExplainerReveal,validateExplainerRevealProbe,placeExplainerReveal} from '../src/core/explainerReveal'
import {encodeExplainerReveal,explainerRevealContainer,type RevealChunk} from '../src/core/explainerRevealEncoder'
import {createProject,parseProject} from '../src/core/project'
import {nextImageView} from '../src/components/ImagesWorkspacePanel'
import {AssetImportSession,type AssetImportFeedback} from '../src/core/assetImportSession'
const reveal=()=>parseExplainerReveal({schemaVersion:1,sourceAssetId:'source',card:{...createExplainerCard('de'),points:['First','Second']},stepMs:1000})
it.each([1,2,3,4])('retains %i authored points with exact 25 fps cumulative timing',points=>{
  for(const stepMs of [1000,2000,3000]){
    const r={...reveal(),stepMs,card:{...reveal().card,points:Array.from({length:points},(_,i)=>'Point '+i)}},before=structuredClone(r)
    expect(explainerRevealDuration(r)).toBe(1000+points*stepMs)
    expect(explainerRevealOpacity(r,0)).toEqual(Array(points).fill(0))
    for(let i=0;i<points;i++){const start=(1000+i*stepMs)/40;expect(explainerRevealOpacity(r,start)[i]).toBe(0);expect(explainerRevealOpacity(r,start+3)[i]).toBe(.5);expect(explainerRevealOpacity(r,start+6)[i]).toBe(1)}
    expect(explainerRevealOpacity(r,explainerRevealDuration(r)/40-1)).toEqual(Array(points).fill(1));expect(r).toEqual(before)
  }
})
it.each([{stepMs:0},{stepMs:2500},{stepMs:4000},{sourceAssetId:''},{schemaVersion:2},{extra:true},{card:null}])('rejects invalid reveal %j',patch=>expect(()=>parseExplainerReveal({...reveal(),...patch})).toThrow())
it('rejects fractional/outside frames, preserves original metadata and only accepts authored-card lineage',()=>{
  for(const index of [-1,.5,75,NaN])expect(()=>explainerRevealOpacity(reveal(),index)).toThrow()
  const p=parseProject({...createProject('Source'),assets:[{id:'source',kind:'image',uri:'KINAOU/Assets/card.png',managed:true,offline:true,metadata:{sourceKind:'authored-explainer-card-v1',card:reveal().card}}]}),before=JSON.stringify(p)
  const value=createExplainerReveal(p,'source',1000);expect(value).toEqual(reveal());value.card.title='Mutation';expect(JSON.stringify(p)).toBe(before)
  expect(()=>createExplainerReveal(p,'other',1000)).toThrow();expect(()=>createExplainerReveal({...p,assets:[{...p.assets[0],kind:'video'}]},'source',1000)).toThrow()
})
it('tags point rows and text together while title/source/provenance remain visible; resets alpha after paint/failure',()=>{
  const layout=layoutExplainerCard(reveal().card,text=>text.length*10),draws:Array<{text:string;alpha:number}>=[]
  const ctx={globalAlpha:1,fillStyle:'',font:'',textBaseline:'',fillRect:()=>{},fillText:(text:string)=>draws.push({text,alpha:ctx.globalAlpha})}
  paintExplainerLayout(ctx as any,layout,[.5,0])
  expect(draws.find(d=>d.text==='First')?.alpha).toBe(.5);expect(draws.find(d=>d.text==='01')?.alpha).toBe(.5);expect(draws.find(d=>d.text==='Second')?.alpha).toBe(0);expect(draws.find(d=>d.text===reveal().card.title)?.alpha).toBe(1);expect(ctx.globalAlpha).toBe(1)
  expect(layout.rects.filter(r=>r.step!==undefined).map(r=>r.step)).toEqual([0,1])
  for(const alpha of [NaN,-1,2])expect(()=>paintExplainerLayout(ctx as any,layout,[alpha])).toThrow()
  ctx.fillText=()=>{throw Error('draw')};expect(()=>paintExplainerLayout(ctx as any,layout,[.5,0])).toThrow();expect(ctx.globalAlpha).toBe(1)
})
const chunks=(count=75):RevealChunk[]=>Array.from({length:count},(_,i)=>({timestamp:i*40000,key:i===0,data:new Uint8Array([i,1,2])}))
it.each(['landscape','portrait','square'] as const)('writes exact %s IVF headers/timestamps and validates measured video',async format=>{
  const value={...reveal(),card:{...reveal().card,format}},[width,height]=format==='landscape'?[1920,1080]:format==='portrait'?[1080,1920]:[1080,1080],buffer=await explainerRevealContainer(chunks(),value).arrayBuffer(),v=new DataView(buffer)
  expect(new TextDecoder().decode(buffer.slice(0,4))).toBe('DKIF');expect(new TextDecoder().decode(buffer.slice(8,12))).toBe('VP80')
  expect([v.getUint16(6,true),v.getUint16(12,true),v.getUint16(14,true),v.getUint32(16,true),v.getUint32(20,true),v.getUint32(24,true)]).toEqual([32,width,height,25,1,75])
  for(let i=0;i<75;i++)expect(v.getBigUint64(36+i*15,true)).toBe(BigInt(i))
  const probe={width,height,videoCodec:'vp8',fps:25,durationMs:3000};expect(validateExplainerRevealProbe(probe,value)).toBe(probe)
  for(const patch of [{width:1},{height:1},{videoCodec:'h264'},{fps:24},{durationMs:2960}])expect(()=>validateExplainerRevealProbe({...probe,...patch},value)).toThrow()
})
it.each(['missing','timestamp','key','empty','oversize'] as const)('rejects %s compressed output',issue=>{
  const c=chunks();if(issue==='missing')c.pop();if(issue==='timestamp')c[5].timestamp=2;if(issue==='key')c[0].key=false;if(issue==='empty')c[4].data=new Uint8Array();if(issue==='oversize')c[0].data=new Uint8Array(32*1024**2)
  expect(()=>explainerRevealContainer(c,reveal())).toThrow()
})
it.each(['success','maximum','abort','unsupported','error','encodeThrows','drawThrows','badPreview','missing','oversize','noContext','configureThrows','capabilityAbort','flushAbort'] as const)('local encoder handles %s and releases frames/resources without network',async outcome=>{
  const close=vi.fn(),frameClose=vi.fn(),fetch=vi.spyOn(globalThis,'fetch'),controller=new AbortController()
  class Frame{timestamp:number;constructor(_canvas:unknown,opts:{timestamp:number}){this.timestamp=opts.timestamp}close(){frameClose()}}
  class Encoder{
    state='configured';static isConfigSupported(){return outcome==='capabilityAbort'?new Promise(()=>{}):Promise.resolve({supported:outcome!=='unsupported'})}
    constructor(private init:any){}configure(){if(outcome==='configureThrows')throw Error('configure')}
    encode(frame:Frame){if(outcome==='encodeThrows')throw Error('encode');if(outcome==='error'){this.init.error(Error('codec'));return}if(outcome==='missing'&&frame.timestamp===40000)return;this.init.output({timestamp:frame.timestamp,type:frame.timestamp?'delta':'key',byteLength:outcome==='oversize'?32*1024**2:3,copyTo:(dest:Uint8Array)=>dest.set([1,2,3])})}
    flush(){if(outcome==='flushAbort'){controller.abort();return new Promise<void>(()=>{})}return Promise.resolve()}
    close(){this.state='closed';close()}
  }
  const canvas={width:0,height:0,getContext:()=>outcome==='noContext'?null:{measureText:(text:string)=>({width:text.length*10}),fillRect:()=>{if(outcome==='drawThrows')throw Error('draw')},fillText:()=>{}},toDataURL:()=>outcome==='badPreview'?'data:,':'data:image/png;base64,cHJvdG9jb2w='}
  vi.stubGlobal('VideoEncoder',Encoder);vi.stubGlobal('VideoFrame',Frame);vi.stubGlobal('document',{createElement:()=>canvas})
  try{
    const value=outcome==='maximum'?{...reveal(),stepMs:3000,card:{...reveal().card,points:['A','B','C','D']}}:reveal(),count=explainerRevealDuration(value)/40
    const promise=encodeExplainerReveal(value,controller.signal,done=>{if(outcome==='abort'&&done===3)controller.abort()})
    if(outcome==='capabilityAbort')controller.abort()
    if(outcome==='success'||outcome==='maximum'){const result=await promise;expect(result.file.type).toBe('video/x-ivf');expect(result.frames.map(f=>f.frame)).toEqual([0,Math.floor(count/2),count-1]);expect(frameClose).toHaveBeenCalledTimes(count)}else await expect(promise).rejects.toThrow()
    expect(close).toHaveBeenCalledTimes(['unsupported','noContext','capabilityAbort'].includes(outcome)?0:1);expect(fetch).not.toHaveBeenCalled()
  }finally{vi.unstubAllGlobals();fetch.mockRestore()}
})
it('bounds unresolved codec support and provides honest static fallback when no codec exists',async()=>{
  vi.useFakeTimers();vi.stubGlobal('VideoFrame',class{});vi.stubGlobal('VideoEncoder',class{static isConfigSupported(){return new Promise(()=>{})}})
  try{const p=encodeExplainerReveal(reveal(),new AbortController().signal,()=>{}),reject=expect(p).rejects.toThrow(/timed out/);await vi.advanceTimersByTimeAsync(15000);await reject;vi.stubGlobal('VideoEncoder',undefined);await expect(encodeExplainerReveal(reveal(),new AbortController().signal,()=>{})).rejects.toThrow(/static/)}finally{vi.useRealTimers();vi.unstubAllGlobals()}
})
it('save-only retry retains exact reveal lineage with one upload/probe/snapshot and full duration placement',async()=>{
  let p=createProject('Reveal'),fail=true,snapshots=0;const value=reveal(),events:AssetImportFeedback[]=[],file=new File(['codec protocol fixture'],'reveal.ivf',{type:'video/x-ivf'})
  const client={importAsset:vi.fn(async()=>({managedPath:'KINAOU/Assets/id_reveal.ivf',name:file.name,sizeBytes:file.size})),probe:vi.fn(async()=>({path:'KINAOU/Assets/id_reveal.ivf',sizeBytes:file.size,width:1920,height:1080,videoCodec:'vp8',durationMs:3000,fps:25}))}
  const session=new AssetImportSession(p,'scope',file,'video',{client,assetMetadata:{sourceKind:'authored-explainer-reveal-v1',reveal:value},environment:()=>({project:p,connection:'scope'}),snapshot:()=>{snapshots++},persist:next=>{if(fail)throw Error('save');p=next},publish:e=>events.push(e)})
  await session.run();expect(events.at(-1)?.phase).toBe('saveFailed');fail=false;await session.run();await session.run()
  expect(client.importAsset).toHaveBeenCalledTimes(1);expect(client.probe).toHaveBeenCalledTimes(1);expect(snapshots).toBe(1)
  const next=placeExplainerReveal(p,p.assets[0].id,'Reveal');expect(next.tracks[0].clips[0]).toMatchObject({durationMs:3000,assetId:p.assets[0].id});expect(p.tracks).toEqual([]);expect(next.assets).toEqual(p.assets)
  expect(()=>placeExplainerReveal({...p,assets:[{...p.assets[0],offline:true}]},p.assets[0].id,'Reveal')).toThrow()
})
it('three image tools use wrapping directional navigation plus Home/End',()=>{
  expect(nextImageView('model','ArrowLeft')).toBe('reveal');expect(nextImageView('reveal','ArrowRight')).toBe('model');expect(nextImageView('cards','ArrowRight')).toBe('reveal');expect(nextImageView('cards','ArrowLeft')).toBe('model');expect(nextImageView('cards','Home')).toBe('model');expect(nextImageView('model','End')).toBe('reveal');expect(nextImageView('cards','Tab')).toBeNull()
})
