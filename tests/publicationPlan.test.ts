import { it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createProject, parseProject } from '../src/core/project'
import { recordSuccessfulExport, type ExportReceipt } from '../src/core/exportHistory'
import { publicationInstant, publicationLocalTime, publicationTimeZone } from '../src/core/publicationTime'
import { reviewPublicationPlan, applyPublicationPlan, projectPublicationPlan, publicationPlanCalendar, publicationPlanMissingReceipts, publicationPlanChoices, type PublicationPlanDraft } from '../src/core/publicationPlan'
import { PublicationPlanPanel } from '../src/components/PublicationPlanPanel'
import { PersistentVersionHistory } from '../src/core/versioning'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import { uiLanguages } from '../src/core/uiLanguage'
import { translateUi } from '../src/core/uiMessages'
const now=new Date('2026-09-27T07:00:00.000Z')
function receipt(jobId:string,format:ExportReceipt['format'],durationMs:number):ExportReceipt{return{schemaVersion:1,jobId,label:jobId,outputRelativePath:'KINAOU/Renders/'+jobId+'.mp4',format,range:{inMs:0,outMs:durationMs},sceneIds:[],durationMs,completedAt:now.toISOString()}}
function fixture(){
 let project=createProject('Publication experiment')
 for(const item of [receipt('main','landscape',300000),receipt('short-one','vertical',40000),receipt('short-two','square',60000),receipt('short-three','vertical',90000),receipt('too-long','vertical',200000)])project=recordSuccessfulExport(project,item)
 return project
}
const draft:PublicationPlanDraft={mainJobId:'main',shorts:[{jobId:'short-one',offsetHours:24},{jobId:'short-two',offsetHours:72}],mainLocal:'2026-10-24T18:00',timeZone:'Europe/Berlin',targetMarket:'DE',rationale:'An explicitly authored timing experiment, not audience evidence.'}
const labels={main:'Review main video',short:'Review Short',warning:'Local experiment only; no automatic publishing.'}
it.each([
 ['2026-09-28T18:00','Europe/Berlin','2026-09-28T16:00:00.000Z'],
 ['2026-12-28T18:00','Europe/Paris','2026-12-28T17:00:00.000Z'],
 ['2026-09-28T18:00','America/New_York','2026-09-28T22:00:00.000Z'],
 ['2026-09-28T18:00','Asia/Kathmandu','2026-09-28T12:15:00.000Z'],
 ['2026-09-28T18:00','Pacific/Kiritimati','2026-09-28T04:00:00.000Z'],
 ['2026-09-28T00:00','UTC','2026-09-28T00:00:00.000Z']
])('resolves exact local time %s in %s independent of machine zone',(local,zone,instant)=>{
 expect(publicationInstant(local,zone)).toBe(instant);expect(publicationLocalTime(instant,zone)).toBe(local)
})
it.each([
 ['2026-03-29T02:30','Europe/Berlin'],['2026-10-25T02:30','Europe/Berlin'],
 ['2026-03-08T02:30','America/New_York'],['2026-11-01T01:30','America/New_York'],
 ['2026-10-04T02:15','Australia/Lord_Howe'],['2026-04-05T01:45','Australia/Lord_Howe']
])('rejects nonexistent or repeated local time %s in %s',(local,zone)=>expect(()=>publicationInstant(local,zone)).toThrow(/clock change/))
it.each(['2026-02-30T12:00','2026-09-28T24:00','2026-09-28','2019-12-31T12:00','2101-01-01T12:00'])('rejects invalid or out-of-scope wall time %s',local=>expect(()=>publicationInstant(local,'UTC')).toThrow())
it('rejects invented and injection time zones',()=>{for(const zone of ['Mars/Base','Europe/Berlin\nDTSTART:evil','+02:00',''])expect(()=>publicationTimeZone(zone)).toThrow()})
it('reviews real retained exports and elapsed offsets across DST without writes; explicit save survives reload',()=>{
 const project=fixture(),before=JSON.stringify(project),review=reviewPublicationPlan(project,draft,now)
 expect(JSON.stringify(project)).toBe(before);expect(review.plan.basis).toBe('author-experiment')
 expect(review.plan.events.map(e=>e.local)).toEqual(['2026-10-24T18:00','2026-10-25T17:00','2026-10-27T17:00'])
 const saved=applyPublicationPlan(project,review,true,now),plan=projectPublicationPlan(parseProject(JSON.parse(JSON.stringify(saved))))!
 expect(plan).toEqual(review.plan);expect(saved.script).toBe(project.script);expect(saved.tracks).toEqual(project.tracks)
 expect(publicationPlanMissingReceipts(saved,plan)).toBe(0);expect(publicationPlanChoices(project).shorts.some(r=>r.jobId==='too-long')).toBe(false)
})
it.each(['missing','same-main','duplicate','order','fractional','too-large','too-long','same-file','past','empty-rationale'] as const)('rejects invalid %s plan',kind=>{
 const project=fixture(),input=structuredClone(draft)
 if(kind==='missing')input.mainJobId='missing'
 if(kind==='same-main')input.mainJobId='short-one'
 if(kind==='duplicate')input.shorts[1].jobId='short-one'
 if(kind==='order')input.shorts[1].offsetHours=12
 if(kind==='fractional')input.shorts[0].offsetHours=1.5
 if(kind==='too-large')input.shorts[1].offsetHours=721
 if(kind==='too-long')input.shorts[0].jobId='too-long'
 if(kind==='past')input.mainLocal='2026-09-26T18:00'
 if(kind==='empty-rationale')input.rationale=' '
 if(kind==='same-file'){const list=project.metadata.exportHistory as ExportReceipt[];list.find(r=>r.jobId==='short-one')!.outputRelativePath='KINAOU/Renders/main.mp4'}
 expect(()=>reviewPublicationPlan(project,input,now)).toThrow()
})
it.each(['ack','copied','project','mutated','expired'] as const)('rejects invalid %s approval and keeps project unchanged',kind=>{
 const project=fixture(),review=reviewPublicationPlan(project,draft,now),before=JSON.stringify(project)
 const changed=structuredClone(project);if(kind==='project')changed.script='changed'
 if(kind==='mutated')review.plan.rationale='changed'
 expect(()=>applyPublicationPlan(changed,kind==='copied'?{...review}:review,kind!=='ack',kind==='expired'?new Date('2026-11-01T00:00:00.000Z'):now)).toThrow()
 expect(JSON.stringify(project)).toBe(before)
})
it('keeps valid review usable for save-only retry after a persistence failure',()=>{
 const project=fixture(),review=reviewPublicationPlan(project,draft,now),persist=vi.fn((_next:typeof project)=>{throw Error('quota')})
 expect(()=>persist(applyPublicationPlan(project,review,true,now))).toThrow('quota')
 expect(projectPublicationPlan(applyPublicationPlan(project,review,true,now))).toEqual(review.plan)
})
it('keeps stable plan identity across revisions and warns for missing/changed historical receipts',()=>{
 const project=fixture(),saved=applyPublicationPlan(project,reviewPublicationPlan(project,draft,now),true,now),first=projectPublicationPlan(saved)!
 const next=applyPublicationPlan(saved,reviewPublicationPlan(saved,{...draft,rationale:'A revised experiment'},now),true,now),second=projectPublicationPlan(next)!
 expect(second.id).toBe(first.id);expect(second.revision).toBe(2)
 next.metadata.exportHistory=[];expect(publicationPlanMissingReceipts(next,second)).toBe(3);expect(projectPublicationPlan(next)!.events).toEqual(second.events)
})
it('rejects forged saved event offsets, project identity and corrupt metadata',()=>{
 const project=fixture(),saved=applyPublicationPlan(project,reviewPublicationPlan(project,draft,now),true,now)
 for(const mutate of [(p:any)=>{p.events[1].at=p.events[0].at},(p:any)=>{p.projectId='wrong'},(p:any)=>{p.events[1].local='2026-01-01T00:00'}]){
  const changed=structuredClone(saved);mutate(changed.metadata.publicationPlan);expect(()=>projectPublicationPlan(changed)).toThrow()
 }
})
it('exports deterministic private tentative UTC calendar events with safe UTF-8 folding and no active payloads',()=>{
 const project=fixture(),review=reviewPublicationPlan(project,draft,now),plan=review.plan
 plan.events[0].receipt.label='Émoji 🌍, semi; slash\\ newline\nBEGIN:VALARM'
 plan.rationale='É'.repeat(180)+'\nEND:VEVENT\nATTENDEE:mailto:never@example.org'
 const calendar=publicationPlanCalendar(plan,labels),unfolded=calendar.replace(/\r\n /g,'')
 expect(calendar).toBe(publicationPlanCalendar(plan,labels));expect(calendar.replace(/\r\n/g,'')).not.toMatch(/[\r\n]/)
 expect(unfolded.split('\r\n').filter(line=>line==='BEGIN:VEVENT')).toHaveLength(3)
 expect(unfolded).toContain('DTSTART:20261024T160000Z');expect(unfolded).toContain('DTEND:20261024T161500Z')
 expect(unfolded).toContain('CLASS:PRIVATE');expect(unfolded).toContain('STATUS:TENTATIVE')
 for(const line of calendar.split('\r\n'))expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75)
 const active=unfolded.split('\r\n');expect(active.some(line=>/^(ATTENDEE|ORGANIZER|URL|ATTACH|METHOD):/.test(line))).toBe(false)
 expect(active).not.toContain('BEGIN:VALARM');expect(unfolded).toContain('\\nBEGIN:VALARM');expect(unfolded).toContain('\\, semi\\;')
})
const storage=()=>{const values=new Map<string,string>();return{getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v)},removeItem:(k:string)=>{values.delete(k)}}}
it.each(uiLanguages)('renders explicit local-plan boundaries in %s without fetch, save or download',language=>{
 const project=fixture(),saved=applyPublicationPlan(project,reviewPublicationPlan(project,draft,now),true,now),save=vi.fn(),fetch=vi.spyOn(globalThis,'fetch')
 try{const html=renderToStaticMarkup(createElement(UiLanguageProvider,{initialLanguage:language,children:createElement(PublicationPlanPanel,{project:saved,history:new PersistentVersionHistory(storage()),onProjectChange:save})}))
 expect(html).toContain(translateUi(language,'publicationPlan.heading'));expect(html).toContain(translateUi(language,'publicationPlan.calendarHelp'));expect(html).toContain('Europe/Berlin')
 expect(save).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled()}finally{fetch.mockRestore()}
})
