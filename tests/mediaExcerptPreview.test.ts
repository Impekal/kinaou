import { expect, it, vi } from 'vitest'
import { createProject, parseProject } from '../src/core/project'
import { MediaExcerptPlacement } from '../src/core/mediaExcerpt'
import { formatProfiles, setProjectTargetFormat, setProjectFormatReframing } from '../src/core/render'
import { freshPreviewPlan } from '../src/core/previewSession'
import { ShortPreviewSession } from '../src/core/shortPreviewSession'
import { translateUi } from '../src/core/uiMessages'

function fixture() {
 const project=parseProject({...createProject('Isolated source preview'), assets:[{id:'source',kind:'video',managed:true,uri:'KINAOU/Assets/source.mp4',metadata:{durationMs:180000,name:'Original'}},{id:'unrelated',kind:'video',managed:true,offline:true,uri:'KINAOU/Assets/unrelated.mp4',metadata:{}}],tracks:[{id:'v',type:'video',name:'Video',clips:[{id:'existing',assetId:'unrelated',startMs:0,durationMs:1000}]},{id:'other',type:'video',name:'Other',clips:[{id:'unrelated-clip',assetId:'unrelated',startMs:1000,durationMs:1000}]}]})
 return {project,request:{assetId:'source',trackId:'v',sourceInMs:500,sourceOutMs:1500,timelineInMs:5000,speed:2,includeAudio:true}}
}
it.each(['landscape','vertical','square'] as const)('previews only the prepared source in %s, without timeline delay, unrelated offline assets, crop or project mutation',format=>{
 const f=fixture(),project=setProjectFormatReframing(setProjectTargetFormat(f.project,format),format,{fit:'cover',focusX:0.2,focusY:0.8}),before=JSON.stringify(project),placement=new MediaExcerptPlacement(project,f.request,'scope'),plan=placement.preview(project,'scope')
 expect(plan.purpose).toBe('preview');expect(plan.durationMs).toBe(500);expect(plan.clips).toHaveLength(1)
 expect(plan.clips[0]).toMatchObject({clipId:placement.clipId,startMs:0,durationMs:500,sourceOffsetMs:500,speed:2,gain:1,embeddedAudio:true,asset:{id:'source'}})
 expect(plan.preset).toMatchObject({width:formatProfiles[format].preview.width,height:formatProfiles[format].preview.height,fit:'contain'});expect(plan.preset.focusX).toBeUndefined()
 expect(plan.loudnessNormalization?.enabled).toBe(false);expect(plan.audioDucking?.enabled).toBe(false);expect(JSON.stringify(project)).toBe(before)
 const next=placement.commit(project,'scope',true,vi.fn(),vi.fn());expect(next.tracks[0].clips[1].startMs).toBe(5000)
})
it('preview mutation never changes another preview or the actual prepared insertion',()=>{
 const{project,request}=fixture(),placement=new MediaExcerptPlacement(project,request),first=placement.preview(project)
 first.clips[0].asset.uri='KINAOU/Assets/replaced.mp4';first.clips[0].durationMs=10;first.preset.width=10
 const second=placement.preview(project);expect(second.clips[0].asset.uri).toBe('KINAOU/Assets/source.mp4');expect(second.durationMs).toBe(500);expect(second.preset.width).toBe(960)
 expect(freshPreviewPlan(second).outputRelativePath).not.toBe(freshPreviewPlan(second).outputRelativePath)
 const next=placement.commit(project,'',true,vi.fn(),vi.fn());expect(next.tracks[0].clips[1]).toMatchObject({durationMs:500,startMs:5000});expect(next.assets[0].uri).toBe('KINAOU/Assets/source.mp4')
})
it.each(['project','scope','committed'] as const)('refuses %s-retired previews, including A/B/A',kind=>{
 const{project,request}=fixture(),placement=new MediaExcerptPlacement(project,request,'A')
 if(kind==='project'){expect(()=>placement.preview({...project,title:'B'},'A')).toThrow();placement.observe(project,'A')}
 if(kind==='scope'){expect(()=>placement.preview(project,'B')).toThrow();placement.observe(project,'A')}
 if(kind==='committed')placement.commit(project,'A',true,vi.fn(),vi.fn())
 expect(()=>placement.preview(project,'A')).toThrow(/stale/)
})
it('bounds audition length without truncating or blocking a longer valid insertion',()=>{
 const{project,request}=fixture();request.sourceInMs=0;request.sourceOutMs=120000
 const exact=new MediaExcerptPlacement(project,request);expect(exact.preview(project).durationMs).toBe(60000)
 request.sourceOutMs=120002;const longer=new MediaExcerptPlacement(project,request);expect(()=>longer.preview(project)).toThrow(/previewLength/)
 expect(longer.commit(project,'',true,vi.fn(),vi.fn()).tracks[0].clips[1].durationMs).toBe(60001)
})
it.each([true,false])('audio-only source produces a black visual canvas with explicit audible=%s, no embedded-video flag',includeAudio=>{
 const{project,request}=fixture();project.assets[0].kind='audio';project.tracks[0].type='voice';request.includeAudio=includeAudio
 const plan=new MediaExcerptPlacement(project,request).preview(project);expect(plan.clips[0].trackType).toBe('voice');expect(plan.clips[0].gain).toBe(includeAudio?1:0);expect(plan.clips[0].embeddedAudio).toBeUndefined()
})
it('uses existing same-job load retry, no duplicate submission, and detaches late accepted media',async()=>{
 const{project,request}=fixture(),plan=freshPreviewPlan(new MediaExcerptPlacement(project,request).preview(project)),job={id:'one',state:'succeeded',progress:1,outputPath:plan.outputRelativePath} as const
 const accept=vi.fn(),load=vi.fn().mockRejectedValueOnce(Error('synthetic lost read')).mockResolvedValue(new Blob(['synthetic protocol bytes'])),client={startRender:vi.fn().mockResolvedValue(job),renderStatus:vi.fn(),cancelRender:vi.fn(),loadTimelinePreview:load},publish=vi.fn()
 const session=new ShortPreviewSession(plan,{client,accept,publish});await session.run();expect(publish.mock.lastCall![0].phase).toBe('loadFailed');await session.run();expect(client.startRender).toHaveBeenCalledOnce();expect(load).toHaveBeenCalledTimes(2);expect(accept).toHaveBeenCalledOnce()
 let release!:(b:Blob)=>void;client.loadTimelinePreview=vi.fn(()=>new Promise(resolve=>{release=resolve}));const late=new ShortPreviewSession(plan,{client,accept,publish}),pending=late.run();await Promise.resolve();late.detach();release(new Blob());await pending;expect(accept).toHaveBeenCalledOnce()
})
it.each(['de','en','fr'] as const)('has explicit %s preview scope and length copy',language=>{for(const key of ['mediaExcerpt.preview','mediaExcerpt.previewHelp','mediaExcerpt.previewLength'] as const){expect(translateUi(language,key)).not.toBe(key);expect(translateUi(language,key).length).toBeGreaterThan(12)}})
