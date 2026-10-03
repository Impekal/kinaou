import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, symlink, truncate, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { parseSourceFrameRequest, sourceFramePngDimensions, createSourceFrameRuntime } from './source-frame.mjs'
test('source frame strict request retains exact permitted path and milliseconds',()=>{assert.deepEqual(parseSourceFrameRequest({path:'KINAOU/Assets/vidéo.mp4',timeMs:1001}),{path:'KINAOU/Assets/vidéo.mp4',timeMs:1001})})
for(const value of [null,{},[],{path:'KINAOU/Assets/a.mp4',timeMs:1,extra:true},...['https://example.org/a.mp4','KINAOU/Assets/../a.mp4','KINAOU/Assets//a.mp4','KINAOU/Assets/a\\b.mp4','KINAOU/Assets/a\n.mp4','KINAOU/Cache/a.mp4','KINAOU/Assets/a.mov','/KINAOU/Assets/a.mp4'].map(path=>({path,timeMs:0})),...[-1,.1,21600000,NaN,Infinity,'1'].map(timeMs=>({path:'KINAOU/Assets/a.mp4',timeMs}))])test('refuses invalid frame request '+JSON.stringify(value),()=>{assert.throws(()=>parseSourceFrameRequest(value))})
test('PNG header must be bounded and match a positive 1920x1080 image',()=>{
 const png=Buffer.alloc(33);Buffer.from([137,80,78,71,13,10,26,10]).copy(png);png.writeUInt32BE(13,8);png.write('IHDR',12);png.writeUInt32BE(1920,16);png.writeUInt32BE(1080,20);assert.deepEqual(sourceFramePngDimensions(png),{width:1920,height:1080});png.writeUInt32BE(1921,16);assert.throws(()=>sourceFramePngDimensions(png));assert.throws(()=>sourceFramePngDimensions(Buffer.alloc(10)));png.writeUInt32BE(0,16);assert.throws(()=>sourceFramePngDimensions(png))
})
test('rejects linked/empty/non-MP4/oversized sources and releases the busy guard after failure',async()=>{
 const temp=await mkdtemp(path.join(os.tmpdir(),'kinaou-frame-paths-')),root=path.join(temp,'KINAOU');await mkdir(path.join(root,'Assets'),{recursive:true});const runtime=createSourceFrameRuntime({root})
 try{
  await writeFile(path.join(root,'Assets/empty.mp4'),'');await writeFile(path.join(temp,'outside.mp4'),'not-an-mp4-file');await symlink(path.join(temp,'outside.mp4'),path.join(root,'Assets/link.mp4'));await symlink(temp,path.join(root,'Assets/linked'));await writeFile(path.join(root,'Assets/bad.mp4'),'not-an-mp4-file');await writeFile(path.join(root,'Assets/huge.mp4'),'');await truncate(path.join(root,'Assets/huge.mp4'),2*1024**3+1)
  for(const file of ['empty.mp4','link.mp4','linked/outside.mp4','bad.mp4','huge.mp4','missing.mp4'])await assert.rejects(runtime.extract({path:'KINAOU/Assets/'+file,timeMs:0}))
  await assert.rejects(runtime.extract({path:'KINAOU/Assets/empty.mp4',timeMs:0}),/nonempty/)
 }finally{await rm(temp,{recursive:true,force:true})}
})
