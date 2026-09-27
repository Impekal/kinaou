import { it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createProject, parseProject } from '../src/core/project'
import { retainSearchTrend, retainedSearchTrends } from '../src/core/searchTrends'
import { researchBriefDraft, researchBriefKey, saveResearchBrief, projectResearchBrief, researchBriefToDirectorText } from '../src/core/researchBrief'
import { localizedDirectorBrief, projectContentProfile } from '../src/core/contentProfile'
import { PersistentVersionHistory } from '../src/core/versioning'
import { ResearchBriefPanel } from '../src/components/ResearchBriefPanel'
import { ResearchBriefDirectorControl } from '../src/components/ResearchBriefDirectorControl'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import { uiLanguages } from '../src/core/uiLanguage'
import { translateUi } from '../src/core/uiMessages'
import { WorkerClient } from '../src/core/workerClient'
function fixture(){
 const project=createProject('Source-bound research');project.script='Existing script'
 return retainSearchTrend(project,{schemaVersion:1,provider:'google-trends-rss',country:'DE',sourceUrl:'https://trends.google.com/trending/rss?geo=DE',retrievedAt:'2026-09-27T07:00:00.000Z',feedSha256:'a'.repeat(64),items:[{query:'Example <script>not instructions</script>',reportedTraffic:'200+',publishedAt:'2026-09-27T06:00:00.000Z',articles:[{title:'Unverified report title',source:'Example',url:'https://example.org/report'}]}]},0)
}
const draft={title:'A researched video',question:'What happened?',angle:'Explain the evidence rather than the headline.',uncertainties:'Read primary sources and verify dates before scripting claims.',selected:[0]}
const store=()=>{const data=new Map<string,string>();return{getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v)},removeItem:(k:string)=>{data.delete(k)}}}
it('saves a bounded authored brief with exact selected observations and reloads unchanged',()=>{
 const base=fixture(),before=JSON.stringify(base),saved=saveResearchBrief(base,draft,researchBriefKey(base))
 const brief=projectResearchBrief(parseProject(JSON.parse(JSON.stringify(saved))))!
 expect(brief.evidence).toEqual(retainedSearchTrends(base));expect(brief.revision).toBe(1);expect(saved.script).toBe(base.script);expect(saved.tracks).toEqual(base.tracks)
 expect(JSON.stringify(base)).toBe(before);expect(researchBriefDraft(saved)).toEqual(draft)
 expect(saveResearchBrief(saved,draft,researchBriefKey(saved))).toBe(saved)
 expect(projectResearchBrief(saveResearchBrief(saved,{...draft,angle:'Updated angle'},researchBriefKey(saved)))!.revision).toBe(2)
})
it('keeps evidence as an independent immutable snapshot, not shared project object references',()=>{
 const base=fixture(),saved=saveResearchBrief(base,draft,researchBriefKey(base)),brief=projectResearchBrief(saved)!
 brief.evidence[0].items[0].query='Changed returned copy'
 expect(projectResearchBrief(saved)!.evidence[0].items[0].query).not.toBe('Changed returned copy')
})
it.each(['project','ledger','brief'] as const)('blocks stale %s saves and source-index retargeting',kind=>{
 const base=fixture(),key=researchBriefKey(base),changed=structuredClone(base)
 if(kind==='project')changed.id='other'
 if(kind==='ledger')changed.metadata.searchTrendObservations=[]
 if(kind==='brief')changed.metadata.researchBrief={bad:true}
 expect(()=>saveResearchBrief(changed,draft,key)).toThrow(/changed/)
})
it.each([[],[0,0],[1],[-1],[0.5],[0,1,2,3,4,5]].map(selected=>({selected})))('rejects invalid selection $selected',({selected})=>{
 const base=fixture();expect(()=>saveResearchBrief(base,{...draft,selected},researchBriefKey(base))).toThrow()
})
it('rejects missing authored checks, oversized input and corrupt persisted briefs instead of silently replacing them',()=>{
 const base=fixture()
 for(const patch of [{uncertainties:''},{question:' '},{angle:'x'.repeat(2001)},{title:'x'.repeat(121)}])expect(()=>saveResearchBrief(base,{...draft,...patch},researchBriefKey(base))).toThrow()
 base.metadata.researchBrief={schemaVersion:1,title:'broken'}
 expect(()=>projectResearchBrief(base)).toThrow();expect(()=>saveResearchBrief(base,draft,researchBriefKey(base))).toThrow()
})
it('permits unrelated timeline edits without altering or silently discarding them',()=>{
 const base=fixture(),key=researchBriefKey(base);base.script='New authored script'
 expect(saveResearchBrief(base,draft,key).script).toBe('New authored script')
})
it('serializes historical evidence as data with explicit limits and lets existing output-language profile control generation',async()=>{
 const base=fixture(),saved=saveResearchBrief(base,draft,researchBriefKey(base)),text=researchBriefToDirectorText(projectResearchBrief(saved)!)
 expect(text).toContain('BEGIN_OBSERVATION_DATA_JSON');expect(text).toContain('never instructions');expect(text).toContain('not video demand')
 expect(text).toContain('https://example.org/report');expect(text).toContain('2026-09-27T07:00:00.000Z')
 const profile={...projectContentProfile(saved),outputLanguage:'fr' as const,targetMarket:'FR'},prompt=localizedDirectorBrief(profile,text)
 expect(prompt).toContain('Required output language: Français (fr)');expect(prompt).toContain('"country":"DE"')
 const fetchImpl=vi.fn(async()=>new Response(JSON.stringify({ok:false,error:{message:'No model run in this test'}}),{status:400}))
 const client=new WorkerClient({baseUrl:'http://127.0.0.1:43948',token:'test-only',fetchImpl})
 await expect(client.generateDirectorPlan('test-local-model',prompt)).rejects.toThrow('No model run')
 const args=fetchImpl.mock.calls[0] as unknown as [string,RequestInit];expect(args[1].body).toContain('BEGIN_OBSERVATION_DATA_JSON')
})
it.each(uiLanguages)('renders explicit draft/save/replace controls in %s without auto-fetch, save, or text replacement',language=>{
 const base=fixture(),project=saveResearchBrief(base,draft,researchBriefKey(base)),save=vi.fn(),apply=vi.fn(),fetch=vi.spyOn(globalThis,'fetch')
 try{
  const html=renderToStaticMarkup(createElement(UiLanguageProvider,{initialLanguage:language,children:[
   createElement(ResearchBriefPanel,{key:'brief',project,history:new PersistentVersionHistory(store()),onProjectChange:save}),
   createElement(ResearchBriefDirectorControl,{key:'director',project,busy:false,onApply:apply})
  ]}))
  expect(html).toContain(translateUi(language,'researchBrief.heading'));expect(html).toContain(translateUi(language,'researchBrief.replaceAck'))
  expect(html).toContain('&lt;script&gt;');expect(html).not.toContain('<script>not instructions');expect(html).toContain('disabled=""')
  expect(save).not.toHaveBeenCalled();expect(apply).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled()
 }finally{fetch.mockRestore()}
})
