import { it,expect,vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { PublicSourceReadSession } from '../src/core/publicSourceReader'
import { WorkerClient } from '../src/core/workerClient'
import { PublicSourceReader } from '../src/components/PublicSourceReader'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import { createProject } from '../src/core/project'
import { retainSearchTrend, retainedSearchTrends } from '../src/core/searchTrends'
import { uiPublicSourceMessages } from '../src/core/uiPublicSourceMessages'
import { translateUi } from '../src/core/uiMessages'
import { type PublicSourceResult } from '../worker/public-source-protocol.mjs'
const url='https://example.org/article', result:PublicSourceResult={schemaVersion:1,requestedUrl:url,finalUrl:url,redirectUrls:[],retrievedAt:'2026-10-03T00:00:00.000Z',htmlSha256:'a'.repeat(64),htmlBytes:200,title:'Unverified title',declaredLanguage:'fr',extraction:'article',text:'SYNTHETIC untrusted source',truncated:false,verified:false}
it('only sends an explicit URL to authenticated local worker and validates requested identity',async()=>{
 const fetchImpl=vi.fn(async()=>new Response(JSON.stringify({ok:true,type:'public-source-text',source:result}))),client=new WorkerClient({baseUrl:'http://127.0.0.1:43117',token:'test-only',fetchImpl})
 expect(await client.readPublicSource({url})).toEqual(result);expect(fetchImpl).toHaveBeenCalledWith('http://127.0.0.1:43117/research/source/read',expect.objectContaining({body:JSON.stringify({url}),headers:expect.objectContaining({authorization:'Bearer test-only'})}))
 await expect(client.readPublicSource({url:'https://other.example.org'})).rejects.toThrow();await expect(client.readPublicSource({url:'http://localhost'})).rejects.toThrow();expect(fetchImpl).toHaveBeenCalledTimes(2)
})
it.each(['project','source','selection','connection','language'])('permanently discards late success/failure after observed %s A→B→A',async kind=>{
 for(const failure of [false,true]){let done!:(value:PublicSourceResult)=>void,fail!:(value:Error)=>void;const pending=new Promise<PublicSourceResult>((r,j)=>{done=r;fail=j}),session=new PublicSourceReadSession('A',url),publish=vi.fn(),error=vi.fn(),task=session.load(()=>pending,publish,error);session.observe(kind);session.observe('A');if(failure)fail(Error('late'));else done(result);await task;expect(session.current).toBe(false);expect(publish).not.toHaveBeenCalled();expect(error).not.toHaveBeenCalled()}
})
it('accepts only current matching source, rejects forged reply and detaches on close',async()=>{
 const publish=vi.fn(),fail=vi.fn(),session=new PublicSourceReadSession('A',url);await session.load(async()=>result,publish,fail);expect(publish).toHaveBeenCalledWith(result)
 await session.load(async()=>({...result,finalUrl:'https://other.example.org'}),publish,fail);expect(fail).toHaveBeenCalledTimes(1);session.detach();await session.load(async()=>result,publish,fail);expect(publish).toHaveBeenCalledTimes(1)
})
it.each(['de','en','fr'] as const)('renders %s read-only, explicit selection, escaped titles and honest limits with zero I/O',language=>{
 const base=createProject('Synthetic'),p=retainSearchTrend(base,{schemaVersion:1,provider:'google-trends-rss',country:'DE',sourceUrl:'https://trends.google.com/trending/rss?geo=DE',retrievedAt:result.retrievedAt,feedSha256:'a'.repeat(64),items:[{query:'test',reportedTraffic:null,publishedAt:result.retrievedAt,articles:[{title:'<script>untrusted</script>',source:'Test',url}]}]},0),before=JSON.stringify(p),fetch=vi.spyOn(globalThis,'fetch')
 try { const html=renderToStaticMarkup(createElement(UiLanguageProvider,{initialLanguage:language,children:createElement(PublicSourceReader,{project:p,source:retainedSearchTrends(p)[0],workerUrl:'http://127.0.0.1:43117',workerToken:'SECRET',workerConnected:true,workerCapabilities:['public-source-reader']})}))
  expect(html).toContain(translateUi(language,'sourceReader.heading'));expect(html).toContain(translateUi(language,'sourceReader.boundary'));expect(html).toContain('&lt;script&gt;');expect(html).not.toContain('SECRET');expect(html).not.toContain('checked=');expect(fetch).not.toHaveBeenCalled();expect(JSON.stringify(p)).toBe(before)
  for(const key of Object.keys(uiPublicSourceMessages) as Array<keyof typeof uiPublicSourceMessages>)expect(translateUi(language,key)).not.toBe(key)
 }finally{fetch.mockRestore()}
})
