import { expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createProject, parseProject } from '../src/core/project'
import { MediaExcerptPlacement, parseExcerptSeconds } from '../src/core/mediaExcerpt'
import { MediaExcerptPlacementControl } from '../src/components/MediaExcerptPlacementControl'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import { PersistentVersionHistory } from '../src/core/versioning'
import { translateUi } from '../src/core/uiMessages'
import { applyTimelineOperation } from '../src/core/timeline'
import { createRenderPlan, projectFormatPreset } from '../src/core/render'
import { WorkerClient } from '../src/core/workerClient'
function fixture(){const project=parseProject({...createProject('Excerpt fixture'),assets:[{id:'a',kind:'video',managed:true,uri:'KINAOU/Assets/source.mp4',metadata:{durationMs:10000,name:'Original video',keep:'original'}}],tracks:[{id:'v',type:'video',name:'Video',clips:[{id:'old',assetId:'a',startMs:0,durationMs:1000}]},{id:'other',type:'voice',name:'Other audio',clips:[]}]});return{project,request:{assetId:'a',trackId:'v',sourceInMs:2000,sourceOutMs:4000,timelineInMs:2000,speed:2,includeAudio:false}}}
it('prepares a non-destructive retimed clip and keeps one snapshot/stable bytes across mutating save retries',()=>{
 const{project,request}=fixture(),before=JSON.stringify(project),placement=new MediaExcerptPlacement(project,request,'de'),snapshot=vi.fn(),attempts:string[]=[]
 expect(placement.review).toMatchObject({durationMs:1000,endMs:3000,gain:1,includeAudio:false});expect(JSON.stringify(project)).toBe(before)
 const save=vi.fn((next:typeof project)=>{attempts.push(JSON.stringify(next));next.tracks=[];throw Error('synthetic failed save')})
 expect(()=>placement.commit(project,'de',true,snapshot,save)).toThrow();expect(()=>placement.commit(project,'de',true,snapshot,save)).toThrow()
 const next=placement.commit(project,'de',true,snapshot,p=>{attempts.push(JSON.stringify(p))});expect(new Set(attempts).size).toBe(1);expect(snapshot).toHaveBeenCalledOnce();expect(next.tracks[0].clips).toHaveLength(2);expect(next.tracks[0].clips[1]).toMatchObject({id:placement.clipId,sourceOffsetMs:2000,durationMs:1000,startMs:2000,speed:2,gain:1,embeddedAudio:false});expect(next.assets).toEqual(project.assets);expect(next.tracks[0].clips[0]).toEqual(project.tracks[0].clips[0]);expect(next.tracks[1]).toEqual(project.tracks[1]);expect(JSON.stringify(project)).toBe(before);expect(()=>placement.commit(project,'de',true,snapshot,vi.fn())).toThrow()
})
it('requires approval, stops on false snapshot/save, and rejects reentrant commits',()=>{
 const{project,request}=fixture(),placement=new MediaExcerptPlacement(project,request),persist=vi.fn()
 expect(()=>placement.commit(project,'',false,vi.fn(),persist)).toThrow();expect(()=>placement.commit(project,'',true,()=>false,persist)).toThrow();expect(persist).not.toHaveBeenCalled()
 const snap=vi.fn(()=>{expect(()=>placement.commit(project,'',true,vi.fn(),persist)).toThrow()});expect(()=>placement.commit(project,'',true,snap,()=>false)).toThrow();placement.commit(project,'',true,()=>{throw Error('must not repeat')},persist);expect(snap).toHaveBeenCalledOnce()
})
it.each(['project','scope'] as const)('permanently rejects observed %s A/B/A',kind=>{const{project,request}=fixture(),p=new MediaExcerptPlacement(project,request,'A');p.observe(kind==='project'?{...project,title:'B'}:project,kind==='scope'?'B':'A');p.observe(project,'A');expect(p.current).toBe(false);expect(()=>p.commit(project,'A',true,vi.fn(),vi.fn())).toThrow()})
it.each(['negative','reverse','overrun','fraction','speed','precision','timeline','overlap','offline','unmanaged','duration','locked','muted','wrong-track','duplicate','path','provenance'])('refuses %s without mutation',kind=>{
 const{project,request}=fixture();if(kind==='negative')request.sourceInMs=-1;if(kind==='reverse')request.sourceOutMs=1000;if(kind==='overrun')request.sourceOutMs=10001;if(kind==='fraction')request.sourceInMs=0.5;if(kind==='speed')request.speed=5;if(kind==='precision'){request.sourceOutMs=4001;request.speed=2}if(kind==='timeline')request.timelineInMs=86400000;if(kind==='overlap')request.timelineInMs=999;if(kind==='offline')project.assets[0].offline=true;if(kind==='unmanaged')project.assets[0].managed=false;if(kind==='duration')project.assets[0].metadata.durationMs='10000';if(kind==='locked')project.tracks[0].locked=true;if(kind==='muted')project.tracks[0].muted=true;if(kind==='wrong-track')request.trackId='other';if(kind==='duplicate')project.assets.push(structuredClone(project.assets[0]));if(kind==='path')project.assets[0].uri='KINAOU/Assets/../outside.mp4';if(kind==='provenance')project.assets[0].metadata.sourceImport={schemaVersion:9}
 const before=JSON.stringify(project);expect(()=>new MediaExcerptPlacement(project,request)).toThrow();expect(JSON.stringify(project)).toBe(before)
})
it('allows touching boundaries and warns rather than mutating other occupied tracks',()=>{const{project,request}=fixture();request.timelineInMs=1000;request.sourceInMs=8000;request.sourceOutMs=10000;request.speed=1;project.tracks[1].clips=[{...project.tracks[0].clips[0],startMs:1000}];const p=new MediaExcerptPlacement(project,request);expect(p.review.layered).toBe(true);expect(p.review.endMs).toBe(3000)})
it('supports measured audio on compatible audio tracks with explicit original audio',()=>{const{project,request}=fixture();project.assets[0].kind='audio';request.trackId='other';request.includeAudio=true;const p=new MediaExcerptPlacement(project,request),next=p.commit(project,'',true,()=>{},()=>{});expect(next.tracks[1].clips[0].gain).toBe(1)})
it('keeps original audio attached through split/trim/speed and clears it when replacing its source',()=>{
 const{project,request}=fixture();request.includeAudio=true;request.speed=1;const p=new MediaExcerptPlacement(project,request),next=p.commit(project,'',true,()=>{},()=>{})
 const split=applyTimelineOperation(next,{type:'split-clip',trackId:'v',clipId:p.clipId,splitMs:3000,rightClipId:'right'});expect(split.tracks[0].clips.filter(c=>c.id!== 'old').every(c=>c.embeddedAudio)).toBe(true)
 const sped=applyTimelineOperation(split,{type:'set-clip-speed',trackId:'v',clipId:'right',speed:2});expect(sped.tracks[0].clips.find(c=>c.id==='right')!.embeddedAudio).toBe(true)
 const replacement=applyTimelineOperation(sped,{type:'set-clip-asset',trackId:'v',clipId:'right',assetId:'a'});expect(replacement.tracks[0].clips.find(c=>c.id==='right')!.embeddedAudio).toBeUndefined()
 const off=applyTimelineOperation(next,{type:'set-clip-embedded-audio',trackId:'v',clipId:p.clipId,enabled:false});expect(off.tracks[0].clips[1].embeddedAudio).toBe(false)
 const plan=createRenderPlan(next,projectFormatPreset(next,'landscape','preview'),'KINAOU/Renders/test.mp4');expect(plan.requiredCapabilities).toContain('embedded-video-audio');expect(plan.clips.find(c=>c.clipId===p.clipId)!.embeddedAudio).toBe(true)
})
it('rejects embedded audio on non-video/non-visual sources and locked tracks',()=>{const{project}=fixture();project.assets[0].kind='image';expect(()=>applyTimelineOperation(project,{type:'set-clip-embedded-audio',trackId:'v',clipId:'old',enabled:true})).toThrow();project.tracks[0].clips[0].embeddedAudio=true;expect(()=>createRenderPlan(project,projectFormatPreset(project,'landscape','preview'),'KINAOU/Renders/test.mp4')).toThrow(/Embedded/);project.assets[0].kind='video';project.tracks[0].locked=true;expect(()=>applyTimelineOperation(project,{type:'set-clip-embedded-audio',trackId:'v',clipId:'old',enabled:true})).toThrow(/locked/)})
it('old workers cannot silently render a clip without its explicitly requested original audio',async()=>{
 const{project,request}=fixture();request.includeAudio=true;const p=new MediaExcerptPlacement(project,request),next=p.commit(project,'',true,()=>{},()=>{}),plan=createRenderPlan(next,projectFormatPreset(next,'landscape','preview'),'KINAOU/Renders/test.mp4'),calls:string[]=[]
 const client=new WorkerClient({baseUrl:'http://127.0.0.1:43117',token:'test',fetchImpl:async url=>{calls.push(String(url));return Response.json({ok:true,type:'health',handshake:{workerId:'old',name:'Old worker',platform:'fixture',version:'0',capabilities:['filesystem','ffmpeg'],managedRoots:['KINAOU']}})}})
 await expect(client.startRender(plan)).rejects.toThrow(/embedded-video-audio/);expect(calls).toEqual(['http://127.0.0.1:43117/health'])
})
it.each(['','-1','Infinity','1e3','1.0001','1,2,3','86400.001'])('rejects invalid seconds %s',value=>expect(()=>parseExcerptSeconds(value)).toThrow())
it('parses millisecond precision with dot/comma without silently accepting empty values',()=>{expect(parseExcerptSeconds(' 1,001 ')).toBe(1001);expect(parseExcerptSeconds('0.250')).toBe(250);expect(parseExcerptSeconds('86400')).toBe(86400000)})
it.each(['de','en','fr'] as const)('renders explicit-only %s controls with video audio off and untouched authored data',language=>{
 const{project}=fixture(),fetch=vi.spyOn(globalThis,'fetch'),save=vi.fn(),before=JSON.stringify(project),history=new PersistentVersionHistory({getItem:()=>null,setItem:()=>{},removeItem:()=>{}})
 try{const html=renderToStaticMarkup(createElement(UiLanguageProvider,{initialLanguage:language,children:createElement(MediaExcerptPlacementControl,{project,asset:project.assets[0],history,onProjectChange:save})}));expect(html).toContain(translateUi(language,'mediaExcerpt.heading'));expect(html).toContain(translateUi(language,'mediaExcerpt.review'));expect(html).not.toContain('checked=""');expect(html).not.toContain(translateUi(language,'mediaExcerpt.place'));expect(fetch).not.toHaveBeenCalled();expect(save).not.toHaveBeenCalled();expect(JSON.stringify(project)).toBe(before)}finally{fetch.mockRestore()}
})
