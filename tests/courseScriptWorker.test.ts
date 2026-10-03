import { it, expect } from 'vitest'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { WorkerClient } from '../src/core/workerClient'

it('executes the authenticated worker route against a clearly synthetic local model server, without downloads or project writes', async () => {
 const context={schemaVersion:1,courseId:'course',lessonId:'lesson',revision:1,language:'en',courseTitle:'Shapes',lessonTitle:'Triangle',audience:'Beginners',objective:'Explain',sourceNotes:'A triangle has three sides.'},proposal={paragraphs:[{text:'A triangle has three sides.',sourceQuote:'A triangle has three sides.'}]}
 let remote=false;const requests:string[]=[]
 const model=createServer(async(req,res)=>{requests.push(req.url!);let raw='';for await(const part of req)raw+=part;res.setHeader('content-type','application/json');if(req.url==='/api/tags')res.end(JSON.stringify({models:[{model:'test-local',size:1}]}));else if(req.url==='/api/show')res.end(JSON.stringify(remote?{remote_host:'https://blocked.example'}:{model_info:{'general.architecture':'synthetic-test'}}));else if(req.url==='/api/generate'){expect(JSON.parse(raw).model).toBe('test-local');res.end(JSON.stringify({response:JSON.stringify(proposal)}))}else{res.statusCode=404;res.end('{}')}})
 await new Promise<void>(resolve=>model.listen(0,'127.0.0.1',resolve));const address=model.address() as {port:number},temp=await mkdtemp(path.join(os.tmpdir(),'kinaou-script-worker-')),root=path.join(temp,'KINAOU');await mkdir(root)
 const child=spawn(process.execPath,[path.resolve('worker/mac-worker.mjs')],{env:{PATH:process.env.PATH,KINAOU_MANAGED_ROOT:root,KINAOU_WORKER_PORT:'43989',KINAOU_WORKER_TOKEN:'script-route-test-only',KINAOU_OLLAMA_URL:`http://127.0.0.1:${address.port}`},stdio:['ignore','pipe','pipe']}),closed=new Promise<void>(resolve=>child.once('close',()=>resolve()));let logs='',spawnError:Error|undefined;child.on('error',e=>{spawnError=e});child.stdout.on('data',s=>{logs+=s});child.stderr.on('data',s=>{logs+=s})
 try {
  const deadline=Date.now()+15000;while(!logs.includes('listening on http://127.0.0.1:43989')){if(spawnError||child.exitCode!==null||child.signalCode!==null||Date.now()>deadline)throw Error(spawnError?.message??logs);await new Promise(r=>setTimeout(r,30))}
  const client=new WorkerClient({baseUrl:'http://127.0.0.1:43989',token:'script-route-test-only'}),before=requests.length
  const unauthorized=await fetch('http://127.0.0.1:43989/course/script/generate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model:'test-local',context})});expect(unauthorized.status).toBe(401);expect(requests).toHaveLength(before)
  await expect(client.generateCourseScript('test-local',{...context,sourceNotes:''})).rejects.toThrow();expect(requests).toHaveLength(before)
  await expect(client.generateCourseScript('not-installed',context)).rejects.toThrow('not installed');expect(requests.slice(before)).toEqual(['/api/tags'])
  const result=await client.generateCourseScript('test-local',context);expect(result).toEqual({proposal,modelId:'test-local',adapterId:'ollama'});expect(requests.slice(-3)).toEqual(['/api/tags','/api/show','/api/generate'])
  remote=true;const count=requests.length;await expect(client.generateCourseScript('test-local',context)).rejects.toThrow('remote or unknown');expect(requests.slice(count)).toEqual(['/api/tags','/api/show'])
  expect(requests.every(route=>['/api/tags','/api/show','/api/generate'].includes(route))).toBe(true)
 } finally {child.kill('SIGKILL');await closed;await new Promise<void>(resolve=>model.close(()=>resolve()));await rm(temp,{recursive:true,force:true})}
},30000)
