import { it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createProject } from '../src/core/project'
import { newCourseOutline, projectCourse, saveCourseOutline } from '../src/core/course'
import { commitCourseScript, courseScriptContext, courseScriptReviewIsCurrent, courseScriptText, parseCourseScriptResult, projectCourseScriptRecords, reviewCourseScript } from '../src/core/courseScriptDraft'
import { CourseScriptDraftPanel } from '../src/components/CourseScriptDraftPanel'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import { PersistentVersionHistory } from '../src/core/versioning'
import { WorkerClient } from '../src/core/workerClient'
import { uiCourseScriptDraftMessages } from '../src/core/uiCourseScriptDraftMessages'
import { translateUi } from '../src/core/uiMessages'
function fixture() { const base = createProject('Course'); return saveCourseOutline(base, { ...newCourseOutline(base), id: 'course', language: 'fr', modules: [{ id: 'module', title: 'Module', lessons: [{ id: 'lesson', title: 'Triangle', objective: 'Explain', script: 'ORIGINAL PRIVATE SCRIPT', range: { inMs: 1000, outMs: 6000 } }, { id: 'other', title: 'Other', objective: 'Do not change', script: 'OTHER SCRIPT', range: { inMs: 6000, outMs: 9000 } }] }] }) }
const notes = 'Un triangle a trois côtés.', proposal = { paragraphs: [{ text: 'Un triangle comporte trois côtés.', sourceQuote: notes }] }, generated = { proposal, modelId: 'local', adapterId: 'ollama' as const }
it('sends only explicit lesson preferences and authored notes, not scripts, solutions, media or history', () => { const p = fixture(), before = JSON.stringify(p), context = courseScriptContext(p, 'lesson', notes); expect(context).toMatchObject({ language: 'fr', lessonId: 'lesson', sourceNotes: notes }); expect(JSON.stringify(context)).not.toContain('PRIVATE'); expect(JSON.stringify(context)).not.toContain('OTHER SCRIPT'); expect(JSON.stringify(p)).toBe(before) })
it.each(['missing', ''])('rejects unavailable lesson %s', id => expect(() => courseScriptContext(fixture(), id, notes)).toThrow())
it.each(['wrong-model', 'wrong-adapter', 'quote', 'unknown-field'] as const)('refuses %s worker result', kind => { const result:any = structuredClone(generated); if(kind==='wrong-model')result.modelId='other';if(kind==='wrong-adapter')result.adapterId='cloud';if(kind==='quote')result.proposal.paragraphs[0].sourceQuote='fabricated';if(kind==='unknown-field')result.verified=true;expect(()=>parseCourseScriptResult(courseScriptContext(fixture(),'lesson',notes),result,'local')).toThrow() })
it('saves exactly one edited script with original/generated/accepted provenance and no media changes', () => {
 const p=fixture(),before=JSON.stringify(p),context=courseScriptContext(p,'lesson',notes),edited={paragraphs:[{...proposal.paragraphs[0],text:'Voici notre triangle à trois côtés.'}]},review=reviewCourseScript(p,context,generated,edited),snapshot=vi.fn(),persist=vi.fn()
 expect(JSON.stringify(p)).toBe(before);const next=commitCourseScript(p,review,true,{snapshot,persist});expect(snapshot).toHaveBeenCalledExactlyOnceWith(p);expect(persist).toHaveBeenCalledExactlyOnceWith(next)
 const course=projectCourse(next)!;expect(course.revision).toBe(2);expect(course.modules[0].lessons[0].script).toBe(edited.paragraphs[0].text);expect(course.modules[0].lessons[0].range).toEqual({inMs:1000,outMs:6000});expect(course.modules[0].lessons[1]).toEqual(projectCourse(p)!.modules[0].lessons[1]);expect(next.tracks).toEqual(p.tracks);expect(next.assets).toEqual(p.assets);expect(next.script).toBe(p.script)
 expect(projectCourseScriptRecords(next)[0]).toMatchObject({previousScript:'ORIGINAL PRIVATE SCRIPT',generated:proposal,accepted:edited,edited:true,modelId:'local'});expect(courseScriptReviewIsCurrent(p,review)).toBe(false);expect(()=>commitCourseScript(p,review,true,{snapshot,persist})).toThrow();expect(JSON.stringify(p)).toBe(before)
})
it('failed persistence retries one prepared project, revision and snapshot without generating again', () => {
 const p=fixture(),review=reviewCourseScript(p,courseScriptContext(p,'lesson',notes),generated,proposal),snapshot=vi.fn(),persist=vi.fn().mockImplementationOnce(()=>{throw Error('disk')}).mockImplementation(()=>{})
 expect(()=>commitCourseScript(p,review,true,{snapshot,persist})).toThrow('disk');const next=commitCourseScript(p,review,true,{snapshot,persist});expect(snapshot).toHaveBeenCalledTimes(1);expect(persist).toHaveBeenCalledTimes(2);expect(persist.mock.calls[0][0]).toBe(next);expect(projectCourse(next)!.revision).toBe(2);expect(projectCourseScriptRecords(next)).toHaveLength(1)
})
it.each(['project','dirty','record'] as const)('permanently invalidates observed %s A–B–A', kind => {
 const p=fixture(),review=reviewCourseScript(p,courseScriptContext(p,'lesson',notes),generated,proposal);if(kind==='record'){const original=review.record.modelId;review.record.modelId='forged';expect(courseScriptReviewIsCurrent(p,review)).toBe(false);review.record.modelId=original}else expect(courseScriptReviewIsCurrent(kind==='project'?{...p,title:'changed'}:p,review,kind==='dirty')).toBe(false)
 expect(courseScriptReviewIsCurrent(p,review)).toBe(false);expect(()=>commitCourseScript(p,review,true,{snapshot:vi.fn(),persist:vi.fn()})).toThrow()
})
it('requires acknowledgement and a non-forged unchanged review; quotes never enter narration', () => {
 const p=fixture(),review=reviewCourseScript(p,courseScriptContext(p,'lesson',notes),generated,proposal),deps={snapshot:vi.fn(),persist:vi.fn()};expect(()=>commitCourseScript(p,review,false,deps)).toThrow();expect(()=>commitCourseScript(p,{...review},true,deps)).toThrow();expect(courseScriptText(proposal)).toBe(proposal.paragraphs[0].text);expect(deps.snapshot).not.toHaveBeenCalled()
})
it('keeps latest per-lesson provenance with prior version recoverable and refuses a corrupt ledger', () => {
 const p=fixture(),deps={snapshot:vi.fn(),persist:vi.fn()},next=commitCourseScript(p,reviewCourseScript(p,courseScriptContext(p,'lesson',notes),generated,proposal),true,deps),again=commitCourseScript(next,reviewCourseScript(next,courseScriptContext(next,'lesson',notes),generated,proposal),true,deps);expect(projectCourseScriptRecords(again)).toHaveLength(1);expect(projectCourseScriptRecords(again)[0].previousScript).toBe(proposal.paragraphs[0].text);expect(deps.snapshot.mock.calls[1][0]).toBe(next)
 const corrupt={...next,metadata:{...next.metadata,courseScriptDrafts:{}}};expect(()=>projectCourseScriptRecords(corrupt)).toThrow();expect(()=>reviewCourseScript(corrupt,courseScriptContext(corrupt,'lesson',notes),generated,proposal)).toThrow()
})
it('rejects wrong project provenance, duplicate records and fabricated edit/source metadata', () => {
 const p=fixture(),next=commitCourseScript(p,reviewCourseScript(p,courseScriptContext(p,'lesson',notes),generated,proposal),true,{snapshot:()=>{},persist:()=>{}})
 for(const change of [(record:any)=>{record.projectId='other'},(record:any)=>{record.edited=true},(record:any)=>{record.accepted.paragraphs[0].sourceQuote='made up'}]){const copy=structuredClone(next);change((copy.metadata.courseScriptDrafts as any).records[0]);expect(()=>projectCourseScriptRecords(copy)).toThrow()}
 const copy=structuredClone(next);(copy.metadata.courseScriptDrafts as any).records.push((copy.metadata.courseScriptDrafts as any).records[0]);expect(()=>projectCourseScriptRecords(copy)).toThrow()
})
it.each(['de','en','fr'] as const)('renders %s explicit local-only UI without requests or writes', language => {
 const p=fixture(),write=vi.fn(),fetch=vi.spyOn(globalThis,'fetch');try{const html=renderToStaticMarkup(createElement(UiLanguageProvider,{initialLanguage:language,children:createElement(CourseScriptDraftPanel,{project:p,lessonId:'lesson',dirty:false,history:new PersistentVersionHistory({getItem:()=>null,setItem:write,removeItem:write}),onProjectChange:write,onSaved:write,workerUrl:'http://127.0.0.1:43117',workerToken:'SECRET',workerConnected:true,workerCapabilities:['course-script']})}));expect(html).toContain(translateUi(language,'course.scriptDraft.heading'));expect(html).not.toContain('SECRET');for(const key of Object.keys(uiCourseScriptDraftMessages) as Array<keyof typeof uiCourseScriptDraftMessages>)expect(translateUi(language,key)).not.toBe(key);expect(write).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled()}finally{fetch.mockRestore()}
})
it('uses only the authenticated local course-script route', async()=>{const fetchImpl=vi.fn(async()=>new Response(JSON.stringify({ok:true,type:'course-script',result:generated}))),client=new WorkerClient({baseUrl:'http://127.0.0.1:43117',token:'test-only',fetchImpl}),context=courseScriptContext(fixture(),'lesson',notes);expect(await client.generateCourseScript('local',context)).toEqual(generated);expect(fetchImpl).toHaveBeenCalledWith('http://127.0.0.1:43117/course/script/generate',expect.objectContaining({method:'POST',headers:expect.objectContaining({authorization:'Bearer test-only'}),body:JSON.stringify({model:'local',context})}))})
it('refuses oversized provenance without silently dropping older lesson records',()=>{
 const p=fixture(),next=commitCourseScript(p,reviewCourseScript(p,courseScriptContext(p,'lesson',notes),generated,proposal),true,{snapshot:()=>{},persist:()=>{}}),record=projectCourseScriptRecords(next)[0]
 record.context.sourceNotes=notes.repeat(400);record.generated={paragraphs:Array.from({length:12},()=>({text:'x'.repeat(1500),sourceQuote:notes}))};record.accepted=structuredClone(record.generated)
 const records=Array.from({length:100},(_,i)=>({...record,context:{...record.context,lessonId:`lesson-${i}`}})),oversized={...p,metadata:{...p.metadata,courseScriptDrafts:{schemaVersion:1,records}}}
 expect(()=>projectCourseScriptRecords(oversized)).toThrow('4,000,000 bytes')
})
it('shows distinct previous, original model and accepted historical text after later manual edits',()=>{
 const p=fixture(),accepted={paragraphs:[{...proposal.paragraphs[0],text:'ACCEPTED EDIT'}]},next=commitCourseScript(p,reviewCourseScript(p,courseScriptContext(p,'lesson',notes),generated,accepted),true,{snapshot:()=>{},persist:()=>{}}),course=projectCourse(next)!
 const changed=saveCourseOutline(next,{...course,modules:course.modules.map(m=>({...m,lessons:m.lessons.map(l=>l.id==='lesson'?{...l,script:'LATER MANUAL SCRIPT'}:l)}))})
 const html=renderToStaticMarkup(createElement(CourseScriptDraftPanel,{project:changed,lessonId:'lesson',dirty:false,history:new PersistentVersionHistory({getItem:()=>null,setItem:()=>{},removeItem:()=>{}}),onProjectChange:()=>{},onSaved:()=>{}}))
 expect(html).toContain('Original model proposal');expect(html).toContain('Text explicitly accepted at that time');expect(html).toContain('ACCEPTED EDIT');expect(html).toContain('ORIGINAL PRIVATE SCRIPT');expect(html).toContain(proposal.paragraphs[0].text);expect(html).toContain('Historical record')
})
