import { it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createProject, parseProject } from '../src/core/project'
import { newCourseOutline, projectCourse, saveCourseOutline } from '../src/core/course'
import { commitCourseCurriculum, courseCurriculumContext, courseCurriculumReviewIsCurrent, parseCourseCurriculumResult, projectCourseCurriculumRecord, reviewCourseCurriculum } from '../src/core/courseCurriculumDraft'
import { CourseCurriculumDraftPanel } from '../src/components/CourseCurriculumDraftPanel'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import { PersistentVersionHistory } from '../src/core/versioning'
import { WorkerClient } from '../src/core/workerClient'
import { uiCourseCurriculumMessages } from '../src/core/uiCourseCurriculumMessages'
import { translateUi } from '../src/core/uiMessages'
import { validateCourseCurriculumProposal } from '../worker/course-curriculum.mjs'
const notes = 'A triangle has three sides. A square has four equal sides.', proposal = { modules: [{ title: 'Shapes', lessons: [{ title: 'Triangle', objective: 'Describe three sides.', sourceQuote: 'A triangle has three sides.' }, { title: 'Square', objective: 'Describe four equal sides.', sourceQuote: 'A square has four equal sides.' }] }] }, generated = { proposal, modelId: 'local', adapterId: 'ollama' as const }, timing = { startMs: 9000, slotMs: 30000 }
function fixture() { const p = createProject('Course'); return saveCourseOutline(p, { ...newCourseOutline(p), id: 'course', language: 'en', modules: [{ id: 'existing', title: 'Original module', lessons: [{ id: 'old', title: 'Existing lesson', objective: 'Keep', script: 'PRIVATE_EXISTING_SCRIPT', range: { inMs: 1000, outMs: 9000 } }] }] }) }
const deps = () => ({ snapshot: vi.fn(), persist: vi.fn() })
function review(p = fixture(), accepted = proposal, ranges = timing) { return reviewCourseCurriculum(p, courseCurriculumContext(p, notes, 2), generated, accepted, ranges) }
it('uses only explicit notes and saved course preferences without old scripts/media', () => { const p = fixture(), before = JSON.stringify(p), context = courseCurriculumContext(p, notes, 2); expect(context.language).toBe('en'); expect(context.lessonCount).toBe(2); expect(JSON.stringify(context)).not.toContain('PRIVATE_EXISTING'); expect(JSON.stringify(p)).toBe(before); expect(() => courseCurriculumContext(createProject('Unsaved'), notes, 2)).toThrow() })
it.each([0,7,1.5,NaN])('refuses invalid requested count %s', count => expect(() => courseCurriculumContext(fixture(), notes, count)).toThrow())
it('rejects oversized full UTF-8 context and invented, repeated or wrong-count proposals', () => {
 const p = fixture(), context = courseCurriculumContext(p, notes, 2)
 expect(() => courseCurriculumContext(p, '界'.repeat(5000), 2)).toThrow('12,000')
 for (const mutate of [(v:any) => { v.modules[0].lessons.pop() }, (v:any) => { v.modules[0].lessons[1].title = 'TRIANGLE' }, (v:any) => { v.modules[0].lessons[0].sourceQuote = 'Invented' }, (v:any) => { v.verified = true }]) { const input = structuredClone(proposal); mutate(input); expect(() => validateCourseCurriculumProposal(context, input)).toThrow() }
 expect(() => parseCourseCurriculumResult(context, { ...generated, modelId: 'wrong' }, 'local')).toThrow()
})
it('appends editable planned modules, retaining existing content and no media changes', () => {
 const p = fixture(), before = JSON.stringify(p), accepted = structuredClone(proposal); accepted.modules[0].lessons[0].objective = 'AUTHOR EDIT'
 const r = review(p, accepted), d = deps(); expect(JSON.stringify(p)).toBe(before)
 const next = commitCourseCurriculum(p, r, true, d), course = projectCourse(next)!
 expect(course.modules[0]).toEqual(projectCourse(p)!.modules[0]); expect(course.modules).toHaveLength(2); expect(course.revision).toBe(2)
 expect(course.modules[1].lessons.map(l=>l.range)).toEqual([{inMs:9000,outMs:39000},{inMs:39000,outMs:69000}]);expect(course.modules[1].lessons[0].script).toBeUndefined()
 expect(next.tracks).toEqual(p.tracks);expect(next.assets).toEqual(p.assets);expect(next.script).toEqual(p.script);expect(projectCourseCurriculumRecord(next)).toMatchObject({generated:proposal,accepted,edited:true,timing})
 expect(d.snapshot).toHaveBeenCalledExactlyOnceWith(p);expect(d.persist).toHaveBeenCalledExactlyOnceWith(next);expect(courseCurriculumReviewIsCurrent(p,r)).toBe(false);expect(JSON.stringify(p)).toBe(before)
 const reloaded=parseProject(JSON.parse(JSON.stringify(next)));expect(projectCourseCurriculumRecord(reloaded)).toEqual(projectCourseCurriculumRecord(next))
})
it('retries one prepared set of stable IDs, one snapshot and one revision after failed persistence',()=>{
 const p=fixture(),r=review(p),d=deps();d.persist.mockImplementationOnce(()=>{throw Error('disk')})
 expect(()=>commitCourseCurriculum(p,r,true,d)).toThrow('disk');const next=commitCourseCurriculum(p,r,true,d);expect(d.snapshot).toHaveBeenCalledTimes(1);expect(d.persist).toHaveBeenCalledTimes(2);expect(d.persist.mock.calls[0][0]).toBe(next);expect(projectCourse(next)!.revision).toBe(2)
})
it('snapshot failure does not persist and can retry snapshot',()=>{const p=fixture(),r=review(p),d=deps();d.snapshot.mockImplementationOnce(()=>{throw Error('history')});expect(()=>commitCourseCurriculum(p,r,true,d)).toThrow('history');expect(d.persist).not.toHaveBeenCalled();commitCourseCurriculum(p,r,true,d);expect(d.snapshot).toHaveBeenCalledTimes(2)})
it('retains only the latest provenance batch while preserving earlier modules and safety versions',()=>{
 const p=fixture(),d=deps(),first=commitCourseCurriculum(p,review(p),true,d),secondProposal=structuredClone(proposal);secondProposal.modules[0].title='Next module';secondProposal.modules[0].lessons.forEach(l=>{l.title+=' next'})
 const context=courseCurriculumContext(first,notes,2),r=reviewCourseCurriculum(first,context,{...generated,proposal:secondProposal},secondProposal,{startMs:69000,slotMs:10000}),second=commitCourseCurriculum(first,r,true,d)
 expect(projectCourse(second)!.modules.slice(0,2)).toEqual(projectCourse(first)!.modules);expect(projectCourseCurriculumRecord(second)!.context.revision).toBe(2);expect(d.snapshot.mock.calls[1][0]).toBe(first)
 const memory=new Map<string,string>(),history=new PersistentVersionHistory({getItem:k=>memory.get(k)??null,setItem:(k,v)=>{memory.set(k,v)},removeItem:k=>{memory.delete(k)}});history.snapshot(p,'original','user');const version=history.snapshot(first,'first batch','user');const restored=history.restoreReversibly(second,version.id);expect(projectCourseCurriculumRecord(restored.project)).toEqual(projectCourseCurriculumRecord(first))
})
it.each(['project','dirty','record'] as const)('observed %s changes invalidate permanently including A–B–A',kind=>{const p=fixture(),r=review(p);if(kind==='record'){r.record.modelId='forged';expect(courseCurriculumReviewIsCurrent(p,r)).toBe(false);r.record.modelId='local'}else expect(courseCurriculumReviewIsCurrent(kind==='project'?{...p,title:'changed'}:p,r,kind==='dirty')).toBe(false);expect(courseCurriculumReviewIsCurrent(p,r)).toBe(false);expect(()=>commitCourseCurriculum(p,r,true,deps())).toThrow()})
it('requires current original review and explicit acknowledgement',()=>{const p=fixture(),r=review(p),d=deps();expect(()=>commitCourseCurriculum(p,r,false,d)).toThrow();expect(()=>commitCourseCurriculum(p,{...r},true,d)).toThrow();expect(d.snapshot).not.toHaveBeenCalled()})
it.each([{startMs:0,slotMs:30000},{startMs:9000,slotMs:0},{startMs:86400000,slotMs:1},{startMs:9000.5,slotMs:30000}])('rejects overlap or invalid planned ranges %j',ranges=>expect(()=>review(fixture(),proposal,ranges)).toThrow())
it('refuses title collisions and course capacities before snapshot/write',()=>{
 const p=fixture(),input=structuredClone(proposal);input.modules[0].title='ORIGINAL MODULE';expect(()=>review(p,input)).toThrow('already exists')
 input.modules[0].title='New';input.modules[0].lessons[0].title='Existing lesson';expect(()=>review(p,input)).toThrow('already exists')
 const c=projectCourse(p)!,full=saveCourseOutline(p,{...c,modules:Array.from({length:50},(_,i)=>({id:'m'+i,title:'M'+i,lessons:[]}))});expect(()=>review(full)).toThrow()
})
it('rejects corrupt historical identities, quotes, IDs, range or edit flags rather than overwriting',()=>{
 const p=fixture(),next=commitCourseCurriculum(p,review(p),true,deps())
 for(const mutate of [(r:any)=>{r.projectId='other'},(r:any)=>{r.edited=true},(r:any)=>{r.accepted.modules[0].lessons[0].sourceQuote='invented'},(r:any)=>{r.modules[0].lessons[0].range.inMs++},(r:any)=>{r.modules[0].lessons[1].id=r.modules[0].lessons[0].id}]){const copy=structuredClone(next);mutate(copy.metadata.courseCurriculumDraft);expect(()=>projectCourseCurriculumRecord(copy)).toThrow()}
})
it.each(['de','en','fr'] as const)('renders %s localized UI without I/O or credential leakage',language=>{
 const write=vi.fn(),fetch=vi.spyOn(globalThis,'fetch');try{const html=renderToStaticMarkup(createElement(UiLanguageProvider,{initialLanguage:language,children:createElement(CourseCurriculumDraftPanel,{project:fixture(),dirty:false,history:new PersistentVersionHistory({getItem:()=>null,setItem:write,removeItem:write}),onProjectChange:write,onSaved:write,workerUrl:'http://127.0.0.1:43117',workerToken:'PRIVATE_TOKEN',workerConnected:true,workerCapabilities:['course-curriculum']})}));expect(html).toContain(translateUi(language,'course.curriculum.heading'));expect(html).not.toContain('PRIVATE_TOKEN');for(const key of Object.keys(uiCourseCurriculumMessages) as Array<keyof typeof uiCourseCurriculumMessages>)expect(translateUi(language,key)).not.toBe(key);expect(write).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled()}finally{fetch.mockRestore()}
})
it('uses the authenticated exact curriculum route and rejects wrong result envelopes',async()=>{
 const fetchImpl=vi.fn(async()=>new Response(JSON.stringify({ok:true,type:'course-curriculum',result:generated}))),client=new WorkerClient({baseUrl:'http://127.0.0.1:43117',token:'test-only',fetchImpl}),context=courseCurriculumContext(fixture(),notes,2)
 expect(await client.generateCourseCurriculum('local',context)).toEqual(generated);expect(fetchImpl).toHaveBeenCalledWith('http://127.0.0.1:43117/course/curriculum/generate',expect.objectContaining({method:'POST',body:JSON.stringify({model:'local',context}),headers:expect.objectContaining({authorization:'Bearer test-only'})}))
 fetchImpl.mockImplementationOnce(async()=>new Response(JSON.stringify({ok:true,type:'course-script',result:generated})));await expect(client.generateCourseCurriculum('local',context)).rejects.toThrow()
})
