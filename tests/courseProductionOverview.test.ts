import {it,expect,vi} from 'vitest'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {createProject,parseProject,type KinaouProject,type TimelineClip} from '../src/core/project'
import {newCourseOutline,saveCourseOutline,projectCourse,courseLessonChoices} from '../src/core/course'
import {recordSuccessfulExport} from '../src/core/exportHistory'
import {courseIntervalCoverage,courseProductionOverview,filterCourseOverview} from '../src/core/courseProductionOverview'
import {CourseProductionOverviewPanel} from '../src/components/CourseProductionOverviewPanel'
import {UiLanguageProvider} from '../src/components/UiLanguageProvider'
import {translateUi} from '../src/core/uiMessages'
const clip=(id:string,assetId:string,startMs:number,durationMs:number):TimelineClip=>({id,assetId,startMs,durationMs,sourceOffsetMs:0,gain:1,speed:1})
function fixture(count=1):KinaouProject{
 const p=parseProject({...createProject('Coverage'),assets:[{id:'image',kind:'image',managed:true,uri:'KINAOU/Assets/card.png',metadata:{}},{id:'video',kind:'video',managed:true,uri:'KINAOU/Assets/clip.mp4',metadata:{durationMs:20000}},{id:'voice',kind:'audio',managed:true,uri:'KINAOU/Assets/voice.wav',metadata:{durationMs:20000}},{id:'caption',kind:'caption',managed:true,uri:'kinaou://caption/caption',metadata:{text:'PRIVATE_CAPTION'}}],tracks:[{id:'v1',type:'image',name:'Cards',clips:[clip('i1','image',500,2500),clip('i2','image',2500,1000)]},{id:'v2',type:'video',name:'Video',clips:[clip('v1','video',4000,1500)]},{id:'a1',type:'voice',name:'Voice',clips:[clip('a1','voice',1000,1000),clip('a2','voice',2500,2500)]},{id:'c',type:'caption',name:'Captions',clips:[clip('c','caption',500,2000)]}]})
 return saveCourseOutline(p,{...newCourseOutline(p),id:'course',modules:[{id:'module',title:'Module',lessons:Array.from({length:count},(_,i)=>({id:'lesson-'+i,title:'Lesson '+i,objective:'PRIVATE_OBJECTIVE',script:i%2?'':'PRIVATE_SCRIPT',range:{inMs:1000+i*5000,outMs:5000+i*5000},demonstrations:[{id:'demo',title:'Demo',steps:'PRIVATE_STEPS',expected:'PRIVATE_EXPECTED',observed:'PRIVATE_OBSERVED',evidence:{assetId:'image',kind:'image',uri:'KINAOU/Assets/card.png'}}],exercises:[{id:'exercise',title:'Exercise',prompt:'PRIVATE_PROMPT',hint:'PRIVATE_HINT',solution:'PRIVATE_ANSWER',criteria:'PRIVATE_CRITERIA'}],materials:[{id:'material',title:'Material',audience:'instructor',body:'PRIVATE_MATERIAL'}]}))}]})
}
it('unions overlapping/adjacent intervals, clips to the lesson, exposes exact relative gaps and leaves input unchanged',()=>{
 const spans=[{startMs:0,endMs:1500},{startMs:1400,endMs:2000},{startMs:2000,endMs:2500},{startMs:3500,endMs:6000},{startMs:8000,endMs:9000}],before=structuredClone(spans)
 expect(courseIntervalCoverage({inMs:1000,outMs:5000},spans)).toEqual({durationMs:4000,coveredMs:3000,intervals:[{startMs:0,endMs:1500},{startMs:2500,endMs:4000}],gaps:[{startMs:1500,endMs:2500}]});expect(spans).toEqual(before)
 expect(courseIntervalCoverage({inMs:1000,outMs:5000},[]).gaps).toEqual([{startMs:0,endMs:4000}])
})
it('coverage/gap sums partition the lesson under deterministic interval permutations and duplication',()=>{
 for(let seed=0;seed<80;seed++){const spans=Array.from({length:15},(_,i)=>{const startMs=(seed*97+i*231)%9000;return {startMs,endMs:startMs+1+(seed*31+i*67)%1800}}),value=courseIntervalCoverage({inMs:1000,outMs:8000},spans)
  expect(value.coveredMs+value.gaps.reduce((sum,s)=>sum+s.endMs-s.startMs,0)).toBe(7000);expect(courseIntervalCoverage({inMs:1000,outMs:8000},[...spans,...spans].reverse())).toEqual(value)
  for(const span of [...value.intervals,...value.gaps]){expect(span.startMs).toBeGreaterThanOrEqual(0);expect(span.endMs).toBeLessThanOrEqual(7000);expect(span.endMs).toBeGreaterThan(span.startMs)}
 }
})
it.each([{startMs:-1,endMs:2},{startMs:3,endMs:3},{startMs:1.5,endMs:5},{startMs:0,endMs:Infinity}])('rejects malformed intervals %j',span=>expect(()=>courseIntervalCoverage({inMs:0,outMs:10},[span])).toThrow())
it('reports exact independent metadata counts and occupied spans without leaking private content',()=>{
 const p=fixture(),before=JSON.stringify(p),row=courseProductionOverview(p)[0]
 expect(row).toMatchObject({scriptPresent:true,visuals:{coveredMs:3500,gaps:[{startMs:2500,endMs:3000}]},voice:{coveredMs:3500,gaps:[{startMs:1000,endMs:1500}]},captionClips:1,excludedClips:0,demonstrations:1,linkedDemonstrations:1,exercises:1,completeExercises:1,materials:1,exports:0,matchingOutlineExports:0})
 expect(JSON.stringify(row)).not.toContain('PRIVATE_');expect(JSON.stringify(row)).not.toContain('KINAOU/');expect(JSON.stringify(p)).toBe(before)
})
it.each(['offline','missing','duplicate','unmanaged','path','kind','duration','overrun','image-speed'] as const)('excludes unsupported %s media instead of certifying coverage',issue=>{
 const p=fixture();if(issue==='offline')p.assets[0].offline=true;if(issue==='missing')p.assets=p.assets.filter(a=>a.id!=='image');if(issue==='duplicate')p.assets.push(structuredClone(p.assets[0]));if(issue==='unmanaged')p.assets[0].managed=false;if(issue==='path')p.assets[0].uri='KINAOU/Assets/../private.png';if(issue==='kind')p.assets[0].kind='document';if(issue==='duration')delete p.assets[1].metadata.durationMs;if(issue==='overrun')p.assets[1].metadata.durationMs=100;if(issue==='image-speed')p.tracks[0].clips[0].speed=2
 const row=courseProductionOverview(p)[0];expect(row.excludedClips).toBeGreaterThan(0);expect(row.visuals.coveredMs).toBeLessThan(3500)
})
it('ignores muted tracks, nonpositive speech gain, music and effects but retains locked tracks and zero-gain video visuals',()=>{
 const p=fixture();p.tracks[0].locked=true;p.tracks[1].clips[0].gain=0;p.tracks[2].clips.forEach(c=>{c.gain=0});p.tracks.push({id:'music',type:'music',name:'Music',muted:false,locked:false,clips:[clip('music','voice',1000,4000)]})
 let row=courseProductionOverview(p)[0];expect(row.visuals.coveredMs).toBe(3500);expect(row.voice.coveredMs).toBe(0);expect(row.excludedClips).toBe(0)
 p.tracks[0].muted=true;row=courseProductionOverview(p)[0];expect(row.visuals.coveredMs).toBe(1000)
})
it('checks retained duration against retimed source range, not output duration alone',()=>{
 const p=fixture();p.assets[1].metadata.durationMs=4000;p.tracks[1].clips[0].sourceOffsetMs=1000;p.tracks[1].clips[0].speed=2
 expect(courseProductionOverview(p)[0].excludedClips).toBe(0);p.tracks[1].clips[0].sourceOffsetMs=1002;expect(courseProductionOverview(p)[0].excludedClips).toBe(1)
})
it('counts only nonempty embedded caption clips on an active caption track',()=>{
 const p=fixture();p.assets[3].metadata.text=' ';expect(courseProductionOverview(p)[0]).toMatchObject({captionClips:0,excludedClips:1});p.assets[3].metadata.text='Text';p.assets[3].uri='https://example.org';expect(courseProductionOverview(p)[0].captionClips).toBe(0)
})
it('keeps output references historical and distinguishes matching outline from current timeline or file proof',()=>{
 let p=fixture(),context=courseLessonChoices(p,5500)[0].context
 p=recordSuccessfulExport(p,{jobId:'export',label:'Lesson',outputRelativePath:'KINAOU/Renders/lesson.mp4',format:'landscape',range:{inMs:1000,outMs:5000},sceneIds:[],courseLesson:context,durationMs:4000,completedAt:'2026-09-30T00:00:00Z'})
 expect(courseProductionOverview(p)[0]).toMatchObject({exports:1,matchingOutlineExports:1});p.tracks=[];expect(courseProductionOverview(p)[0]).toMatchObject({exports:1,matchingOutlineExports:1,visuals:{coveredMs:0}})
 const course=projectCourse(p)!;course.modules[0].lessons[0].title='Changed';p=saveCourseOutline(p,course);expect(courseProductionOverview(p)[0]).toMatchObject({exports:1,matchingOutlineExports:0})
})
it('refuses corrupt course/output ledgers and duplicate retained jobs instead of showing false empty/complete results',()=>{
 const p=fixture();p.metadata.courseOutline={};expect(()=>courseProductionOverview(p)).toThrow();const q=fixture();q.metadata.courseOutputIndex={};expect(()=>courseProductionOverview(q)).toThrow()
 const r=fixture(),receipt={schemaVersion:1,jobId:'job',label:'Lesson',outputRelativePath:'KINAOU/Renders/lesson.mp4',format:'landscape',range:{inMs:1000,outMs:5000},sceneIds:[],courseLesson:courseLessonChoices(r,5500)[0].context,durationMs:4000,completedAt:'2026-09-30T00:00:00Z'}
 r.metadata.courseOutputIndex={schemaVersion:1,projectId:r.id,receipts:[receipt,receipt]};expect(()=>courseProductionOverview(r)).toThrow(/Invalid course output index/)
})
it('supports 200 lessons in stable course order and exact filters without summing overlapping lessons',()=>{
 const p=fixture(100),course=projectCourse(p)!;course.modules.push({id:'module-2',title:'Second',lessons:course.modules[0].lessons.map((l,i)=>({...l,id:'other-'+i}))});const rows=courseProductionOverview(saveCourseOutline(p,course))
 expect(rows).toHaveLength(200);expect(rows[100].label).toContain('2.1');expect(filterCourseOverview(rows,'noScript')).toHaveLength(100);expect(filterCourseOverview(rows,'visualGaps')).toHaveLength(200);expect(filterCourseOverview(rows,'noExports')).toHaveLength(200)
 expect(courseProductionOverview(createProject('Empty'))).toEqual([])
})
it.each(['de','en','fr'] as const)('renders a bounded %s overview with privacy, dirty-state warning and no automatic action',language=>{
 const open=vi.fn(),fetch=vi.spyOn(globalThis,'fetch')
 try{const html=renderToStaticMarkup(createElement(UiLanguageProvider,{initialLanguage:language,children:createElement(CourseProductionOverviewPanel,{project:fixture(25),dirty:true,onEditLesson:open})}));expect(html.match(/<article/g)).toHaveLength(10);expect(html.match(/<meter/g)).toHaveLength(20);expect(html).toContain(translateUi(language,'course.overview.dirty'));expect(html).toContain(translateUi(language,'course.overview.boundary'));expect(html).not.toContain('PRIVATE_');expect(html).not.toContain('KINAOU/Assets');expect(html).toContain('disabled=""');expect(open).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled()}finally{fetch.mockRestore()}
})
