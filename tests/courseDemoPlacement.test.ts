import {it,expect,vi} from 'vitest'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {createProject,parseProject} from '../src/core/project'
import {newCourseOutline,saveCourseOutline,projectCourse} from '../src/core/course'
import {parseDemoSeconds,courseDemoPlacementChoices,reviewCourseDemoPlacement,courseDemoPlacementIsCurrent,commitCourseDemoPlacement} from '../src/core/courseDemoPlacement'
import {CourseDemoPlacementPanel} from '../src/components/CourseDemoPlacementPanel'
import {UiLanguageProvider} from '../src/components/UiLanguageProvider'
import {PersistentVersionHistory} from '../src/core/versioning'
import {translateUi} from '../src/core/uiMessages'
import {displaySystemHistoryLabel} from '../src/core/uiSystemLabels'
function fixture(kind:'image'|'video'='video'){
  const p=parseProject({...createProject('Original course'),assets:[{id:'demo-media',kind,uri:'KINAOU/Assets/demo.'+(kind==='video'?'mp4':'png'),managed:true,metadata:{durationMs:4000,sourceKind:'explicit-fixture'}},{id:'voice-media',kind:'audio',uri:'KINAOU/Assets/voice.wav',managed:true,metadata:{durationMs:7000}}],tracks:[{id:'voice',type:'voice',name:'Narration',clips:[{id:'voice-clip',assetId:'voice-media',startMs:3000,durationMs:7000,sourceOffsetMs:0,gain:.8,speed:1}]}]})
  return saveCourseOutline(p,{...newCourseOutline(p),id:'course',language:'fr',modules:[{id:'module',title:'Original module',lessons:[{id:'lesson',title:'Original lesson',objective:'Learn',script:'Original words',range:{inMs:3000,outMs:10000},demonstrations:[{id:'demo',title:'Original demonstration',steps:'Try',expected:'Expected',observed:'Self-reported only',evidence:{assetId:p.assets[0].id,uri:p.assets[0].uri,kind}}]}]}]})
}
const request={lessonId:'lesson',demoId:'demo',lessonOffsetMs:1000,sourceOffsetMs:1000,durationMs:2000}
it.each(['image','video'] as const)('places a reviewed %s excerpt without changing source/course/narration and retries one prepared clip/snapshot',kind=>{
  const p=fixture(kind),before=JSON.stringify(p),review=reviewCourseDemoPlacement(p,{...request,sourceOffsetMs:kind==='image'?0:1000}),snapshot=vi.fn(),persist=vi.fn().mockImplementationOnce(()=>{throw Error('save failure')})
  expect(Object.isFrozen(review)).toBe(true);expect(review).toMatchObject({startMs:4000,endMs:6000,kind,revision:1});expect(courseDemoPlacementChoices(p)[0].label).toBe('1.1 · Original module / Original lesson')
  expect(()=>commitCourseDemoPlacement(p,review,false,{snapshot,persist})).toThrow('ack');expect(snapshot).not.toHaveBeenCalled()
  expect(()=>commitCourseDemoPlacement(p,review,true,{snapshot,persist})).toThrow('save failure')
  const next=commitCourseDemoPlacement(p,review,true,{snapshot,persist});expect(persist.mock.calls[0][0]).toBe(persist.mock.calls[1][0]);expect(snapshot).toHaveBeenCalledTimes(1)
  expect(next.tracks.at(-1)?.clips[0]).toMatchObject({assetId:'demo-media',startMs:4000,durationMs:2000,sourceOffsetMs:kind==='image'?0:1000,gain:0,speed:1});expect(next.tracks[0]).toEqual(p.tracks[0]);expect(next.assets).toEqual(p.assets);expect(next.metadata).toEqual(p.metadata);expect(JSON.stringify(p)).toBe(before)
  expect(()=>commitCourseDemoPlacement(p,review,true,{snapshot,persist})).toThrow('stale');expect(()=>reviewCourseDemoPlacement(next,{...request,sourceOffsetMs:0})).toThrow('overlap')
})
it.each(['missing','changed-uri','changed-kind','duplicate-asset','offline','unmanaged','traversal','missing-demo','corrupt-course','unsupported-kind','non-assets','duration'])('rejects %s evidence without changing the project',issue=>{
  const p=fixture(),course=projectCourse(p)!,demo=course.modules[0].lessons[0].demonstrations![0]
  if(issue==='missing')p.assets=[];if(issue==='changed-uri')p.assets[0].uri='KINAOU/Assets/other.mp4';if(issue==='changed-kind')p.assets[0].kind='image';if(issue==='duplicate-asset')p.assets.push(structuredClone(p.assets[0]));if(issue==='offline')p.assets[0].offline=true;if(issue==='unmanaged')p.assets[0].managed=false
  if(issue==='traversal'){p.assets[0].uri='KINAOU/Assets/../private.mp4';demo.evidence!.uri=p.assets[0].uri}
  if(issue==='missing-demo')course.modules[0].lessons[0].demonstrations=[]
  if(issue==='unsupported-kind'){p.assets[0].kind='audio';demo.evidence!.kind='audio'}
  if(issue==='non-assets'){p.assets[0].uri='KINAOU/Models/private.mp4';demo.evidence!.uri=p.assets[0].uri}
  if(issue==='duration')delete p.assets[0].metadata.durationMs
  p.metadata.courseOutline=issue==='corrupt-course'?{}:course;const before=JSON.stringify(p)
  expect(()=>reviewCourseDemoPlacement(p,request)).toThrow();expect(JSON.stringify(p)).toBe(before)
})
it.each([{lessonOffsetMs:-1},{lessonOffsetMs:NaN},{durationMs:249},{durationMs:Infinity},{durationMs:2000.1},{sourceOffsetMs:-1},{sourceOffsetMs:3500},{lessonOffsetMs:6000},{extra:true}])('rejects invalid or overflowing times %j',patch=>expect(()=>reviewCourseDemoPlacement(fixture(),{...request,...patch})).toThrow())
it('accepts exact end boundaries, rejects nonzero image source offsets and never silently trims',()=>{
  const p=fixture();expect(reviewCourseDemoPlacement(p,{...request,lessonOffsetMs:4000,sourceOffsetMs:1000,durationMs:3000})).toMatchObject({endMs:10000})
  expect(()=>reviewCourseDemoPlacement(fixture('image'),request)).toThrow('time')
  expect(reviewCourseDemoPlacement(fixture('image'),{...request,sourceOffsetMs:0,durationMs:6000})).toMatchObject({endMs:10000})
})
it.each(['video','broll','image','avatar','overlay'] as const)('refuses active %s overlap on any track, but permits adjacent clips or muted visuals',type=>{
  const p=fixture(),clip={id:'other',assetId:'demo-media',startMs:5000,durationMs:1000,sourceOffsetMs:0,gain:0,speed:1};p.tracks.push({id:'other',type,name:'Other',muted:false,locked:true,clips:[clip]})
  expect(()=>reviewCourseDemoPlacement(p,request)).toThrow('overlap');p.tracks[1].muted=true;expect(reviewCourseDemoPlacement(p,request).startMs).toBe(4000)
  p.tracks[1].muted=false;clip.startMs=6000;expect(reviewCourseDemoPlacement(p,request).endMs).toBe(6000)
})
it('permanently invalidates observed project A–B–A and refuses forged reviews',()=>{
  const p=fixture(),review=reviewCourseDemoPlacement(p,request),deps={snapshot:vi.fn(),persist:vi.fn()}
  expect(()=>commitCourseDemoPlacement(p,{...review},true,deps)).toThrow('stale')
  expect(courseDemoPlacementIsCurrent({...p,title:'Changed'},review)).toBe(false);expect(courseDemoPlacementIsCurrent(p,review)).toBe(false);expect(()=>commitCourseDemoPlacement(p,review,true,deps)).toThrow('stale');expect(deps.snapshot).not.toHaveBeenCalled()
})
it('retries failed history before persistence and keeps saved course references exact',()=>{
  const p=fixture(),r=reviewCourseDemoPlacement(p,request),snapshot=vi.fn().mockImplementationOnce(()=>{throw Error('history')}),persist=vi.fn()
  expect(()=>commitCourseDemoPlacement(p,r,true,{snapshot,persist})).toThrow('history');expect(persist).not.toHaveBeenCalled();commitCourseDemoPlacement(p,r,true,{snapshot,persist});expect(snapshot).toHaveBeenCalledTimes(2);expect(persist).toHaveBeenCalledTimes(1)
})
it.each(['',' ','-1','1e2','1.0001','1,2.3','Infinity','86400.001','a'])('refuses ambiguous seconds %j',value=>expect(()=>parseDemoSeconds(value)).toThrow('time'))
it.each([['0',0],['1,25',1250],['1.001',1001],[' 2.5 ',2500],['86400',86400000]] as const)('parses explicit time %s exactly', (text,ms)=>expect(parseDemoSeconds(text)).toBe(ms))
it.each(['de','en','fr'] as const)('renders %s placement without automatic writes or worker requests, and blocks dirty drafts',language=>{
  const persist=vi.fn(),fetch=vi.spyOn(globalThis,'fetch'),history=new PersistentVersionHistory({getItem:()=>null,setItem:persist,removeItem:persist})
  try{const html=renderToStaticMarkup(createElement(UiLanguageProvider,{initialLanguage:language,children:createElement(CourseDemoPlacementPanel,{project:fixture(),dirty:true,history,onProjectChange:persist})}));expect(html).toContain(translateUi(language,'course.demoPlace.heading'));expect(html).toContain(translateUi(language,'course.demoPlace.boundary'));expect(html).toContain('Original lesson');expect(html).toContain('disabled=""');expect(html).not.toContain('source-media-secret');expect(persist).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled()}finally{fetch.mockRestore()}
})
it.each(['de','en','fr'] as const)('localizes new %s system history labels without rewriting authored labels',language=>{
  for(const [label,key] of [['Before placing lesson demonstration','course.demoPlace.history'],['Before saving explainer reveal','reveal.history']] as const){
    const t=(key:Parameters<typeof translateUi>[1])=>translateUi(language,key)
    expect(displaySystemHistoryLabel({label,source:'system'},t)).toBe(translateUi(language,key));expect(displaySystemHistoryLabel({label,source:'user'},t)).toBe(label)
  }
})
