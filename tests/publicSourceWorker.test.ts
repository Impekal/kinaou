import { it,expect } from 'vitest'
import { spawn } from 'node:child_process'
import { mkdtemp,mkdir,writeFile,readFile,rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { WorkerClient } from '../src/core/workerClient'

it('executing authenticated worker uses the bounded reader, no production fixture switches or private payload',async()=>{
 const temp=await mkdtemp(path.join(os.tmpdir(),'kinaou-public-reader-')),root=path.join(temp,'KINAOU'),preload=path.join(temp,'preload.mjs'),trace=path.join(temp,'requests.jsonl')
 await mkdir(root)
 // Synthetic process-local transport only; production always performs vetted DNS and HTTPS.
 await writeFile(preload,`import dns from 'node:dns/promises';import https from 'node:https';import {syncBuiltinESMExports} from 'node:module';import {PassThrough} from 'node:stream';import {EventEmitter} from 'node:events';import {appendFileSync} from 'node:fs';dns.lookup=async()=>[{address:'93.184.216.34',family:4}];https.request=(url,options,callback)=>{appendFileSync(${JSON.stringify(trace)},JSON.stringify({url:String(url),headers:options.headers,servername:options.servername})+'\\n');const request=new EventEmitter();request.end=()=>queueMicrotask(()=>{const response=new PassThrough();response.statusCode=200;response.headers={'content-type':'text/html; charset=utf-8'};callback(response);response.end('<html lang="fr"><title>Explicit synthetic fixture</title><article><p>Un triangle a trois côtés.</p><script>never execute()</script></article></html>')});return request};syncBuiltinESMExports();`)
 const child=spawn(process.execPath,['--import',preload,path.resolve('worker/mac-worker.mjs')],{env:{PATH:process.env.PATH,KINAOU_MANAGED_ROOT:root,KINAOU_WORKER_TOKEN:'source-reader-test-only',KINAOU_WORKER_PORT:'43987'},stdio:['ignore','pipe','pipe']}),closed=new Promise<void>(resolve=>child.once('close',()=>resolve()));let logs='',spawnError:Error|undefined;child.on('error',e=>{spawnError=e});child.stdout.on('data',s=>{logs+=s});child.stderr.on('data',s=>{logs+=s})
 try {
  const deadline=Date.now()+15000;while(!logs.includes('listening on http://127.0.0.1:43987')){if(spawnError||child.exitCode!==null||Date.now()>deadline)throw Error(logs||String(spawnError));await new Promise(r=>setTimeout(r,30))}
  const endpoint='http://127.0.0.1:43987/research/source/read',headers={authorization:'Bearer source-reader-test-only','content-type':'application/json'},client=new WorkerClient({baseUrl:'http://127.0.0.1:43987',token:'source-reader-test-only'})
  expect((await fetch(endpoint,{method:'POST',body:'{}'})).status).toBe(401)
  for(const body of [{url:'https://127.0.0.1'},{url:'https://example.org',privateScript:'SECRET'}])expect((await fetch(endpoint,{method:'POST',headers,body:JSON.stringify(body)})).ok).toBe(false)
  await expect(readFile(trace)).rejects.toThrow()
  const result=await client.readPublicSource({url:'https://example.org/article'});expect(result.text).toBe('Un triangle a trois côtés.');expect(result.verified).toBe(false);expect(result.declaredLanguage).toBe('fr');expect(result.htmlSha256).toMatch(/^[a-f0-9]{64}$/)
  await expect(client.readPublicSource({url:'https://example.org/article'})).rejects.toThrow(/5 seconds/)
  const outbound=await readFile(trace,'utf8');expect(outbound.trim().split('\n')).toHaveLength(1);expect(outbound).not.toContain('SECRET');expect(outbound).not.toContain('source-reader-test-only');expect(outbound).not.toContain('authorization');expect(outbound).not.toContain('cookie')
 }finally{child.kill('SIGTERM');await closed;await rm(temp,{recursive:true,force:true})}
},30000)
