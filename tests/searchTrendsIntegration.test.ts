import { it, expect } from 'vitest'
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { WorkerClient } from '../src/core/workerClient'
import { createProject, parseProject } from '../src/core/project'
import { retainSearchTrend, retainedSearchTrends } from '../src/core/searchTrends'
it('real authenticated worker route retrieves a bounded injected public fixture, retains and reloads it without leaking private content',async()=>{
  const temp=await mkdtemp(path.join(os.tmpdir(),'kinaou-trends-route-')),root=path.join(temp,'KINAOU'),trace=path.join(temp,'fetches.jsonl'),preload=path.join(temp,'preload.mjs')
  let child:ChildProcess|undefined
  try{
    await mkdir(root)
    // Process-local test loader only. Production has no configurable upstream URL or fixture switch.
    await writeFile(preload,`import {appendFileSync} from 'node:fs';globalThis.fetch=async(url,options)=>{if(!String(url).startsWith('https://trends.google.com/trending/rss?geo='))throw Error('Unexpected outbound request');appendFileSync(${JSON.stringify(trace)},JSON.stringify({url,options})+'\\n');return new Response('<rss xmlns:ht="https://trends.google.com/trending/rss"><channel><link>'+url+'</link><item><title>Offline integration example</title><pubDate>Sun, 27 Sep 2026 07:00:00 GMT</pubDate><ht:approx_traffic>200+</ht:approx_traffic></item></channel></rss>',{headers:{'content-type':'text/xml'}})}`)
    child=spawn(process.execPath,['--import',preload,path.resolve('worker/mac-worker.mjs')],{env:{PATH:process.env.PATH,KINAOU_MANAGED_ROOT:root,KINAOU_WORKER_TOKEN:'trends-test-only',KINAOU_WORKER_PORT:'43972'},stdio:['ignore','pipe','pipe']})
    let logs='';child.stdout!.on('data',v=>{logs+=v});child.stderr!.on('data',v=>{logs+=v})
    const deadline=Date.now()+15000
    while(!logs.includes('listening on http://127.0.0.1:43972')){if(child.exitCode!==null||Date.now()>deadline)throw Error(logs);await new Promise(done=>setTimeout(done,30))}
    const client=new WorkerClient({baseUrl:'http://127.0.0.1:43972',token:'trends-test-only'})
    expect((await client.health()).capabilities).toContain('public-search-trends')
    expect((await fetch('http://127.0.0.1:43972/research/search-trends',{method:'POST',body:'{"country":"DE"}'})).status).toBe(401)
    const bad=await fetch('http://127.0.0.1:43972/research/search-trends',{method:'POST',headers:{authorization:'Bearer trends-test-only','content-type':'application/json'},body:'{"country":"DE","url":"http://127.0.0.1"}'})
    expect(bad.ok).toBe(false);await expect(readFile(trace)).rejects.toThrow()
    const snapshot=await client.searchTrends({country:'DE'});expect(snapshot.items[0].query).toBe('Offline integration example')
    const project=createProject('PRIVATE_TEST_TITLE');project.script='PRIVATE_TEST_SCRIPT'
    const retained=retainSearchTrend(project,snapshot,0),file=path.join(temp,'project.json')
    await writeFile(file,JSON.stringify(retained));expect(retainedSearchTrends(parseProject(JSON.parse(await readFile(file,'utf8'))))[0]).toEqual(snapshot)
    expect(await client.searchTrends({country:'DE'})).toEqual(snapshot)
    const outbound=await readFile(trace,'utf8');expect(outbound.trim().split('\n')).toHaveLength(1);expect(outbound).not.toContain('PRIVATE_TEST');expect(outbound).not.toContain('trends-test-only')
  }finally{
    child?.kill('SIGKILL')
    if(child&&child.exitCode===null&&child.signalCode===null)await new Promise<void>(done=>{child!.once('close',()=>done());setTimeout(done,3000).unref()})
    await rm(temp,{recursive:true,force:true})
  }
},30000)
