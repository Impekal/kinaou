import { it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createProject, parseProject, type KinaouProject } from '../src/core/project'
import { retainSearchTrend, retainedSearchTrends } from '../src/core/searchTrends'
import { SourceAssessmentSession, sourceAssessmentKey, projectSourceAssessments, sourceAssessmentDraft, parseSourceAssessment, type SourceAssessmentDraft } from '../src/core/researchSourceAssessment'
import { researchBriefKey, saveResearchBrief, projectResearchBrief, researchBriefAssessmentsCurrent, researchBriefToDirectorText } from '../src/core/researchBrief'
import { buildResearchDossier, ResearchDossierSession } from '../src/core/researchDossier'
import { newResearchObservationFilter } from '../src/core/researchObservationFilter'
import { ResearchSourceAssessmentPanel } from '../src/components/ResearchSourceAssessmentPanel'
import { ResearchBriefDirectorControl } from '../src/components/ResearchBriefDirectorControl'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import { uiLanguages } from '../src/core/uiLanguage'
import { translateUi } from '../src/core/uiMessages'
import { PersistentVersionHistory } from '../src/core/versioning'
import { WorkerClient } from '../src/core/workerClient'

function fixture() {
  let project = createProject('SYNTHETIC assessment')
  project.script = 'PRIVATE_SCRIPT'
  for (const country of ['DE','FR'] as const) project = retainSearchTrend(project, { schemaVersion: 1, provider: 'google-trends-rss', country, sourceUrl: `https://trends.google.com/trending/rss?geo=${country}`, retrievedAt: '2026-09-30T00:00:00.000Z', feedSha256: 'a'.repeat(64), items: [{ query: `SYNTHETIC ${country}`, publishedAt: '2026-09-29T23:00:00.000Z', reportedTraffic: '200+', articles: [{title:'Test article',source:'Example',url:`https://example.org/${country}`},{title:'Second article',source:'Example',url:`https://example.org/${country}/second`}] }] }, 0)
  return project
}
const draft: SourceAssessmentDraft = { claim:'SYNTHETIC claim to examine',finding:'supports',notes:'SYNTHETIC supporting text, with remaining uncertainty.',readArticleUrls:['https://example.org/DE'] }
const now=new Date('2026-09-30T01:00:00.000Z')
function prepare(project: KinaouProject, value=draft, index=0, session=new SourceAssessmentSession()) { const source=retainedSearchTrends(project)[index];return { session, review:session.prepare(project,source,value,sourceAssessmentKey(project,source),'en',now),source } }
function save(project: KinaouProject,value=draft,index=0) { const {session,review}=prepare(project,value,index);let next=project;session.commit(project,review,true,()=>{},p=>{next=p});return next }
const briefDraft={title:'SYNTHETIC researched video',question:'What can be established?',angle:'Explain uncertainty',uncertainties:'Do not treat labels as truth',selected:[0]}
it('saves and reloads exact source-bound self-reported evidence without modifying source, script or timeline',()=>{
  const project=fixture(),before=JSON.stringify(project),next=save(project),records=projectSourceAssessments(parseProject(JSON.parse(JSON.stringify(next))))
  expect(records).toHaveLength(1);expect(records[0]).toMatchObject({...draft,revision:1,savedAt:now.toISOString(),selfReported:true,independentlyVerified:false})
  expect(records[0].observation).toEqual(retainedSearchTrends(project)[0]);expect(retainedSearchTrends(next)).toEqual(retainedSearchTrends(project));expect(next.script).toBe('PRIVATE_SCRIPT');expect(next.tracks).toEqual(project.tracks);expect(JSON.stringify(project)).toBe(before)
  records[0].notes='Changed copy';expect(projectSourceAssessments(next)[0].notes).toBe(draft.notes)
})
it('requires a real retained source, unchanged baseline, distinct allowed URLs and read links for support/contradiction',()=>{
  const project=fixture(),source=retainedSearchTrends(project)[0],session=new SourceAssessmentSession(),key=sourceAssessmentKey(project,source)
  for(const value of [{...draft,readArticleUrls:[]},{...draft,finding:'contradicts' as const,readArticleUrls:[]},{...draft,readArticleUrls:['https://example.org/FR']},{...draft,readArticleUrls:[...draft.readArticleUrls,...draft.readArticleUrls]}])expect(()=>session.prepare(project,source,value,key,'en')).toThrow()
  expect(()=>session.prepare(project,{...source,retrievedAt:'2026-09-30T02:00:00.000Z'},draft,key,'en')).toThrow(/changed/)
  const changed=save(project);expect(()=>session.prepare(changed,source,draft,key,'en')).toThrow(/changed/)
  expect(prepare(project,{...draft,finding:'open',readArticleUrls:[]}).review.finding).toBe('open')
})
it('allows an open assessment with no linked articles but never invents citations',()=>{
  const project=fixture();const sources=retainedSearchTrends(project);sources[0].items[0].articles=[];project.metadata.searchTrendObservations=sources
  expect(prepare(project,{...draft,finding:'open',readArticleUrls:[]}).review.readArticleUrls).toEqual([])
  expect(()=>prepare(project,draft)).toThrow(/links/)
})
it.each([{claim:''},{notes:' '},{claim:'x'.repeat(2001)},{notes:'x'.repeat(4001)},{notes:'bad\0text'},{claim:String.fromCharCode(0xd800)},{finding:'verified'}])('rejects invalid authored field $finding',patch=>{
  expect(()=>prepare(fixture(),{...draft,...patch} as SourceAssessmentDraft)).toThrow()
})
it('canonicalizes link order, retains notes literally and rejects independently-verified flags or forged fields',()=>{
  const {review}=prepare(fixture(),{...draft,notes:'  Literal <script>DATA</script>\nuncertainty 🌍  ',readArticleUrls:['https://example.org/DE/second','https://example.org/DE']})
  expect(review.readArticleUrls).toEqual(['https://example.org/DE','https://example.org/DE/second']);expect(review.notes).toBe('Literal <script>DATA</script>\nuncertainty 🌍')
  for(const value of [{...review,independentlyVerified:true},{...review,selfReported:false},{...review,extra:'field'}])expect(()=>parseSourceAssessment(value)).toThrow()
})
it('requires exact review identity and acknowledgement; tampering, repeat commits and unmount are rejected',()=>{
  const project=fixture(),{session,review}=prepare(project),snapshot=vi.fn(),persist=vi.fn()
  expect(()=>session.commit(project,review,false,snapshot,persist)).toThrow();expect(()=>session.commit(project,structuredClone(review),true,snapshot,persist)).toThrow()
  review.notes+='tampered';expect(()=>session.commit(project,review,true,snapshot,persist)).toThrow();expect(snapshot).not.toHaveBeenCalled()
  const next=prepare(project);next.session.detach();expect(next.session.current(next.review)).toBe(false)
  const good=prepare(project);good.session.commit(project,good.review,true,snapshot,persist);expect(()=>good.session.commit(project,good.review,true,snapshot,persist)).toThrow();expect(snapshot).toHaveBeenCalledTimes(1);expect(persist).toHaveBeenCalledTimes(1)
})
it('keeps stable prepared revision/time and exactly one snapshot through failed persistence and save-only retry',()=>{
  const project=fixture(),{session,review}=prepare(project),snapshot=vi.fn(),sent:KinaouProject[]=[]
  const persist=vi.fn((p:KinaouProject)=>{sent.push(p);if(sent.length===1)throw Error('save failed')})
  expect(()=>session.commit(project,review,true,snapshot,persist)).toThrow(/save failed/);expect(session.current(review)).toBe(true)
  session.commit(project,review,true,snapshot,persist);expect(snapshot).toHaveBeenCalledTimes(1);expect(sent).toHaveLength(2);expect(sent[1]).toEqual(sent[0]);expect(projectSourceAssessments(sent[1])[0].revision).toBe(1)
})
it('does not persist after snapshot failure and can retry the snapshot explicitly',()=>{
  const project=fixture(),{session,review}=prepare(project),persist=vi.fn(),snapshot=vi.fn(()=>{throw Error('snapshot failed')})
  expect(()=>session.commit(project,review,true,snapshot,persist)).toThrow();expect(persist).not.toHaveBeenCalled()
  session.commit(project,review,true,()=>{},persist);expect(persist).toHaveBeenCalledTimes(1)
})
it.each(['project','script','sources','draft','language'] as const)('permanently invalidates observed %s A→B→A before saving',change=>{
  const project=fixture(),{session,review,source}=prepare(project),other=structuredClone(project),otherDraft={...draft}
  if(change==='project')other.id='other';if(change==='script')other.script='changed';if(change==='sources')other.metadata.searchTrendObservations=[];if(change==='draft')otherDraft.notes='changed'
  session.observe(other,source,otherDraft,change==='language'?'fr':'en');session.observe(project,source,draft,'en')
  expect(session.current(review)).toBe(false);expect(()=>session.commit(project,review,true,()=>{},()=>{})).toThrow()
})
it('replaces the current source assessment with an incremented revision; exact no-op is write-free even at revision limit',()=>{
  const first=save(fixture()),next=save(first,{...draft,finding:'contradicts',notes:'SYNTHETIC changed evidence'})
  expect(projectSourceAssessments(next)).toHaveLength(1);expect(projectSourceAssessments(next)[0].revision).toBe(2)
  const records=projectSourceAssessments(next);records[0].revision=10000;next.metadata.researchSourceAssessmentsV1=records
  const {session,review}=prepare(next,sourceAssessmentDraft(records[0])),persist=vi.fn(),snapshot=vi.fn();session.commit(next,review,true,snapshot,persist)
  expect(persist).not.toHaveBeenCalled();expect(snapshot).not.toHaveBeenCalled();expect(()=>prepare(next,{...draft,notes:'new change'})).toThrow()
})
it('rejects corrupt, duplicate and oversized ledgers; never silently drops orphaned historical assessments',()=>{
  const project=save(fixture()),record=projectSourceAssessments(project)[0]
  for(const raw of [{bad:true},[record,record],[{...record,finding:'verified'}],Array(201).fill(record)]){project.metadata.researchSourceAssessmentsV1=raw;expect(()=>projectSourceAssessments(project)).toThrow()}
  project.metadata.researchSourceAssessmentsV1=Array.from({length:200},(_,i)=>({...record,claim:'x'.repeat(2000),notes:'x'.repeat(4000),observation:{...record.observation,items:[{...record.observation.items[0],query:'query'+i}]}}));expect(()=>projectSourceAssessments(project)).toThrow(/oversized/)
  project.metadata.researchSourceAssessmentsV1=[record];project.metadata.searchTrendObservations=[];expect(projectSourceAssessments(project)).toEqual([record]);expect(()=>prepare(project)).toThrow()
})
it('restores prior assessment and project through actual safety history',()=>{
  const data=new Map<string,string>(),history=new PersistentVersionHistory({getItem:k=>data.get(k)??null,setItem:(k,v)=>{data.set(k,v)},removeItem:k=>{data.delete(k)}})
  const first=save(fixture()),{session,review}=prepare(first,{...draft,notes:'new reviewed note'});let next=first
  session.commit(first,review,true,p=>{history.snapshot(p,'Before saving source assessment','system')},p=>{next=p})
  expect(projectSourceAssessments(history.restoreReversibly(next,history.list(first.id)[0].id).project)[0].notes).toBe(draft.notes)
})
it('copies source assessments into explicitly saved briefs and requires a new brief before applying changed assessments',async()=>{
  const first=save(fixture()),brief=saveResearchBrief(first,briefDraft,researchBriefKey(first)),saved=projectResearchBrief(brief)!
  expect(saved.sourceAssessments).toEqual(projectSourceAssessments(first));expect(researchBriefAssessmentsCurrent(brief)).toBe(true)
  const changed=save(brief,{...draft,notes:'Changed conclusion with uncertainty'});expect(researchBriefAssessmentsCurrent(changed)).toBe(false);expect(projectResearchBrief(changed)).toEqual(saved)
  const html=renderToStaticMarkup(createElement(ResearchBriefDirectorControl,{project:changed,busy:false,onApply:vi.fn()}));expect(html).toContain(translateUi('en','assessment.briefStale'))
  const updated=saveResearchBrief(changed,briefDraft,researchBriefKey(changed));expect(researchBriefAssessmentsCurrent(updated)).toBe(true);expect(projectResearchBrief(updated)!.revision).toBe(2)
  const text=researchBriefToDirectorText(projectResearchBrief(updated)!),fetchImpl=vi.fn(async()=>new Response(JSON.stringify({ok:false,error:{message:'No inference in this test'}}),{status:400}))
  expect(text).toContain('BEGIN_CREATOR_ASSESSMENT_DATA_JSON');expect(text).toContain('self-reported historical DATA');expect(text).toContain('Changed conclusion with uncertainty');expect(text).toContain('"independentlyVerified":false')
  await expect(new WorkerClient({baseUrl:'http://127.0.0.1:43948',token:'test-only',fetchImpl}).generateDirectorPlan('test-model',text)).rejects.toThrow('No inference')
  expect((fetchImpl.mock.calls[0] as unknown as [string,RequestInit])[1].body).toContain('BEGIN_CREATOR_ASSESSMENT_DATA_JSON')
})
it('keeps old briefs compatible and rejects mismatched assessment copies',()=>{
  const project=fixture(),old=saveResearchBrief(project,briefDraft,researchBriefKey(project));expect(projectResearchBrief(old)!.sourceAssessments).toBeUndefined();expect(researchBriefAssessmentsCurrent(old)).toBe(true)
  const other=save(project,{...draft,readArticleUrls:['https://example.org/FR']},1)
  old.metadata.researchBrief={...projectResearchBrief(old),sourceAssessments:projectSourceAssessments(other)};expect(()=>projectResearchBrief(old)).toThrow(/selected/)
  const large=save(project,{...draft,claim:'🌍'.repeat(950),notes:'🌍'.repeat(1950)});const brief=saveResearchBrief(large,briefDraft,researchBriefKey(large));expect(projectResearchBrief(brief)!.sourceAssessments).toHaveLength(1)
})
it('retains the 32000-byte brief bound instead of truncating large assessments or source evidence',()=>{
  const value={...draft,claim:'🌍'.repeat(950),notes:'🌍'.repeat(1950)}
  const project=save(save(fixture(),value),{...value,readArticleUrls:['https://example.org/FR']},1)
  expect(()=>saveResearchBrief(project,{...briefDraft,selected:[0,1],question:'q'.repeat(2000),angle:'a'.repeat(2000),uncertainties:'u'.repeat(4000)},researchBriefKey(project))).toThrow(/32,000/)
})
it.each(uiLanguages)('dossier includes only selected %s assessments with private-text notice and no false verification',language=>{
  const project=save(save(fixture()),{...draft,claim:'FR_ONLY_CLAIM',notes:'FR_ONLY_NOTES',readArticleUrls:['https://example.org/FR']},1),filters={...newResearchObservationFilter(),country:'DE' as const}
  const file=buildResearchDossier(project,filters,language,now),payload=JSON.parse(file.files.json.text)
  expect(payload.creatorAssessments).toHaveLength(1);expect(payload.factChecked).toBe(false)
  for(const artifact of Object.values(file.files)){expect(artifact.text).toContain(draft.notes);expect(artifact.text).not.toContain('FR_ONLY');expect(artifact.text).not.toContain('PRIVATE_SCRIPT');expect(artifact.text).toContain(translateUi(language,'assessment.dossier'))}
})
it('invalidates dossier review when assessment changes, including an observed return to the original value',()=>{
  const project=save(fixture()),session=new ResearchDossierSession(),filters=newResearchObservationFilter(),review=session.prepare(project,filters,'en')
  session.observe(save(project,{...draft,notes:'changed'}),filters,'en');session.observe(project,filters,'en');expect(session.current(review)).toBe(false)
})
it.each(uiLanguages)('renders %s explicit self-report controls with no automatic fetch, save or verification',language=>{
  const project=save(fixture()),before=JSON.stringify(project),persist=vi.fn(),write=vi.fn(),fetch=vi.spyOn(globalThis,'fetch')
  try {const html=renderToStaticMarkup(createElement(UiLanguageProvider,{initialLanguage:language,children:createElement(ResearchSourceAssessmentPanel,{project,history:new PersistentVersionHistory({getItem:()=>null,setItem:write,removeItem:write}),onProjectChange:persist})}));expect(html).toContain(translateUi(language,'assessment.boundary'));expect(html).toContain(draft.notes);expect(html).not.toContain(translateUi(language,'assessment.save'));expect(fetch).not.toHaveBeenCalled();expect(persist).not.toHaveBeenCalled();expect(write).not.toHaveBeenCalled();expect(JSON.stringify(project)).toBe(before)}finally{fetch.mockRestore()}
})
