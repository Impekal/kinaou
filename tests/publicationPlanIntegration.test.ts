import { it, expect } from 'vitest'
import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, mkdtemp, stat, writeFile, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { createProject, parseProject } from '../src/core/project'
import { createRenderPlan, preview1080pPreset } from '../src/core/render'
import { WorkerClient } from '../src/core/workerClient'
import { recordSuccessfulExport } from '../src/core/exportHistory'
import { reviewPublicationPlan, applyPublicationPlan, projectPublicationPlan, publicationPlanCalendar, publicationPlanDraftFromSaved } from '../src/core/publicationPlan'
const exec=promisify(execFile)
it('binds actually rendered main/vertical exports to a saved plan and a real local calendar file without scheduling an upload',async context=>{
  try{await exec('ffmpeg',['-version']);await exec('ffprobe',['-version'])}catch(cause){if(process.env.CI)throw cause;context.skip('FFmpeg required');return}
  const temp=await mkdtemp(path.join(os.tmpdir(),'kinaou-publication-render-')),root=path.join(temp,'KINAOU')
  let worker:ChildProcess|undefined
  try{
    await mkdir(path.join(root,'Assets'),{recursive:true})
    await exec('ffmpeg',['-v','error','-f','lavfi','-i','color=blue:size=160x90:rate=25:duration=1','-c:v','libx264','-pix_fmt','yuv420p',path.join(root,'Assets','source.mp4')])
    let project=parseProject({...createProject('Real export scheduling fixture'),assets:[{id:'video',kind:'video',uri:'KINAOU/Assets/source.mp4',managed:true,metadata:{durationMs:1000}}],tracks:[{id:'v',type:'video',name:'Source',clips:[{id:'clip',assetId:'video',startMs:0,durationMs:1000}]}]})
    worker=spawn(process.execPath,[path.resolve('worker/mac-worker.mjs')],{env:{PATH:process.env.PATH,KINAOU_MANAGED_ROOT:root,KINAOU_WORKER_TOKEN:'publication-test-only',KINAOU_WORKER_PORT:'43973'},stdio:['ignore','pipe','pipe']})
    let logs='';worker.stdout!.on('data',v=>{logs+=v});worker.stderr!.on('data',v=>{logs+=v});const deadline=Date.now()+15000
    while(!logs.includes('listening on http://127.0.0.1:43973')){if(worker.exitCode!==null||Date.now()>deadline)throw Error(logs);await new Promise(done=>setTimeout(done,30))}
    const client=new WorkerClient({baseUrl:'http://127.0.0.1:43973',token:'publication-test-only'}),ids:string[]=[]
    for(const format of ['landscape','vertical'] as const){
      const outputRelativePath='KINAOU/Renders/'+format+'.mp4',preset={...preview1080pPreset,width:format==='landscape'?320:180,height:format==='landscape'?180:320}
      let job=await client.startRender(createRenderPlan(project,preset,outputRelativePath))
      for(let i=0;i<200&&['queued','running'].includes(job.state);i++){await new Promise(done=>setTimeout(done,30));job=await client.renderStatus(job.id)}
      expect(job.state,job.error).toBe('succeeded')
      const file=path.join(temp,outputRelativePath),probe=JSON.parse((await exec('ffprobe',['-v','error','-show_streams','-of','json',file])).stdout)
      expect(probe.streams.find((s:{codec_type:string})=>s.codec_type==='video')).toMatchObject({width:preset.width,height:preset.height})
      project=recordSuccessfulExport(project,{jobId:job.id,label:format+' actual export',outputRelativePath,format,range:{inMs:0,outMs:1000},durationMs:1000,sizeBytes:(await stat(file)).size,sceneIds:[],completedAt:new Date().toISOString()});ids.push(job.id)
    }
    const before=JSON.stringify(project),now=new Date('2026-09-27T00:00:00.000Z'),draft={mainJobId:ids[0],shorts:[{jobId:ids[1],offsetHours:24}],mainLocal:'2026-10-24T18:00',timeZone:'Europe/Berlin',targetMarket:'DE',rationale:'Synthetic rendered-file workflow check, not audience advice'}
    const saved=applyPublicationPlan(project,reviewPublicationPlan(project,draft,now),true,now),json=path.join(temp,'project.json')
    await writeFile(json,JSON.stringify(saved));const restored=parseProject(JSON.parse(await readFile(json,'utf8'))),plan=projectPublicationPlan(restored)!
    expect(publicationPlanDraftFromSaved(restored)).toEqual(draft);expect(JSON.stringify(project)).toBe(before)
    const calendar=publicationPlanCalendar(plan,{main:'Main video',short:'Short',warning:'Local timing experiment; no platform scheduling'}),ics=path.join(temp,'publication.ics')
    await writeFile(ics,calendar);expect(await readFile(ics,'utf8')).toBe(calendar)
    const lines=calendar.replace(/\r\n /g,'').split('\r\n')
    expect(lines.filter(line=>line.startsWith('DTSTART:'))).toEqual(['DTSTART:20261024T160000Z','DTSTART:20261025T160000Z'])
    expect(lines.filter(line=>line==='BEGIN:VEVENT')).toHaveLength(2)
    for(const event of plan.events)expect((await stat(path.join(temp,event.receipt.outputRelativePath))).size).toBe(event.receipt.sizeBytes)
  }finally{
    worker?.kill('SIGKILL');if(worker&&worker.exitCode===null&&worker.signalCode===null)await new Promise<void>(done=>{worker!.once('close',()=>done());setTimeout(done,3000).unref()})
    await rm(temp,{recursive:true,force:true})
  }
},60000)
