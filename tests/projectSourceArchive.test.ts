import { it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createProject, parseProject } from '../src/core/project'
import { newCourseOutline, saveCourseOutline } from '../src/core/course'
import { reviewProjectSourceArchive, useProjectSourceArchiveReview, retainSourceArchiveTicket, readSourceArchiveTicket, forgetSourceArchiveTicket, SourceArchiveSession, type SourceArchiveFeedback, type SourceArchiveTicket } from '../src/core/projectSourceArchive'
import { validateSourceArchiveQuery, type SourceArchiveJob } from '../worker/project-source-protocol.mjs'
import { ProjectSourceArchivePanel } from '../src/components/ProjectSourceArchivePanel'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import { uiLanguages } from '../src/core/uiLanguage'
import { translateUi } from '../src/core/uiMessages'
import { WorkerClient } from '../src/core/workerClient'
import type { DeliveryStorage } from '../src/core/courseLessonDelivery'
const storage = (): DeliveryStorage => { const data = new Map<string,string>(); return { getItem: key => data.get(key) ?? null, setItem: (key,value) => {data.set(key,value)}, removeItem: key => {data.delete(key)} } }
function fixture() {
  const base = parseProject({...createProject('Private course'), assets:[{id:'source',kind:'video',uri:'KINAOU/Assets/source.mp4',managed:true}]})
  return saveCourseOutline(base,{...newCourseOutline(base),language:'fr',modules:[{id:'module',title:'Module',lessons:[{id:'lesson',title:'Lesson',objective:'',script:'Private words',range:{inMs:0,outMs:2000}}]}]})
}
async function setup() {
  const project=fixture(), review=await reviewProjectSourceArchive(project), request=useProjectSourceArchiveReview(project,review,true)
  const ticket: SourceArchiveTicket={schemaVersion:1,workerUrl:'http://127.0.0.1:43948',query:validateSourceArchiveQuery(request)}
  const job: SourceArchiveJob={schemaVersion:1,query:ticket.query,state:'queued'}
  return {project,review,request,ticket,job}
}
it('reviews exact project metadata and explicit file inventory without writing or fetching',async()=>{
  const project=fixture(),before=JSON.stringify(project),fetch=vi.spyOn(globalThis,'fetch')
  try {
    const review=await reviewProjectSourceArchive(project);expect(review).toMatchObject({language:'fr',assetCount:1,inlineCaptions:0,paths:['KINAOU/Assets/source.mp4']})
    const request=useProjectSourceArchiveReview(project,review,true);expect(JSON.parse(request.projectText)).toEqual(project);expect(request.projectSha256).toMatch(/^[a-f0-9]{64}$/)
    expect(JSON.stringify(project)).toBe(before);expect(fetch).not.toHaveBeenCalled()
  } finally {fetch.mockRestore()}
})
it.each(['project','review','forged','ack'] as const)('rejects changed or unapproved %s review',async kind=>{
  const {project,review}=await setup()
  if(kind==='project') project.script='Changed'
  if(kind==='review') review.paths.push('KINAOU/Assets/other.mp4')
  expect(()=>useProjectSourceArchiveReview(project,kind==='forged'?{...review}:review,kind!=='ack')).toThrow()
})
it('stores only a bounded credential-free digest ticket, not the entire private project, and forgets only that record',async()=>{
  const {ticket}=await setup(),store=storage();retainSourceArchiveTicket(store,ticket)
  expect(readSourceArchiveTicket(store,ticket.query.projectId)).toEqual(ticket)
  expect(JSON.stringify(ticket)).not.toContain('Private words');expect(JSON.stringify(ticket).length).toBeLessThan(1024)
  expect(()=>retainSourceArchiveTicket(store,ticket)).toThrow()
  expect(()=>forgetSourceArchiveTicket(store,{...ticket,query:{...ticket.query,projectSha256:'0'.repeat(64)}})).toThrow()
  forgetSourceArchiveTicket(store,ticket);expect(readSourceArchiveTicket(store,ticket.query.projectId)).toBeNull()
})
it.each(['throw','readback'] as const)('never dispatches after %s storage failure',async kind=>{
  const {ticket,request,job}=await setup(), start=vi.fn(async()=>job), feedback:SourceArchiveFeedback[]=[]
  const store:DeliveryStorage={getItem:()=>null,setItem:()=>{if(kind==='throw')throw Error('quota')},removeItem:()=>{}}
  const session=new SourceArchiveSession(ticket,{storage:store,current:()=>true,publish:value=>feedback.push(value),client:{startProjectSourceArchive:start,projectSourceArchiveStatus:vi.fn(async()=>job)}})
  await session.start(request);expect(start).not.toHaveBeenCalled();expect(feedback.at(-1)?.phase).toBe('failed')
})
it('retains before dispatch and recovers lost acceptance by status only, including a fresh session',async()=>{
  const {ticket,request,job}=await setup(),store=storage(),feedback:SourceArchiveFeedback[]=[]
  const start=vi.fn(async()=>{expect(readSourceArchiveTicket(store,ticket.query.projectId)).toEqual(ticket);throw Error('reply lost')})
  const status=vi.fn(async()=>job),deps={storage:store,current:()=>true,publish:(value:SourceArchiveFeedback)=>feedback.push(value),client:{startProjectSourceArchive:start,projectSourceArchiveStatus:status}}
  const first=new SourceArchiveSession(ticket,deps);await first.start(request);await first.start(request)
  expect(start).toHaveBeenCalledTimes(1);expect(feedback.at(-1)?.phase).toBe('uncertain')
  await new SourceArchiveSession(readSourceArchiveTicket(store,ticket.query.projectId)!,deps).check()
  expect(status).toHaveBeenCalledTimes(1);expect(start).toHaveBeenCalledTimes(1);expect(feedback.at(-1)?.phase).toBe('job')
})
it('drops late replies permanently after detach and clones mutable caller input',async()=>{
  const {ticket,request,job}=await setup(),store=storage(),feedback:SourceArchiveFeedback[]=[]
  let release!:(job:SourceArchiveJob)=>void
  const pending=new Promise<SourceArchiveJob>(done=>{release=done}),start=vi.fn(()=>pending)
  const session=new SourceArchiveSession(ticket,{storage:store,current:()=>true,publish:value=>feedback.push(value),client:{startProjectSourceArchive:start,projectSourceArchiveStatus:vi.fn(async()=>job)}})
  const work=session.start(request);request.projectText='changed';session.detach();release(job);await work
  expect(start.mock.calls[0]).toBeDefined();expect(feedback.map(value=>value.phase)).toEqual(['checking'])
  await session.check();expect(feedback).toHaveLength(1)
})
it('blocks mismatching request/ticket, corrupt reminders and credential-bearing URLs',async()=>{
  const {ticket,request,job}=await setup(),store=storage(),start=vi.fn(async()=>job)
  const session=new SourceArchiveSession(ticket,{storage:store,current:()=>true,publish:()=>{},client:{startProjectSourceArchive:start,projectSourceArchiveStatus:vi.fn(async()=>job)}})
  await session.start({...request,projectSha256:'0'.repeat(64)});expect(start).not.toHaveBeenCalled()
  expect(()=>retainSourceArchiveTicket(store,{...ticket,workerUrl:'http://user:secret@localhost'})).toThrow()
  expect(()=>readSourceArchiveTicket({getItem:()=>'{broken',setItem:()=>{},removeItem:()=>{}},ticket.query.projectId)).toThrow()
})
it('uses authenticated explicit start/status client calls and rejects a mismatched server response',async()=>{
  const {request,ticket,job}=await setup(),fetch=vi.spyOn(globalThis,'fetch')
  try {
    fetch.mockImplementation(async()=>new Response(JSON.stringify({ok:true,type:'project-source-archive',job}),{status:200}))
    const client=new WorkerClient({baseUrl:ticket.workerUrl,token:'test-only'})
    await client.startProjectSourceArchive(request);await client.projectSourceArchiveStatus(ticket.query)
    expect(String(fetch.mock.calls[0][0])).toContain('/projects/source-archive/start');expect(String(fetch.mock.calls[1][0])).toContain('/projects/source-archive/status')
    expect(JSON.stringify(fetch.mock.calls[1][1])).not.toContain('Private words')
    fetch.mockResolvedValue(new Response(JSON.stringify({ok:true,type:'project-source-archive',job:{...job,query:{...job.query,projectId:'other'}}}),{status:200}))
    await expect(client.projectSourceArchiveStatus(ticket.query)).rejects.toThrow()
  } finally {fetch.mockRestore()}
})
it.each(uiLanguages)('renders %s explicit archive limits and exclusions with no requests on mount',language=>{
  const project=fixture(),fetch=vi.spyOn(globalThis,'fetch')
  try {
    const html=renderToStaticMarkup(createElement(UiLanguageProvider,{initialLanguage:language,children:createElement(ProjectSourceArchivePanel,{project,dirty:true})}))
    for(const key of ['sourceArchive.heading','sourceArchive.exclusions','sourceArchive.limits','sourceArchive.review'] as const)expect(html).toContain(translateUi(language,key))
    expect(html).toContain('button disabled=""');expect(fetch).not.toHaveBeenCalled()
  }finally{fetch.mockRestore()}
})
