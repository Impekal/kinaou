import {it,expect} from 'vitest'
import {spawn,execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {mkdtemp,mkdir,readFile,realpath,rm} from 'node:fs/promises'
import {createHash,randomUUID} from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import {createSourceImportRuntime} from '../worker/source-import.mjs'
import {sourceImportRequestSchema} from '../worker/source-import-protocol.mjs'
import {createProject,parseProject} from '../src/core/project'
import {SourceImportRegistration} from '../src/core/sourceImport'
import {placeAssetOnTrack} from '../src/core/timelinePlacement'
import {createRenderPlan,projectFormatPreset} from '../src/core/render'
import {WorkerClient} from '../src/core/workerClient'
const exec=promisify(execFile),run=async(program:string,args:string[])=>(await exec(program,args,{encoding:'buffer',maxBuffer:4*1024**2})).stdout
it('downloaded-source registration reaches real authenticated probing, retained recovery, timeline and actual FFmpeg export',async context=>{
 try{await run('ffmpeg',['-version']);await run('ffprobe',['-version'])}catch(cause){if(process.env.CI)throw cause;context.skip('FFmpeg required');return}
 const temp=await mkdtemp(path.join(os.tmpdir(),'kinaou-source-render-'));await mkdir(path.join(temp,'KINAOU'));const root=await realpath(path.join(temp,'KINAOU')),source=path.join(temp,'synthetic.mp4')
 const child=spawn(process.execPath,[path.resolve('worker/mac-worker.mjs')],{env:{PATH:process.env.PATH,KINAOU_MANAGED_ROOT:root,KINAOU_WORKER_PORT:'43998',KINAOU_WORKER_TOKEN:'source-render-test'},stdio:['ignore','pipe','pipe']});let logs='';child.stdout.on('data',d=>{logs+=d});child.stderr.on('data',d=>{logs+=d})
 try{
  await run('ffmpeg',['-v','error','-f','lavfi','-i','color=red:size=160x90:rate=30:duration=1','-f','lavfi','-i','sine=frequency=440:duration=1','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac',source]);const bytes=await readFile(source),sha256=createHash('sha256').update(bytes).digest('hex')
  const deadline=Date.now()+15000;while(!logs.includes('listening on http://127.0.0.1:43998')){if(child.exitCode!==null||Date.now()>deadline)throw Error(logs);await new Promise(r=>setTimeout(r,30))}
  const client=new WorkerClient({baseUrl:'http://127.0.0.1:43998',token:'source-render-test'}),project=parseProject({...createProject('Synthetic source render'),tracks:[{id:'video',type:'video',name:'Video',clips:[]}]})
  let downloads=0
  const runtime=createSourceImportRuntime({root,probe:file=>client.probe(`KINAOU/${path.relative(root,file)}`),download:async(requestedUrl,{handle,signal,progress})=>{signal.throwIfAborted();downloads++;await handle.writeFile(bytes);progress(bytes.length);return{requestedUrl,finalUrl:requestedUrl,redirectUrls:[],sizeBytes:bytes.length,sha256,mimeType:'video/mp4',retrievedAt:new Date().toISOString()}}})
  const request=sourceImportRequestSchema.parse({id:randomUUID(),projectId:project.id,name:'Synthetic red with tone',downloadUrl:'https://media.example.org/source.mp4',sourcePageUrl:'https://media.example.org/source',creator:'Synthetic fixture',permissionBasis:'own',evidence:'Locally generated synthetic file; injected transport for deterministic CI only',attribution:'Synthetic fixture',intendedUse:'Isolated test only',acquisitionConfirmed:true,reuseConfirmed:true,reviewedAt:new Date().toISOString()})
  await runtime.start(request);let imported=await runtime.status({id:request.id});for(let n=0;n<200&&!['succeeded','failed','cancelled'].includes(imported.state);n++){await new Promise(r=>setTimeout(r,30));imported=await runtime.status({id:request.id})}expect(imported.state,imported.error).toBe('succeeded')
  const recovered=await client.sourceImportStatus(request);expect(recovered).toEqual(imported);expect(await client.startSourceImport(request)).toEqual(imported);expect(downloads).toBe(1)
  const unauthorized=await fetch('http://127.0.0.1:43998/source-import/status',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:request.id})});expect(unauthorized.status).toBe(401)
  const registered=new SourceImportRegistration(project,recovered).commit(project,()=>{},()=>{}),placed=placeAssetOnTrack(registered,registered.assets[0].id,'video')
  expect(registered.tracks[0].clips).toEqual([]);expect(placed.assets[0].metadata.sourceImport).toMatchObject({request,result:{sha256}})
  const plan=createRenderPlan(placed,projectFormatPreset(placed,'landscape','preview'),'KINAOU/Renders/source-import-test.mp4');let job=await client.startRender(plan)
  for(let n=0;n<200&&['queued','running'].includes(job.state);n++){await new Promise(r=>setTimeout(r,30));job=await client.renderStatus(job.id)}expect(job.state,job.error).toBe('succeeded')
  const output=path.join(root,'Renders/source-import-test.mp4'),rgb=await run('ffmpeg',['-v','error','-ss','0.5','-i',output,'-vf','scale=1:1','-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','-']);expect(rgb[0]).toBeGreaterThan(200);expect(rgb[2]).toBeLessThan(30)
  const probe=await client.probe('KINAOU/Renders/source-import-test.mp4');expect(Math.abs(probe.durationMs!-1000)).toBeLessThan(100);expect(probe.width).toBe(960);expect(probe.height).toBe(540)
  expect(await readFile(path.join(root,imported.result!.managedPath.slice('KINAOU/'.length)))).toEqual(bytes);expect(await readFile(source)).toEqual(bytes)
 }finally{child.kill('SIGKILL');await new Promise<void>(resolve=>{child.on('close',()=>resolve());setTimeout(resolve,3000).unref()});await rm(temp,{recursive:true,force:true})}
},60000)
