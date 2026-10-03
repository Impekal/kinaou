import { it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { CourseOutputPlayback, type CourseStreamSource } from '../src/core/courseOutputPlayback'
import { WorkerClient } from '../src/core/workerClient'
import { createProject } from '../src/core/project'
import { recordSuccessfulExport } from '../src/core/exportHistory'
import { CourseOutputPlaybackControl } from '../src/components/CourseOutputPlaybackControl'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import { translateUi } from '../src/core/uiMessages'
const id='a'.repeat(64),base='http://127.0.0.1:43992',url=`${base}/course/output-stream/${id}`
const receipt={schemaVersion:1 as const,jobId:'job',label:'Lesson',outputRelativePath:'KINAOU/Renders/lesson.mp4',format:'landscape' as const,range:{inMs:0,outMs:1000},sceneIds:[],durationMs:1000,completedAt:'2026-09-27T00:00:00.000Z',courseLesson:{courseId:'course',moduleId:'module',lessonId:'lesson',outlineRevision:1,courseTitle:'Course',moduleTitle:'Module',lessonTitle:'Lesson',language:'en' as const}}
function fixture(){
  let scope={project:recordSuccessfulExport(createProject('Stream'),receipt),jobId:'job',dirty:false,connection:'original'}
  const source:CourseStreamSource={url,expiresAt:Date.now()+7200000,release:vi.fn()}
  const deps={environment:()=>scope,load:vi.fn(async()=>source),publish:vi.fn(),createUrl:vi.fn(),revokeUrl:vi.fn()}
  const session=new CourseOutputPlayback(scope,deps)
  return{source,deps,session,get scope(){return scope},change(next:typeof scope){scope=next;session.observe(scope)}}
}
it('owns a streaming grant without buffering/creating blob URLs; close revokes once',async()=>{
  const f=fixture(),before=JSON.stringify(f.scope.project);await f.session.load()
  expect(f.deps.publish).toHaveBeenLastCalledWith({phase:'loaded',url});expect(f.deps.createUrl).not.toHaveBeenCalled()
  f.session.detach();f.session.detach();expect(f.source.release).toHaveBeenCalledOnce();expect(f.deps.revokeUrl).not.toHaveBeenCalled();expect(JSON.stringify(f.scope.project)).toBe(before)
})
it.each(['project','selection','dirty','connection','leave'])('revokes a late stream after %s including A/B/A',async kind=>{
  const f=fixture(),original=f.scope;let finish!:(source:CourseStreamSource)=>void
  f.deps.load.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve}));const pending=f.session.load();await f.session.load();expect(f.deps.load).toHaveBeenCalledOnce()
  if(kind==='leave')f.session.detach();else f.change({...original,...(kind==='project'?{project:{...original.project,title:'B'}}:kind==='selection'?{jobId:'B'}:kind==='dirty'?{dirty:true}:{connection:'B'})})
  f.change(original);finish(f.source);await pending
  expect(f.source.release).toHaveBeenCalledOnce();expect(f.deps.publish.mock.calls.map(c=>c[0].phase)).toEqual(['loading'])
})
it('expires displayed access and revokes it without an automatic request',async()=>{
  vi.useFakeTimers();const f=fixture()
  try{await f.session.load();await vi.advanceTimersByTimeAsync(7200001);expect(f.source.release).toHaveBeenCalledOnce();expect(f.deps.publish).toHaveBeenLastCalledWith({phase:'failed'});expect(f.deps.load).toHaveBeenCalledOnce()}finally{f.session.detach();vi.useRealTimers()}
})
it.each(['remote','credential','query','path','expired','too-long'])('rejects %s stream and releases it',async kind=>{
  const f=fixture();Object.assign(f.source,kind==='expired'?{expiresAt:Date.now()-1}:kind==='too-long'?{expiresAt:Date.now()+9000000}:{url:kind==='remote'?url.replace('127.0.0.1','example.com'):kind==='credential'?url.replace('http://','http://user@'):kind==='query'?url+'?token=secret':base+'/media'})
  await f.session.load();expect(f.deps.publish.mock.calls.at(-1)?.[0].phase).toBe('failed');expect(f.source.release).toHaveBeenCalledOnce();f.session.detach()
})
it('decode failure closes the grant; explicit reload may obtain a fresh one',async()=>{const f=fixture();await f.session.load();f.session.playbackFailed();expect(f.source.release).toHaveBeenCalledOnce();await f.session.load();expect(f.deps.load).toHaveBeenCalledTimes(2);f.session.detach()})
const payload=()=>({ok:true,type:'course-output-stream',stream:{id,sizeBytes:300*1024**2,expiresAt:Date.now()+7200000}})
it('client uses bearer only in authenticated create/release, never in video URL',async()=>{
  const fetchImpl=vi.fn(async()=>Response.json(payload())),client=new WorkerClient({baseUrl:base,token:'PRIVATE_SECRET',fetchImpl}),abort=new AbortController()
  const source=await client.openCourseOutputStream(receipt,abort.signal)
  expect(source.url).toBe(url);expect(source.url).not.toContain('PRIVATE_SECRET');expect(fetchImpl.mock.calls[0]).toMatchObject([base+'/course/output-stream',{method:'POST',redirect:'error',signal:abort.signal,headers:{authorization:'Bearer PRIVATE_SECRET'}}])
  source.release();source.release();await Promise.resolve();expect(fetchImpl).toHaveBeenCalledTimes(2);expect(fetchImpl.mock.calls[1]).toMatchObject([base+'/course/output-stream-release',{method:'POST',redirect:'error',keepalive:true,body:JSON.stringify({id})}])
})
it.each(['id','bytes','expiry','type','receipt-size','course'])('client rejects invalid %s grant contract',async kind=>{
  const value=payload();if(kind==='id')value.stream.id='../other';if(kind==='bytes')value.stream.sizeBytes=9*1024**3;if(kind==='expiry')value.stream.expiresAt=0;if(kind==='type')value.type='other'
  const client=new WorkerClient({baseUrl:base,token:'test',fetchImpl:async()=>Response.json(value)})
  await expect(client.openCourseOutputStream({...receipt,...(kind==='receipt-size'?{sizeBytes:12}:kind==='course'?{courseLesson:undefined}:{})})).rejects.toThrow()
})
it.each(['de','en','fr'] as const)('shows explicit streaming limits in %s only for capable workers',language=>{
  const f=fixture(),write=vi.fn(),fetch=vi.spyOn(globalThis,'fetch')
  try{const html=renderToStaticMarkup(createElement(UiLanguageProvider,{initialLanguage:language,children:createElement(CourseOutputPlaybackControl,{project:f.scope.project,jobId:'job',dirty:false,workerConnected:true,workerToken:'test',workerUrl:base,workerCapabilities:['course-output-playback','course-output-stream']})}));expect(html).toContain(translateUi(language,'course.playback.streamHelp'));expect(html).not.toContain('<video');expect(html).not.toContain(url);expect(fetch).not.toHaveBeenCalled();expect(write).not.toHaveBeenCalled()}finally{fetch.mockRestore()}
})
