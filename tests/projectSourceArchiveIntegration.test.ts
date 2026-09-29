import { it, expect } from 'vitest'
import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createProject, parseProject } from '../src/core/project'
import { newCourseOutline, saveCourseOutline, projectCourse } from '../src/core/course'
import { createRenderPlan, preview1080pPreset } from '../src/core/render'
import { reviewProjectSourceArchive, useProjectSourceArchiveReview } from '../src/core/projectSourceArchive'
import { WorkerClient } from '../src/core/workerClient'
import { prepareSourceRestore } from '../src/core/projectSourceRestore'
const exec = promisify(execFile)
const run = async (command: string, args: string[]) => (await exec(command,args,{encoding:'buffer',maxBuffer:4*1024**2})).stdout
it('archives real media, restores an independent copy over authenticated routes, and renders without originals or archive access',async context=>{
  try { await run('ffmpeg',['-version']); await run('ffprobe',['-version']) } catch(cause) { if(process.env.CI)throw cause;context.skip('FFmpeg required');return }
  const temp=await mkdtemp(path.join(os.tmpdir(),'kinaou-source-render-')),root=path.join(temp,'KINAOU'),workers:ChildProcess[]=[]
  async function worker(managed: string, port: number) {
    const child=spawn(process.execPath,[path.resolve('worker/mac-worker.mjs')],{env:{PATH:process.env.PATH,KINAOU_MANAGED_ROOT:managed,KINAOU_WORKER_TOKEN:'source-test-only',KINAOU_WORKER_PORT:String(port)},stdio:['ignore','pipe','pipe']});workers.push(child)
    let logs='';child.stdout!.on('data',value=>{logs+=value});child.stderr!.on('data',value=>{logs+=value})
    const deadline=Date.now()+15000
    while(!logs.includes('listening on http://127.0.0.1:'+port)){if(child.exitCode!==null||Date.now()>deadline)throw Error(logs);await new Promise(resolve=>setTimeout(resolve,30))}
    return new WorkerClient({baseUrl:'http://127.0.0.1:'+port,token:'source-test-only'})
  }
  try{
    await mkdir(path.join(root,'Assets'),{recursive:true})
    await run('ffmpeg',['-v','error','-f','lavfi','-i','color=blue:size=160x90:rate=25:duration=1','-f','lavfi','-i','sine=frequency=440:duration=1','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-shortest',path.join(root,'Assets','original.mp4')])
    const original=await readFile(path.join(root,'Assets','original.mp4'))
    await run('ffmpeg',['-v','error','-i',path.join(root,'Assets','original.mp4'),'-vn',path.join(root,'Assets','voice.wav')])
    const base=parseProject({...createProject('Archive integration'),assets:[{id:'video',kind:'video',uri:'KINAOU/Assets/original.mp4',managed:true,metadata:{durationMs:1000}},{id:'voice',kind:'audio',uri:'KINAOU/Assets/voice.wav',managed:true,metadata:{durationMs:1000}}],tracks:[{id:'v',type:'video',name:'Original',clips:[{id:'clip',assetId:'video',startMs:0,durationMs:1000}]},{id:'a',type:'voice',name:'Voice',clips:[{id:'speech',assetId:'voice',startMs:0,durationMs:1000}]}]})
    const project=saveCourseOutline(base,{...newCourseOutline(base),language:'fr',modules:[{id:'module',title:'Module',lessons:[{id:'lesson',title:'Original lesson',objective:'',script:'Private retained lesson script',range:{inMs:0,outMs:1000}}]}]})
    const before=JSON.stringify(project),client=await worker(root,43954),review=await reviewProjectSourceArchive(project),request=useProjectSourceArchiveReview(project,review,true)
    expect((await client.listProjectSourceArchives({})).entries).toEqual([])
    let job=await client.startProjectSourceArchive(request)
    for(let i=0;i<200&&['queued','copying'].includes(job.state);i++){await new Promise(resolve=>setTimeout(resolve,25));job=await client.projectSourceArchiveStatus(request)}
    expect(job.state,job.error).toBe('ready')
    const rediscovered = await new WorkerClient({ baseUrl: 'http://127.0.0.1:43954', token: 'source-test-only' }).listProjectSourceArchives({})
    expect(rediscovered.entries).toHaveLength(1); expect(rediscovered.entries[0].hasCompletionRecord).toBe(true)
    const retainedQuery = rediscovered.entries[0].query
    const verified = await client.projectSourceArchiveStatus(retainedQuery)
    expect(verified.result!.projectTitle).toBe(project.title)
    const restoreRequest = await prepareSourceRestore(verified, 'fr', true)
    let restoration = await client.startProjectSourceRestore(restoreRequest)
    for (let i = 0; i < 200 && ['queued','copying'].includes(restoration.state); i++) { await new Promise(resolve => setTimeout(resolve, 25)); restoration = await client.projectSourceRestoreStatus(restoreRequest) }
    expect(restoration.state, restoration.error).toBe('ready')
    expect((await client.startProjectSourceRestore(restoreRequest)).result!.directory).toBe(restoration.result!.directory)
    const archive=path.join(temp,job.result!.directory),archivedProject=parseProject(JSON.parse((await readFile(path.join(temp,restoration.result!.projectPath))).toString()))
    expect(archivedProject).toEqual(project);expect(projectCourse(archivedProject)?.modules[0].lessons[0].script).toBe('Private retained lesson script')
    expect(await readFile(path.join(archive,'source/KINAOU/Assets/original.mp4'))).toEqual(original)
    await rename(path.join(root,'Assets'),path.join(root,'TestHeldAssets'))
    expect((await client.projectSourceArchiveStatus(request)).state).toBe('ready')
    await rename(archive, archive + '-held')
    expect((await client.projectSourceRestoreStatus(restoreRequest)).state).toBe('ready')
    const restoredRoot = path.join(temp, restoration.result!.managedRoot)
    const restored=await worker(restoredRoot,43955)
    const reopenedEntry = (await restored.listProjectBackups()).find(entry => entry.path === 'KINAOU/Projects/project.json')
    expect(reopenedEntry?.title).toBe(project.title)
    const reopenedProject = parseProject(await restored.loadProjectBackup(reopenedEntry!.id))
    expect(reopenedProject).toEqual(project)
    let render=await restored.startRender(createRenderPlan(reopenedProject,{...preview1080pPreset,width:320,height:180},'KINAOU/Renders/restored-proof.mp4'))
    for(let i=0;i<200&&['queued','running'].includes(render.state);i++){await new Promise(resolve=>setTimeout(resolve,30));render=await restored.renderStatus(render.id)}
    expect(render.state,render.error).toBe('succeeded')
    const output=path.join(restoredRoot,'Renders/restored-proof.mp4')
    const probe=JSON.parse((await run('ffprobe',['-v','error','-show_format','-of','json',output])).toString());expect(Math.abs(Number(probe.format.duration)-1)).toBeLessThan(0.1)
    const pixel=await run('ffmpeg',['-v','error','-i',output,'-vf','scale=1:1','-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','-']);expect(pixel[2]).toBeGreaterThan(200)
    const samples=await run('ffmpeg',['-v','error','-i',output,'-t','0.1','-vn','-ac','1','-f','s16le','-']);let peak=0;for(let i=0;i+1<samples.length;i+=2)peak=Math.max(peak,Math.abs(samples.readInt16LE(i)));expect(peak).toBeGreaterThan(1000)
    await rename(path.join(root,'TestHeldAssets'),path.join(root,'Assets'))
    await rename(archive + '-held', archive)
    expect(await readFile(path.join(root,'Assets','original.mp4'))).toEqual(original);expect(JSON.stringify(project)).toBe(before)
    for(const action of ['start','status','list'])expect((await fetch('http://127.0.0.1:43954/projects/source-archive/'+action,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(request)})).status).toBe(401)
    for(const action of ['start','status'])expect((await fetch('http://127.0.0.1:43954/projects/source-restore/'+action,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(restoreRequest)})).status).toBe(401)
    await expect(client.projectSourceRestoreStatus({ ...restoreRequest, evidenceSha256: '0'.repeat(64) })).rejects.toThrow()
    await expect(client.projectSourceArchiveStatus({...request,projectId:'wrong-project'})).rejects.toThrow()
    const manifestBefore = await readFile(path.join(archive, 'manifest.json'))
    await writeFile(path.join(archive,'source/KINAOU/Assets/original.mp4'),Buffer.alloc(original.length,31))
    expect((await client.listProjectSourceArchives({})).entries[0].hasCompletionRecord).toBe(true)
    expect((await client.projectSourceArchiveStatus(retainedQuery)).state).toBe('integrityFailed')
    await writeFile(path.join(archive,'source/KINAOU/Assets/original.mp4'),original)
    expect((await client.projectSourceArchiveStatus(retainedQuery)).state).toBe('ready')
    expect(await readFile(path.join(archive, 'manifest.json'))).toEqual(manifestBefore)
    const restoredFile = path.join(restoredRoot, 'Assets/original.mp4')
    await writeFile(restoredFile, Buffer.alloc(original.length, 14))
    expect((await client.projectSourceRestoreStatus(restoreRequest)).state).toBe('integrityFailed')
    expect((await client.projectSourceArchiveStatus(retainedQuery)).state).toBe('ready')
  }finally{
    for(const child of workers)child.kill('SIGKILL')
    await Promise.all(workers.map(child=>new Promise<void>(resolve=>{if(child.exitCode!==null||child.signalCode!==null)return resolve();child.once('close',()=>resolve());setTimeout(resolve,3000).unref()})))
    await rm(temp,{recursive:true,force:true})
  }
},60000)
