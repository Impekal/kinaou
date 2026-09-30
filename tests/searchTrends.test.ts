import { it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createProject, parseProject } from '../src/core/project'
import { PersistentVersionHistory } from '../src/core/versioning'
import { retainedSearchTrends, retainSearchTrend, SearchTrendSession } from '../src/core/searchTrends'
import { WorkerClient } from '../src/core/workerClient'
import { SearchTrendsPanel } from '../src/components/SearchTrendsPanel'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import { uiLanguages } from '../src/core/uiLanguage'
import { translateUi } from '../src/core/uiMessages'
import type { SearchTrendSnapshot } from '../worker/search-trends-protocol.mjs'
const snapshot:SearchTrendSnapshot={schemaVersion:1,provider:'google-trends-rss',country:'DE',sourceUrl:'https://trends.google.com/trending/rss?geo=DE',retrievedAt:'2026-09-27T07:00:00.000Z',feedSha256:'a'.repeat(64),items:[{query:'Example <script>alert(1)</script>',reportedTraffic:'200+',publishedAt:'2026-09-27T06:00:00.000Z',articles:[{title:'Example',url:'https://example.org/report',source:'Source'}]}]}
const storage=()=>{const values=new Map<string,string>();return {getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value)},removeItem:(key:string)=>{values.delete(key)}}}
it('retains selected historical provenance through project serialization without mutating input',()=>{
  const base=createProject('Research'),before=JSON.stringify(base),next=retainSearchTrend(base,snapshot,0)
  expect(JSON.stringify(base)).toBe(before);expect(retainedSearchTrends(parseProject(JSON.parse(JSON.stringify(next))))[0]).toEqual(snapshot)
  expect(retainSearchTrend(next,{...snapshot,retrievedAt:'2026-09-27T08:00:00.000Z'},0)).toBe(next)
  expect(retainedSearchTrends(retainSearchTrend(next,{...snapshot,feedSha256:'b'.repeat(64)},0))).toHaveLength(2)
})
it('rejects bad selections, corrupt history and full ledgers without discarding records',()=>{
  const project=createProject('Research')
  for(const index of [-1,1,0.5,NaN])expect(()=>retainSearchTrend(project,snapshot,index)).toThrow()
  project.metadata.searchTrendObservations=[{...snapshot,sourceUrl:'https://wrong.example.org'}];expect(()=>retainSearchTrend(project,snapshot,0)).toThrow()
  project.metadata.searchTrendObservations=Array.from({length:200},(_,i)=>({...snapshot,feedSha256:i.toString(16).padStart(64,'0')}))
  expect(()=>retainSearchTrend(project,snapshot,0)).toThrow(/full/);expect(retainedSearchTrends(project)).toHaveLength(200)
})
it('version history preserves the prior project and failed persistence can be retried',()=>{
  const base=createProject('Research'),store=storage(),history=new PersistentVersionHistory(store),next=retainSearchTrend(base,snapshot,0)
  history.snapshot(base,'Before research','system');const save=vi.fn(()=>{throw Error('quota')})
  expect(()=>save()).toThrow('quota');expect(retainedSearchTrends(base)).toEqual([])
  expect(retainSearchTrend(base,snapshot,0).metadata).toEqual(next.metadata)
})
it('drops detached late success and failure permanently',async()=>{
  for(const reject of [false,true]){
    let done!:(value:SearchTrendSnapshot)=>void,fail!:(reason:unknown)=>void
    const pending=new Promise<SearchTrendSnapshot>((resolve,reject)=>{done=resolve;fail=reject}),publish=vi.fn(),error=vi.fn(),session=new SearchTrendSession()
    const task=session.load(()=>pending,publish,error);session.detach();if(reject)fail(Error('late'));else done(snapshot);await task
    expect(publish).not.toHaveBeenCalled();expect(error).not.toHaveBeenCalled()
  }
})
it('client sends only country through authenticated local route and rejects wrong country/null reply',async()=>{
  const fetchImpl=vi.fn(async()=>new Response(JSON.stringify({ok:true,type:'search-trends',snapshot}),{status:200}))
  const client=new WorkerClient({baseUrl:'http://127.0.0.1:43948',token:'test-only',fetchImpl})
  expect(await client.searchTrends({country:'DE'})).toEqual(snapshot)
  const args=fetchImpl.mock.calls[0] as unknown as [string,RequestInit];expect(args[0]).toContain('/research/search-trends');expect(args[1].body).toBe('{"country":"DE"}')
  await expect(client.searchTrends({country:'FR'})).rejects.toThrow()
  await expect(new WorkerClient({baseUrl:'http://127.0.0.1:43948',token:'test-only',fetchImpl:async()=>new Response('null')}).searchTrends({country:'DE'})).rejects.toThrow()
})
it.each(uiLanguages)('renders safe historical observations and explicit boundaries in %s without network/writes',language=>{
  const fetch=vi.spyOn(globalThis,'fetch'),change=vi.fn(),project=retainSearchTrend(createProject('Research'),snapshot,0)
  try{
    const markup=renderToStaticMarkup(createElement(UiLanguageProvider,{initialLanguage:language,children:createElement(SearchTrendsPanel,{project,history:new PersistentVersionHistory(storage()),onProjectChange:change})}))
    expect(markup).toContain(translateUi(language,'research.history'));expect(markup).toContain(translateUi(language,'research.unavailable'))
    for(const key of ['research.filterHeading','research.filterHelp','research.filterBasis','research.filterReset'] as const)expect(markup).toContain(translateUi(language,key))
    expect(markup).toContain(translateUi(language,'research.filterCount',{matches:1,total:1}))
    expect(markup).toContain('&lt;script&gt;');expect(markup).not.toContain('<script>alert');expect(markup).toContain('rel="noopener noreferrer"')
    expect(change).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled()
  }finally{fetch.mockRestore()}
})
