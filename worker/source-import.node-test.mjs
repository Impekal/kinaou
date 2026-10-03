import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,mkdir,readFile,writeFile,rm,readdir,symlink,stat} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {createHash,randomUUID} from 'node:crypto'
import {createSourceImportRuntime} from './source-import.mjs'
import {sourceImportPath,validateSourceImportJob} from './source-import-protocol.mjs'
const bytes=Buffer.from([0,0,0,16,...Buffer.from('ftypisomDATA')]),url='https://media.example.org/original.mp4'
const request=()=>({id:randomUUID(),projectId:'project',name:'Synthetic original',downloadUrl:url,sourcePageUrl:'https://media.example.org/source',creator:'Synthetic creator',permissionBasis:'own',evidence:'Synthetic fixture authorization',attribution:'Synthetic fixture',intendedUse:'Local test only',acquisitionConfirmed:true,reuseConfirmed:true,reviewedAt:new Date().toISOString()})
async function download(requestedUrl,{handle,signal,progress}){signal.throwIfAborted();await handle.writeFile(bytes);progress(bytes.length);return{requestedUrl,finalUrl:requestedUrl,redirectUrls:[],sizeBytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),mimeType:'video/mp4',retrievedAt:new Date().toISOString()}}
const probe=async file=>({path:file,sizeBytes:bytes.length,durationMs:1000,width:160,height:90,videoCodec:'h264',fps:30})
async function fixture(fn){const temp=await mkdtemp(path.join(os.tmpdir(),'kinaou-source-runtime-')),root=path.join(temp,'KINAOU');await mkdir(root);try{await fn({temp,root})}finally{await rm(temp,{recursive:true,force:true})}}
async function done(runtime,id){for(let n=0;n<200;n++){const job=await runtime.status({id});if(['succeeded','failed','cancelled'].includes(job.state))return job;await new Promise(r=>setTimeout(r,10))}throw Error('Source fixture timed out')}
test('actual managed file, hash, provenance and same-ID recovery survive a new runtime',()=>fixture(async({root,temp})=>{
 let count=0;const runtime=createSourceImportRuntime({root,probe,download:async(...args)=>{count++;return download(...args)}}),input=request(),before=JSON.stringify(input)
 const first=await runtime.start(input);assert.equal(first.request.id,input.id);const result=await done(runtime,input.id);assert.equal(result.state,'succeeded');validateSourceImportJob(result,input)
 assert.deepEqual(await readFile(path.join(temp,sourceImportPath(input.id))),bytes);assert.equal(JSON.stringify(input),before)
 assert.deepEqual((await readdir(path.join(root,'Assets/SourceImports',input.id))).sort(),['original.mp4','status.json'])
 const restarted=createSourceImportRuntime({root,probe,download:()=>{throw Error('must not download again')}})
 assert.deepEqual(await restarted.status({id:input.id}),result);assert.deepEqual(await restarted.start(input),result);assert.equal(count,1)
 await assert.rejects(restarted.start({...input,name:'Changed request'}),/bound/)
 const saved=JSON.parse(await readFile(path.join(root,'Assets/SourceImports',input.id,'status.json'),'utf8'));assert.equal(saved.result.legalClearance,false);assert.equal(saved.request.evidence,input.evidence)
}))
test('altered completed bytes fail the actual hash check without redownloading',()=>fixture(async({root,temp})=>{
 const runtime=createSourceImportRuntime({root,probe,download}),input=request();await runtime.start(input);assert.equal((await done(runtime,input.id)).state,'succeeded')
 await writeFile(path.join(temp,sourceImportPath(input.id)),Buffer.alloc(bytes.length));await assert.rejects(runtime.status({id:input.id}),/hash/);await assert.rejects(runtime.start(input),/hash/)
}))
test('large multilingual evidence survives retained recovery when job provenance exceeds the request limit',()=>fixture(async({root})=>{
 const input={...request(),downloadUrl:`https://media.example.org/${'a'.repeat(1900)}.mp4`,sourcePageUrl:`https://media.example.org/${'b'.repeat(1900)}`,projectId:'漢'.repeat(200),name:'漢'.repeat(150),creator:'漢'.repeat(200),evidence:'漢'.repeat(4000),attribution:'漢'.repeat(2000),intendedUse:'漢'.repeat(2000)}
 assert.ok(Buffer.byteLength(JSON.stringify(input))<32768)
 const runtime=createSourceImportRuntime({root,probe,download});await runtime.start(input);const job=await done(runtime,input.id);assert.equal(job.state,'succeeded')
 assert.ok(Buffer.byteLength(JSON.stringify(job))>32768)
 assert.deepEqual(await createSourceImportRuntime({root,probe,download:()=>{throw Error('no second download')}}).status({id:input.id}),job)
}))
test('cancellation removes the owned partial file and never restarts the same ID',()=>fixture(async({root})=>{
 let count=0;const runtime=createSourceImportRuntime({root,probe,download:async(_url,{handle,signal,progress})=>{count++;await handle.writeFile(bytes.subarray(0,8));progress(8);await new Promise((_resolve,reject)=>{if(signal.aborted)reject(signal.reason);else signal.addEventListener('abort',()=>reject(signal.reason),{once:true})})}}),input=request()
 await runtime.start(input);for(let n=0;n<100&&count===0;n++)await new Promise(r=>setTimeout(r,5))
 await runtime.cancel({id:input.id});const result=await done(runtime,input.id);assert.equal(result.state,'cancelled');assert.deepEqual(await readdir(path.join(root,'Assets/SourceImports',input.id)),['status.json']);assert.equal((await runtime.start(input)).state,'cancelled');assert.equal(count,1)
}))
test('only one source download runs at a time and same-ID status does not create another',()=>fixture(async({root})=>{
 let release;const runtime=createSourceImportRuntime({root,probe,download:async(...args)=>{await new Promise(r=>{release=r});return download(...args)}}),input=request();await runtime.start(input)
 for(let n=0;n<100&&!release;n++)await new Promise(r=>setTimeout(r,5))
 await assert.rejects(runtime.start(request()),/already running/);assert.equal((await runtime.start(input)).request.id,input.id);release();assert.equal((await done(runtime,input.id)).state,'succeeded')
}))
for(const kind of ['probe','digest','size','redirect'])test(`${kind} failure preserves no accepted original and cleans the part`,()=>fixture(async({root})=>{
 const runtime=createSourceImportRuntime({root,probe:kind==='probe'?async()=>{throw Error('unreadable video')}:kind==='size'?async file=>({...await probe(file),sizeBytes:99}):probe,download:async(...args)=>{const result=await download(...args);if(kind==='digest')result.sha256='0'.repeat(64);if(kind==='redirect')result.finalUrl='https://other.example.org/changed.mp4';return result}}),input=request()
 await runtime.start(input);const result=await done(runtime,input.id);assert.equal(result.state,'failed');assert.equal(result.result,undefined);assert.deepEqual(await readdir(path.join(root,'Assets/SourceImports',input.id)),['status.json'])
}))
test('interrupted on-disk jobs become failed observations without writes or automatic continuation',()=>fixture(async({root})=>{
 const input=request(),folder=path.join(root,'Assets/SourceImports',input.id),time=new Date().toISOString();await mkdir(folder,{recursive:true});const job={request:input,state:'probing',createdAt:time,updatedAt:time,receivedBytes:16};await writeFile(path.join(folder,'status.json'),JSON.stringify(job));await writeFile(path.join(folder,'download.part'),bytes)
 const before=await readFile(path.join(folder,'status.json')),runtime=createSourceImportRuntime({root,probe,download:()=>{throw Error('no restart')}})
 assert.equal((await runtime.status({id:input.id})).state,'failed');assert.equal((await runtime.start(input)).state,'failed');assert.deepEqual(await readFile(path.join(folder,'status.json')),before);assert.deepEqual(await readFile(path.join(folder,'download.part')),bytes)
}))
test('symlinked managed parents and pre-existing unknown folders are never overwritten',()=>fixture(async({root,temp})=>{
 const outside=path.join(temp,'outside');await mkdir(outside);await symlink(outside,path.join(root,'Assets'));const runtime=createSourceImportRuntime({root,probe,download});await assert.rejects(runtime.start(request()),/Unsafe/);assert.deepEqual(await readdir(outside),[])
 await rm(path.join(root,'Assets'));const input=request(),folder=path.join(root,'Assets/SourceImports',input.id);await mkdir(folder,{recursive:true});await writeFile(path.join(folder,'original.mp4'),'foreign');await assert.rejects(runtime.start(input));assert.equal(await readFile(path.join(folder,'original.mp4'),'utf8'),'foreign')
}))
test('missing confirmations and unsafe IDs fail before filesystem allocation',()=>fixture(async({root})=>{
 const runtime=createSourceImportRuntime({root,probe,download});await assert.rejects(runtime.start({...request(),reuseConfirmed:false}));await assert.rejects(runtime.start({...request(),id:'../outside'}));assert.deepEqual(await readdir(root),[])
}))
