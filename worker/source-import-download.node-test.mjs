import test from 'node:test'
import assert from 'node:assert/strict'
import {EventEmitter} from 'node:events'
import {Readable} from 'node:stream'
import {mkdtemp,open,readFile,rm} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {downloadPublicMp4} from './source-import-download.mjs'
import {sourceDownloadUrl,sourceImportLimits} from './source-import-protocol.mjs'
const url='https://media.example.org/original.mp4',bytes=Buffer.from([0,0,0,16,...Buffer.from('ftypisomDATA')])
function transport(replies){const calls=[];return{calls,requestImpl:(url,options,callback)=>{calls.push({url:url.href,options});const req=new EventEmitter();req.end=()=>{const reply=replies.shift();if(reply.error){queueMicrotask(()=>req.emit('error',reply.error));return}const res=Readable.from(reply.chunks??[bytes]);Object.assign(res,{statusCode:reply.status??200,headers:reply.headers??{'content-type':'video/mp4','content-length':String(bytes.length)}});queueMicrotask(()=>callback(res))};return req}}}
async function fixture(fn){const dir=await mkdtemp(path.join(os.tmpdir(),'kinaou-source-download-')),file=path.join(dir,'download.part'),handle=await open(file,'wx');try{await fn({file,handle})}finally{await handle.close();await rm(dir,{recursive:true,force:true})}}
const lookupImpl=async()=>[{address:'93.184.216.34',family:4}]
test('direct URL policy refuses credentials, queries, platform pages, non-MP4 and private host syntax',()=>{
 assert.equal(sourceDownloadUrl(url),url)
 for(const value of ['http://media.example.org/a.mp4','https://u:p@media.example.org/a.mp4','https://media.example.org/a.mp4?token=secret','https://youtube.com/a.mp4','https://cdn.googlevideo.com/a.mp4','https://media.example.org/a.zip','https://127.0.0.1/a.mp4','https://localhost/a.mp4','https://media.example.org:444/a.mp4'])assert.throws(()=>sourceDownloadUrl(value))
})
test('streamed write preserves exact bytes, hash, MIME and redirect evidence with pinned public DNS/TLS',()=>fixture(async({handle,file})=>{
 const mock=transport([{status:302,headers:{location:'https://cdn.example.org/final.mp4'}},{chunks:[bytes.subarray(0,3),bytes.subarray(3,8),bytes.subarray(8)]}]),progress=[]
 const result=await downloadPublicMp4(url,{handle,lookupImpl,requestImpl:mock.requestImpl,progress:n=>progress.push(n)})
 assert.deepEqual(await readFile(file),bytes);assert.equal(result.sha256,createHash('sha256').update(bytes).digest('hex'));assert.equal(result.sizeBytes,bytes.length);assert.deepEqual(result.redirectUrls,['https://cdn.example.org/final.mp4']);assert.equal(result.finalUrl,result.redirectUrls[0]);assert.equal(progress.at(-1),bytes.length)
 for(const call of mock.calls){assert.equal(call.options.servername,new URL(call.url).hostname);assert.equal(call.options.autoSelectFamily,false);assert.equal(call.options.headers.authorization,undefined);assert.equal(call.options.headers.cookie,undefined);assert.equal(call.options.headers['accept-encoding'],'identity');let actual;call.options.lookup('ignored',{},(_error,address,family)=>{actual={address,family}});assert.deepEqual(actual,{address:'93.184.216.34',family:4})}
}))
for(const kind of ['private','mixed','empty','family'])test(`rejects ${kind} DNS before any request`,()=>fixture(async({handle})=>{
 const mock=transport([{}]);await assert.rejects(downloadPublicMp4(url,{handle,requestImpl:mock.requestImpl,lookupImpl:async()=>kind==='private'?[{address:'127.0.0.1',family:4}]:kind==='mixed'?[{address:'93.184.216.34',family:4},{address:'10.0.0.1',family:4}]:kind==='family'?[{address:'93.184.216.34',family:6}]:[]}));assert.equal(mock.calls.length,0)
}))
for(const kind of ['http','mime','encoding','oversized','length','truncated','empty','header','range-status'])test(`rejects ${kind} responses`,()=>fixture(async({handle})=>{
 const headers={'content-type':kind==='mime'?'text/html':'video/mp4','content-length':kind==='oversized'?String(sourceImportLimits.bytes+1):kind==='length'?'12.5':kind==='truncated'?'17':String(bytes.length),...(kind==='encoding'?{'content-encoding':'gzip'}:{})}
 const mock=transport([{status:kind==='http'?403:kind==='range-status'?206:200,headers,chunks:kind==='empty'?[]:kind==='header'?[Buffer.alloc(16)]:[bytes]}]);await assert.rejects(downloadPublicMp4(url,{handle,lookupImpl,requestImpl:mock.requestImpl}))
}))
test('redirect destinations are revalidated and loops refused',()=>fixture(async({handle})=>{
 for(const location of ['http://media.example.org/a.mp4','https://127.0.0.1/a.mp4','https://media.example.org/a.mp4?secret=1',url]){const mock=transport([{status:302,headers:{location}}]);await assert.rejects(downloadPublicMp4(url,{handle,lookupImpl,requestImpl:mock.requestImpl}));assert.equal(mock.calls.length,1)}
}))
test('cancelled lookup cannot issue a late request',()=>fixture(async({handle})=>{
 const abort=new AbortController(),mock=transport([{}]);let resolve
 const result=downloadPublicMp4(url,{handle,signal:abort.signal,requestImpl:mock.requestImpl,lookupImpl:()=>new Promise(r=>{resolve=r})});abort.abort();await assert.rejects(result);resolve([{address:'93.184.216.34',family:4}]);await new Promise(r=>setImmediate(r));assert.equal(mock.calls.length,0)
}))
test('network/TLS errors propagate rather than bypass certificate checks',()=>fixture(async({handle})=>{
 const mock=transport([{error:Error('TLS certificate refused')}]);await assert.rejects(downloadPublicMp4(url,{handle,lookupImpl,requestImpl:mock.requestImpl}),/TLS certificate/);assert.equal(mock.calls[0].options.rejectUnauthorized,undefined)
}))
