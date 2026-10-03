import { it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createProject, parseProject } from '../src/core/project'
import { sourceFrameSource, sourceFrameRequestSchema, parseSourceFrameResult, sourceFrameMetadata, validateSourceFrameProbe } from '../src/core/sourceFrame'
import { SourceFrameControl } from '../src/components/SourceFrameControl'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import { PersistentVersionHistory } from '../src/core/versioning'
import { WorkerClient } from '../src/core/workerClient'
import { translateUi } from '../src/core/uiMessages'
const pngBase64='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jS9kAAAAASUVORK5CYII='
async function fixture(){const bytes=Uint8Array.from(atob(pngBase64),s=>s.charCodeAt(0)),sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');return {schemaVersion:1,sourcePath:'KINAOU/Assets/source.mp4',requestedMs:1000,sourceDurationMs:2000,sourceSizeBytes:5000,sourceWidth:160,sourceHeight:90,width:1,height:1,sizeBytes:bytes.length,sha256,pngBase64,extractedAt:'2026-10-03T12:00:00.000Z'}}
const projectFixture=()=>parseProject({...createProject('Frame'),assets:[{id:'source',kind:'video',managed:true,uri:'KINAOU/Assets/source.mp4',metadata:{name:'Source',durationMs:2000,synthetic:true}}]})
it('checks exact request, PNG bytes/header/hash and creates a separate PNG preserving synthetic source provenance',async()=>{
 const result=await fixture(),project=projectFixture(),before=JSON.stringify(project),frame=await parseSourceFrameResult(result,{path:result.sourcePath,timeMs:1000})
 expect(frame.file.type).toBe('image/png');expect(frame.file.size).toBe(result.sizeBytes);expect(frame.record).not.toHaveProperty('pngBase64');expect(frame.file.name).toMatch(/^source-frame-[a-f0-9-]+\.png$/)
 const metadata=sourceFrameMetadata(project,'source',frame);expect(metadata).toMatchObject({extractionOnly:true,sourceHashVerified:false,sourceAsset:{metadata:{synthetic:true}},extraction:{requestedMs:1000,sha256:result.sha256}});expect(metadata).not.toHaveProperty('generated');metadata.sourceAsset.metadata.name='mutated';expect(JSON.stringify(project)).toBe(before)
 const probe={path:'KINAOU/Assets/result.png',width:1,height:1,sizeBytes:result.sizeBytes,videoCodec:'png'};expect(validateSourceFrameProbe(probe,frame)).toBe(probe);expect(()=>validateSourceFrameProbe({...probe,videoCodec:'mjpeg'},frame)).toThrow();expect(()=>validateSourceFrameProbe({...probe,width:2},frame)).toThrow()
})
it.each(['path','time','end','hash','width','size','base64','extra','dimensions'] as const)('refuses malformed/mismatched frame %s',async fault=>{
 const value=await fixture();if(fault==='path')value.sourcePath='KINAOU/Assets/other.mp4';if(fault==='time')value.requestedMs=999;if(fault==='end')value.sourceDurationMs=1000;if(fault==='hash')value.sha256='0'.repeat(64);if(fault==='width')value.width=2;if(fault==='size')value.sizeBytes++;if(fault==='base64')value.pngBase64='not base64';if(fault==='extra')Object.assign(value,{extra:true});if(fault==='dimensions'){value.sourceWidth=7680;value.sourceHeight=7680}
 await expect(parseSourceFrameResult(value,{path:'KINAOU/Assets/source.mp4',timeMs:1000})).rejects.toThrow()
})
it.each(['offline','unmanaged','kind','duplicate','provenance','large','extension'] as const)('refuses unsafe source %s',fault=>{
 const project=projectFixture(),asset=project.assets[0];if(fault==='offline')asset.offline=true;if(fault==='unmanaged')asset.managed=false;if(fault==='kind')asset.kind='image';if(fault==='duplicate')project.assets.push(structuredClone(asset));if(fault==='provenance')asset.metadata.sourceImport={schemaVersion:5};if(fault==='large')asset.metadata.extra='x'.repeat(50000);if(fault==='extension')asset.uri='KINAOU/Assets/source.mov';expect(()=>sourceFrameSource(project,'source')).toThrow()
})
it('refuses changed retained duration rather than silently reusing old source provenance',async()=>{const project=projectFixture(),value=await fixture(),frame=await parseSourceFrameResult(value,{path:value.sourcePath,timeMs:1000});project.assets[0].metadata.durationMs=3000;expect(()=>sourceFrameMetadata(project,'source',frame)).toThrow(/duration/)})
it.each([{path:'https://example.org/a.mp4',timeMs:0},{path:'KINAOU/Assets/../a.mp4',timeMs:0},{path:'KINAOU/Assets/a.mp4',timeMs:21600000},{path:'KINAOU/Assets/a.mp4',timeMs:0.5}])('validates request before submission %j',request=>expect(()=>sourceFrameRequestSchema.parse(request)).toThrow())
it('old worker refusal makes no extraction request',async()=>{const calls:string[]=[],client=new WorkerClient({baseUrl:'http://127.0.0.1:43117',token:'test',fetchImpl:async url=>{calls.push(String(url));return Response.json({ok:true,type:'health',handshake:{workerId:'old',name:'Old',platform:'fixture',version:'0',capabilities:['filesystem','ffmpeg'],managedRoots:['KINAOU']}})}});await expect(client.extractSourceFrame({path:'KINAOU/Assets/a.mp4',timeMs:0})).rejects.toThrow(/source-video-frame/);expect(calls).toEqual(['http://127.0.0.1:43117/health'])})
it.each(['de','en','fr'] as const)('renders %s explicit read/save boundaries without I/O or mutation',language=>{
 const project=projectFixture(),fetch=vi.spyOn(globalThis,'fetch'),persist=vi.fn(),history=new PersistentVersionHistory({getItem:()=>null,setItem:()=>{},removeItem:()=>{}}),before=JSON.stringify(project)
 try{const html=renderToStaticMarkup(createElement(UiLanguageProvider,{initialLanguage:language,children:createElement(SourceFrameControl,{project,asset:project.assets[0],history,workerUrl:'http://127.0.0.1:43117',workerToken:'',workerConnected:false,workerCapabilities:[],onProjectChange:persist})}));expect(html).toContain(translateUi(language,'sourceFrame.heading'));expect(html).toContain('disabled=""');expect(html).not.toContain(translateUi(language,'sourceFrame.save'));expect(fetch).not.toHaveBeenCalled();expect(persist).not.toHaveBeenCalled();expect(JSON.stringify(project)).toBe(before)}finally{fetch.mockRestore()}
})
