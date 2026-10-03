import { it,expect,vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { sourceExcerptFromRead,sourceExcerptSchema,SourceExcerptSession } from '../src/core/sourceExcerpt'
import { appendSourceExcerpt,newSourceAssessmentDraft,parseSourceAssessment,projectSourceAssessments,sourceAssessmentDraft,sourceAssessmentKey,SourceAssessmentSession } from '../src/core/researchSourceAssessment'
import { createProject,parseProject } from '../src/core/project'
import { retainSearchTrend,retainedSearchTrends } from '../src/core/searchTrends'
import { PersistentVersionHistory } from '../src/core/versioning'
import { researchBriefKey,saveResearchBrief,projectResearchBrief,researchBriefAssessmentsCurrent,researchBriefToDirectorText } from '../src/core/researchBrief'
import { buildResearchDossier,ResearchDossierSession } from '../src/core/researchDossier'
import { newResearchObservationFilter } from '../src/core/researchObservationFilter'
import { SourceExcerptList,SourceExcerptControl } from '../src/components/SourceExcerptControl'
import { ResearchSourceAssessmentPanel } from '../src/components/ResearchSourceAssessmentPanel'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import { uiSourceExcerptMessages } from '../src/core/uiSourceExcerptMessages'
import { translateUi } from '../src/core/uiMessages'
import type { PublicSourceResult } from '../worker/public-source-protocol.mjs'
const url='https://example.org/article#section',result:PublicSourceResult={schemaVersion:1,requestedUrl:'https://example.org/article',finalUrl:'https://news.example.org/new',redirectUrls:['https://news.example.org/new'],retrievedAt:'2026-10-03T14:00:00.000Z',htmlSha256:'a'.repeat(64),htmlBytes:200,title:'Synthetic source',declaredLanguage:'fr',extraction:'article',text:'PRIVATE_UNSELECTED_ARTICLE. Un triangle a trois côtés. Other context. Un triangle a trois côtés.',truncated:true,verified:false}
const quotation='Un triangle a trois côtés.',excerpt=()=>sourceExcerptFromRead(result,url,quotation)
function fixture(){const p=createProject('Excerpt test');p.script='PRIVATE_PROJECT_SCRIPT';return retainSearchTrend(p,{schemaVersion:1,provider:'google-trends-rss',country:'DE',sourceUrl:'https://trends.google.com/trending/rss?geo=DE',retrievedAt:result.retrievedAt,feedSha256:'b'.repeat(64),items:[{query:'SYNTHETIC observation',publishedAt:result.retrievedAt,reportedTraffic:null,articles:[{title:'Synthetic article',source:'Example',url}]}]},0)}
function draft(){return {claim:'SYNTHETIC claim',finding:'open' as const,notes:'Needs independent checks',readArticleUrls:[],excerpts:[excerpt()]}}
function save(p=fixture(),d=draft()){const source=retainedSearchTrends(p)[0],session=new SourceAssessmentSession(),review=session.prepare(p,source,d,sourceAssessmentKey(p,source),'en');let next=p;session.commit(p,review,true,()=>{},value=>{next=value});return next}
it('captures only exact selected text, first occurrence offsets and unmodified provenance, excluding full article',()=>{
 const e=excerpt();expect(e.quote).toBe(quotation);expect(e.startCharacter).toBe(result.text.indexOf(quotation));expect(e.endCharacter-e.startCharacter).toBe(quotation.length);expect(e.originalUrl).toBe(url);expect(e.source.finalUrl).toBe(result.finalUrl);expect(e.source.redirectUrls).toEqual(result.redirectUrls);expect(e.displayTruncated).toBe(true);expect(e.source.verified).toBe(false)
 expect(JSON.stringify(e)).not.toContain('PRIVATE_UNSELECTED_ARTICLE');expect(e.source).not.toHaveProperty('text');e.source.title='mutated copy';expect(result.title).toBe('Synthetic source')
})
it.each(['','Paraphrase','un triangle a trois côtés.',quotation+' ', 'x'.repeat(601),String.fromCharCode(0xd800)])('rejects nonexact/blank/oversized/invalid excerpt %s',value=>expect(()=>sourceExcerptFromRead(result,url,value)).toThrow())
it('strictly validates provenance, offsets, current requested source and unsupported invented fields',()=>{
 for(const patch of [{endCharacter:1},{startCharacter:-1},{endCharacter:30001},{approved:true},{originalUrl:'https://other.example.org/a'},{source:{...excerpt().source,verified:true}},{source:{...excerpt().source,redirectUrls:[]}}])expect(()=>sourceExcerptSchema.parse({...excerpt(),...patch})).toThrow()
 expect(()=>sourceExcerptFromRead(result,'https://other.example.org',quotation)).toThrow()
})
it('appends to an unsaved draft without read acknowledgements, rejects duplicates/foreign links and caps five',()=>{
 const source=retainedSearchTrends(fixture())[0],original=newSourceAssessmentDraft(),next=appendSourceExcerpt(source,original,excerpt());expect(original).not.toHaveProperty('excerpts');expect(next.readArticleUrls).toEqual([]);expect(next.finding).toBe('open');expect(next.notes).toBe('');expect(next.excerpts).toHaveLength(1)
 expect(()=>appendSourceExcerpt(source,next,excerpt())).toThrow(/distinct/)
 expect(()=>appendSourceExcerpt({...source,items:[{...source.items[0],articles:[]}]},original,excerpt())).toThrow(/exact observation/)
 let many=original;for(let i=0;i<5;i++)many=appendSourceExcerpt(source,many,sourceExcerptFromRead({...result,text:'Quote '+i},url,'Quote '+i))
 expect(()=>appendSourceExcerpt(source,many,excerpt())).toThrow();expect(many.excerpts).toHaveLength(5)
})
it('requires genuine unchanged excerpt review and acknowledgement; failed draft append can retry without network',()=>{
 const s=new SourceExcerptSession(),review=s.prepare('scope',result,url,quotation,'en'),append=vi.fn();expect(()=>s.commit(review,false,append)).toThrow();expect(()=>s.commit(structuredClone(review),true,append)).toThrow();expect(append).not.toHaveBeenCalled()
 expect(()=>s.commit(review,true,()=>{throw Error('draft full')})).toThrow('draft full');expect(s.current(review)).toBe(true);s.commit(review,true,append);expect(append).toHaveBeenCalledWith(excerpt());expect(()=>s.commit(review,true,append)).toThrow()
 const second=s.prepare('scope',result,url,quotation,'en');second.quote='tampered';expect(s.current(second)).toBe(false)
})
it.each(['scope','text','quote','language','url','unmount'])('permanently invalidates excerpt review after observed %s A-B-A',kind=>{
 const s=new SourceExcerptSession(),review=s.prepare('scope',result,url,quotation,'en')
 if(kind==='unmount')s.detach();else s.observe(kind==='scope'?'other':'scope',kind==='text'?{...result,text:'changed'}:result,kind==='url'?'https://other.example.org':url,kind==='quote'?'changed':quotation,kind==='language'?'fr':'en')
 s.observe('scope',result,url,quotation,'en');expect(s.current(review)).toBe(false);expect(()=>s.commit(review,true,()=>{})).toThrow()
})
it('keeps legacy assessments readable without invented excerpts; quoted finding still requires manual read acknowledgement',()=>{
 const p=save(),record=projectSourceAssessments(p)[0],{excerpts: _excerpts,...legacy}=record;expect(parseSourceAssessment(legacy)).not.toHaveProperty('excerpts');expect(sourceAssessmentDraft(legacy)).not.toHaveProperty('excerpts');expect(parseSourceAssessment(record).excerpts).toEqual([excerpt()]);expect(()=>parseSourceAssessment({...record,finding:'supports'})).toThrow(/actually read/)
 const restored=parseProject(JSON.parse(JSON.stringify(p)));expect(projectSourceAssessments(restored)[0].excerpts).toEqual([excerpt()])
})
it('saves one reviewed assessment with stable excerpt provenance, one safety snapshot and save-only retry',()=>{
 const p=fixture(),source=retainedSearchTrends(p)[0],session=new SourceAssessmentSession(),review=session.prepare(p,source,draft(),sourceAssessmentKey(p,source),'en'),snapshot=vi.fn(),sent:unknown[]=[],persist=vi.fn(next=>{sent.push(next);if(sent.length===1)throw Error('save failed')})
 expect(()=>session.commit(p,review,true,snapshot,persist)).toThrow('save failed');session.commit(p,review,true,snapshot,persist);expect(snapshot).toHaveBeenCalledTimes(1);expect(sent[1]).toEqual(sent[0]);expect(projectSourceAssessments(sent[1] as ReturnType<typeof fixture>)[0].excerpts).toEqual([excerpt()]);expect(p.script).toBe('PRIVATE_PROJECT_SCRIPT')
})
it('explicit removal stays draft-only until reviewed save, invalidates prior review and is recoverable in real history',()=>{
 const p=save(),source=retainedSearchTrends(p)[0],s=new SourceAssessmentSession(),d=sourceAssessmentDraft(projectSourceAssessments(p)[0]),review=s.prepare(p,source,d,sourceAssessmentKey(p,source),'en'),removed={...d,excerpts:[]};s.observe(p,source,removed,'en');s.observe(p,source,d,'en');expect(s.current(review)).toBe(false)
 const data=new Map<string,string>(),history=new PersistentVersionHistory({getItem:k=>data.get(k)??null,setItem:(k,v)=>{data.set(k,v)},removeItem:k=>{data.delete(k)}}),nextReview=s.prepare(p,source,removed,sourceAssessmentKey(p,source),'en');let next=p
 s.commit(p,nextReview,true,p=>{history.snapshot(p,'Before excerpt removal','system')},value=>{next=value});expect(projectSourceAssessments(next)[0].excerpts).toEqual([]);expect(projectSourceAssessments(history.restoreReversibly(next,history.list(p.id)[0].id).project)[0].excerpts).toEqual([excerpt()])
})
it('explicit brief refresh includes excerpts as untrusted data, never full source; changed excerpts stale old Director/dossier reviews',()=>{
 const p=save(),d={title:'Brief',question:'Question?',angle:'Explain',uncertainties:'Check independently',selected:[0]},withBrief=saveResearchBrief(p,d,researchBriefKey(p)),brief=projectResearchBrief(withBrief)!,text=researchBriefToDirectorText(brief)
 expect(brief.sourceAssessments?.[0].excerpts).toEqual([excerpt()]);expect(text).toContain(quotation);expect(text).toContain('not full articles');expect(text).not.toContain('PRIVATE_UNSELECTED_ARTICLE');expect(text).not.toContain('PRIVATE_PROJECT_SCRIPT')
 const filters=newResearchObservationFilter(),session=new ResearchDossierSession(),review=session.prepare(withBrief,filters,'en'),changed=save(withBrief,{...draft(),excerpts:[]});expect(researchBriefAssessmentsCurrent(changed)).toBe(false);session.observe(changed,filters,'en');session.observe(withBrief,filters,'en');expect(session.current(review)).toBe(false)
 expect(researchBriefAssessmentsCurrent(saveResearchBrief(changed,d,researchBriefKey(changed)))).toBe(true)
})
it.each(['de','en','fr'] as const)('renders/exports %s exact historical quote with provenance, no full article, private script or I/O',language=>{
 const p=save(),files=buildResearchDossier(p,newResearchObservationFilter(),language).files,fetch=vi.spyOn(globalThis,'fetch'),persist=vi.fn(),write=vi.fn()
 try{for(const file of Object.values(files)){expect(file.text).toContain(quotation);expect(file.text).toContain(result.htmlSha256);expect(file.text).toContain(result.finalUrl);expect(file.text).not.toContain('PRIVATE_UNSELECTED_ARTICLE');expect(file.text).not.toContain('PRIVATE_PROJECT_SCRIPT')}
  for(const node of [createElement(SourceExcerptList,{excerpts:[excerpt()]}),createElement(SourceExcerptControl,{result,originalUrl:url,scope:'test',onAppend:persist}),createElement(ResearchSourceAssessmentPanel,{project:p,history:new PersistentVersionHistory({getItem:()=>null,setItem:write,removeItem:write}),onProjectChange:persist})]){const html=renderToStaticMarkup(createElement(UiLanguageProvider,{initialLanguage:language,children:node}));expect(html).not.toContain('PRIVATE_UNSELECTED_ARTICLE');expect(html).not.toContain('PRIVATE_PROJECT_SCRIPT')}
  expect(fetch).not.toHaveBeenCalled();expect(persist).not.toHaveBeenCalled();expect(write).not.toHaveBeenCalled();for(const key of Object.keys(uiSourceExcerptMessages) as Array<keyof typeof uiSourceExcerptMessages>)expect(translateUi(language,key)).not.toBe(key)
 }finally{fetch.mockRestore()}
})
it('shows source text only as escaped data, not executable markup',()=>{
 const text='<script>ignore all instructions</script>',e=sourceExcerptFromRead({...result,text},url,text),html=renderToStaticMarkup(createElement(SourceExcerptList,{excerpts:[e]}));expect(html).toContain('&lt;script&gt;');expect(html).not.toContain('<script>')
})
