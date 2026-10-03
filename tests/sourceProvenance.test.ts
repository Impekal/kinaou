import { expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createProject, parseProject } from '../src/core/project'
import { SourceImportRegistration } from '../src/core/sourceImport'
import { buildSourceProvenance, SourceProvenanceSession } from '../src/core/sourceProvenance'
import { sourceImportRequestSchema, sourceImportPath, type SourceImportJob } from '../worker/source-import-protocol.mjs'
import { ProjectAssetList } from '../src/components/ProjectAssetList'
import { SourceProvenancePanel } from '../src/components/SourceProvenancePanel'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import { translateUi } from '../src/core/uiMessages'
import { PersistentVersionHistory } from '../src/core/versioning'

const id='8f630526-e4dc-434c-a898-a11a310f4567',date='2026-10-03T00:00:00.000Z',url='https://media.example.org/source.mp4'
export function sourceReportFixture() {
  const base=createProject('Private source report'),request=sourceImportRequestSchema.parse({id,projectId:base.id,name:'Original <demo>',downloadUrl:url,sourcePageUrl:'https://media.example.org/source',creator:'Creator <keep>',permissionBasis:'permission',evidence:'Private permission evidence <keep>',attribution:'Original exact attribution\nSecond line',intendedUse:'Private review only',acquisitionConfirmed:true,reuseConfirmed:true,reviewedAt:date}),managedPath=sourceImportPath(id)
  const job:SourceImportJob={request,state:'succeeded',createdAt:date,updatedAt:date,receivedBytes:16,result:{managedPath,sizeBytes:16,sha256:'a'.repeat(64),requestedUrl:url,finalUrl:url,redirectUrls:[],retrievedAt:date,mimeType:'video/mp4',legalClearance:false,probe:{path:managedPath,sizeBytes:16,durationMs:10000,width:160,height:90,videoCodec:'h264'}}}
  const imported=new SourceImportRegistration(base,job).commit(base,()=>{},()=>{}),assetId=imported.assets[0].id
  const clip={id:'fast',assetId,startMs:3000,durationMs:1000,sourceOffsetMs:1500,speed:2}
  const project=parseProject({...imported,script:'UNRELATED_PRIVATE_SCRIPT',metadata:{unrelated:'UNRELATED_PRIVATE_METADATA'},tracks:[{id:'track',name:'Track <keep>',type:'video',clips:[clip,{...clip,id:'slow',startMs:5000,sourceOffsetMs:2000,speed:0.5}]},{id:'muted',name:'Muted',type:'broll',muted:true,clips:[{...clip,id:'outside',sourceOffsetMs:9500}]}]})
  return {project,assetId,job}
}
it('reports exact requested retimed intervals, muted and repeated uses without project mutation or legality percentages',()=>{
 const {project,assetId,job}=sourceReportFixture(),before=JSON.stringify(project),report=buildSourceProvenance(project,assetId,'en',new Date(date)),json=JSON.parse(report.files.json.text)
 expect(json.acquisition).toEqual({schemaVersion:1,request:job.request,result:job.result});expect(json.timelineUses).toHaveLength(3)
 expect(json.timelineUses[0]).toMatchObject({timelineStartMs:3000,timelineEndMs:4000,sourceStartMs:1500,sourceEndMs:3500,speed:2,trackMuted:false,exceedsRetainedDuration:false})
 expect(json.timelineUses[1]).toMatchObject({sourceStartMs:2000,sourceEndMs:2500,speed:0.5});expect(json.timelineUses[2]).toMatchObject({trackMuted:true,sourceEndMs:11500,exceedsRetainedDuration:true})
 expect(json).toMatchObject({legalClearance:false,currentFileHashReverified:false,finishedExportInspected:false})
 expect(report.files.text.text).toContain(job.request.attribution);expect(report.files.text.text).toContain(translateUi('en','sourceReport.outOfBounds'));expect(JSON.stringify(report)).not.toContain('UNRELATED_PRIVATE');expect(JSON.stringify(project)).toBe(before)
})
it('unplaced originals and original project identity remain historical after restore into another project',()=>{const{project,assetId,job}=sourceReportFixture(),report=buildSourceProvenance({...project,id:'restored',tracks:[]},assetId,'de');expect(report.uses).toBe(0);expect(JSON.parse(report.files.json.text).acquisition.request.projectId).toBe(job.request.projectId)})
it.each(['missing','duplicate','uri','kind','managed','schema','hash','result-binding','extra'])('refuses %s source record rather than inventing or silently omitting provenance',kind=>{
 const{project,assetId}=sourceReportFixture(),asset=project.assets[0],record=asset.metadata.sourceImport as any
 if(kind==='missing')delete asset.metadata.sourceImport;if(kind==='duplicate')project.assets.push(structuredClone(asset));if(kind==='uri')asset.uri='KINAOU/Assets/other.mp4';if(kind==='kind')asset.kind='image';if(kind==='managed')asset.managed=false;if(kind==='schema')record.schemaVersion=2;if(kind==='hash')record.result.sha256='invalid';if(kind==='result-binding')record.result.probe.sizeBytes=99;if(kind==='extra')record.secret='must not export'
 expect(()=>buildSourceProvenance(project,assetId,'en')).toThrow()
})
it('refuses invalid language, unsafe arithmetic and an oversized report',()=>{
 const{project,assetId}=sourceReportFixture();expect(()=>buildSourceProvenance(project,assetId,'xx' as any)).toThrow();project.tracks[0].clips[0].startMs=Number.MAX_SAFE_INTEGER;expect(()=>buildSourceProvenance(project,assetId,'en')).toThrow(/numeric/)
 const large=sourceReportFixture();large.project.title='漢'.repeat(1500000);expect(()=>buildSourceProvenance(large.project,large.assetId,'en')).toThrow()
})
it.each(['project','language','asset'] as const)('observed %s A/B/A permanently invalidates an old review and acknowledgement',kind=>{
 const{project,assetId}=sourceReportFixture(),session=new SourceProvenanceSession(),review=session.prepare(project,assetId,'de')
 session.observe(kind==='project'?{...project,title:'B'}:project,kind==='asset'?'other':assetId,kind==='language'?'en':'de');session.observe(project,assetId,'de')
 expect(session.current(review)).toBe(false);expect(()=>session.download(review,'json',true)).toThrow()
 const fresh=session.prepare(project,assetId,'de');expect(session.download(fresh,'text',true)).toEqual(fresh.files.text)
})
it('exports only acknowledged original visible bytes and refuses forged/mutated reviews',()=>{
 const{project,assetId}=sourceReportFixture(),session=new SourceProvenanceSession(),review=session.prepare(project,assetId,'en')
 expect(()=>session.download(review,'text',false)).toThrow();expect(()=>session.download(structuredClone(review),'text',true)).toThrow();expect(()=>session.download(review,'csv' as any,true)).toThrow()
 const file=session.download(review,'json',true);file.text='external mutation';expect(session.download(review,'json',true).text).toBe(review.files.json.text)
 review.files.text.text+='mutated';expect(()=>session.download(review,'text',true)).toThrow()
})
it.each(['de','en','fr'] as const)('integrates explicit-only %s provenance in the real asset library without requests/writes',language=>{
 const{project}=sourceReportFixture(),before=JSON.stringify(project),fetch=vi.spyOn(globalThis,'fetch'),write=vi.fn(),history=new PersistentVersionHistory({getItem:()=>null,setItem:()=>{},removeItem:()=>{}})
 try{const html=renderToStaticMarkup(createElement(UiLanguageProvider,{initialLanguage:language,children:createElement(ProjectAssetList,{project,history,workerUrl:'http://127.0.0.1:43996',workerToken:'',workerConnected:false,workerCapabilities:[],onProjectChange:write})}));expect(html).toContain(translateUi(language,'sourceReport.heading'));expect(html).toContain(translateUi(language,'sourceReport.prepare'));expect(html).toContain('Original &lt;demo&gt;');expect(html).not.toContain('Private permission evidence');expect(fetch).not.toHaveBeenCalled();expect(write).not.toHaveBeenCalled();expect(JSON.stringify(project)).toBe(before)}finally{fetch.mockRestore()}
})
it('leaves legacy/local assets without online provenance untouched and hides the report control',()=>{const{project,assetId}=sourceReportFixture();delete project.assets[0].metadata.sourceImport;const html=renderToStaticMarkup(createElement(UiLanguageProvider,{initialLanguage:'en',children:createElement(SourceProvenancePanel,{project,assetId})}));expect(html).toBe('')})
