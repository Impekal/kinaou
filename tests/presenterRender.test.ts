import { expect, it } from 'vitest'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createProject, parseProject } from '../src/core/project'
import { commitPortraitPresenter } from '../src/core/portraitPresenter'
import { PersistentVersionHistory } from '../src/core/versioning'
import { createRenderPlan, preview1080pPreset } from '../src/core/render'
import { WorkerClient } from '../src/core/workerClient'

const exec = promisify(execFile)
it('saves and renders the full real recording with its still image, preserving source bytes and reversible history', async context => {
  try { await exec('ffmpeg',['-version']); await exec('ffprobe',['-version']) }
  catch(cause) { if(process.env.CI) throw cause; context.skip('FFmpeg required'); return }
  const root=await mkdtemp(path.join(os.tmpdir(),'kinaou-presenter-'))
  const managed=path.join(root,'KINAOU')
  await mkdir(path.join(managed,'Assets'),{recursive:true})
  const image=path.join(managed,'Assets/photo.png'), audio=path.join(managed,'Assets/recording.wav')
  const child=spawn(process.execPath,[path.resolve('worker/mac-worker.mjs')],{env:{PATH:process.env.PATH,KINAOU_MANAGED_ROOT:managed,KINAOU_WORKER_TOKEN:'presenter-test',KINAOU_WORKER_PORT:'43949'},stdio:['ignore','pipe','pipe']})
  const closed=new Promise<void>(resolve=>child.once('close',()=>resolve()))
  let logs=''
  child.stdout.on('data',data=>{logs+=data});child.stderr.on('data',data=>{logs+=data})
  try {
    await exec('ffmpeg',['-v','error','-f','lavfi','-i','color=blue:size=160x90','-frames:v','1',image])
    await exec('ffmpeg',['-v','error','-f','lavfi','-i','sine=frequency=440:duration=2.345','-c:a','pcm_s16le',audio])
    const originals=await Promise.all([readFile(image),readFile(audio)])
    const deadline=Date.now()+15000
    while(!logs.includes('listening on http://127.0.0.1:43949')) {
      if(child.exitCode!==null || Date.now()>deadline) throw new Error(logs)
      await new Promise(resolve=>setTimeout(resolve,30))
    }
    const project=parseProject({...createProject('Test tone, not speech quality'),assets:[
      {id:'photo',kind:'image',managed:true,uri:'KINAOU/Assets/photo.png',metadata:{generated:true,source:'test color'}},
      {id:'recording',kind:'audio',managed:true,uri:'KINAOU/Assets/recording.wav',metadata:{durationMs:2345,source:'test tone'}}
    ]})
    const data=new Map<string,string>()
    const history=new PersistentVersionHistory({getItem:key=>data.get(key)??null,setItem:(key,value)=>{data.set(key,value)},removeItem:key=>{data.delete(key)}})
    let saved=project
    const result=commitPortraitPresenter(project,{name:'Original name',portraitAssetId:'photo',narrationAssetId:'recording'},history,next=>{saved=parseProject(JSON.parse(JSON.stringify(next)))})
    expect(result.durationMs).toBe(2345)
    const plan=createRenderPlan(saved,preview1080pPreset,'KINAOU/Renders/presenter.mp4')
    const client=new WorkerClient({baseUrl:'http://127.0.0.1:43949',token:'presenter-test'})
    let job=await client.startRender(plan)
    const renderDeadline=Date.now()+20000
    while(['queued','running'].includes(job.state) && Date.now()<renderDeadline) {
      await new Promise(resolve=>setTimeout(resolve,50));job=await client.renderStatus(job.id)
    }
    expect(job.state,job.error).toBe('succeeded')
    const file=path.join(managed,'Renders/presenter.mp4')
    const probe=JSON.parse((await exec('ffprobe',['-v','error','-show_streams','-show_format','-of','json',file])).stdout)
    expect(Math.abs(Number(probe.format.duration)-2.345)).toBeLessThan(0.08)
    const streams=probe.streams as Array<{codec_type:string;duration:string}>
    expect(streams.map(stream=>stream.codec_type).sort()).toEqual(['audio','video'])
    expect(Math.abs(Number(streams.find(stream=>stream.codec_type==='audio')!.duration)-2.345)).toBeLessThan(0.08)
    expect(await readFile(image)).toEqual(originals[0]);expect(await readFile(audio)).toEqual(originals[1])
    const restored=history.restoreReversibly(saved,history.list(project.id)[0].id).project
    expect(restored.tracks).toEqual([])
    expect(restored.assets).toEqual(project.assets)
  } finally {
    child.kill('SIGKILL');await closed
    await rm(root,{recursive:true,force:true})
  }
},60000)
