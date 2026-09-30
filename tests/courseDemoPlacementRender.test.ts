import {it,expect} from 'vitest'
import {spawn,execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {createHash} from 'node:crypto'
import {mkdir,mkdtemp,readFile,copyFile,rm} from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import {createProject,parseProject} from '../src/core/project'
import {newCourseOutline,saveCourseOutline,planCourseLessonExport} from '../src/core/course'
import {reviewCourseDemoPlacement,commitCourseDemoPlacement} from '../src/core/courseDemoPlacement'
import {createRenderPlan,preview1080pPreset} from '../src/core/render'
import {WorkerClient} from '../src/core/workerClient'
import {courseProductionOverview} from '../src/core/courseProductionOverview'
import {prepareCourseGapPlacement,courseGapPlacementDraft} from '../src/core/courseGapPlacement'
import {parseDemoSeconds} from '../src/core/courseDemoPlacement'
const exec=promisify(execFile),run=async(cmd:string,args:string[])=>(await exec(cmd,args,{encoding:'buffer',maxBuffer:12*1024**2})).stdout
it('renders actual video-source trim and still evidence at lesson-relative times while preserving narration and muting demo audio',async context=>{
 try{await run('ffmpeg',['-version']);await run('ffprobe',['-version'])}catch(cause){if(process.env.CI)throw cause;context.skip('FFmpeg required');return}
 const temp=await mkdtemp(path.join(os.tmpdir(),'kinaou-course-demo-')),root=path.join(temp,'KINAOU'),assets=path.join(root,'Assets');await mkdir(assets,{recursive:true})
 const video=path.join(assets,'demo.mp4'),voice=path.join(assets,'voice.wav'),image=path.join(assets,'card.png')
 await run('ffmpeg',['-v','error','-f','lavfi','-i','testsrc2=size=160x90:rate=10:duration=4','-f','lavfi','-i','sine=frequency=880:sample_rate=48000:duration=4','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-shortest',video])
 await run('ffmpeg',['-v','error','-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=5','-c:a','pcm_s16le',voice]);await copyFile('tests/fixtures/explainer-landscape.png',image)
 const hash=async(file:string)=>createHash('sha256').update(await readFile(file)).digest('hex'),before=await Promise.all([video,voice,image].map(hash))
 const child=spawn(process.execPath,[path.resolve('worker/mac-worker.mjs')],{env:{PATH:process.env.PATH,KINAOU_MANAGED_ROOT:root,KINAOU_WORKER_PORT:'43998',KINAOU_WORKER_TOKEN:'course-demo-only'},stdio:['ignore','pipe','pipe']})
 const closed=new Promise<void>(resolve=>child.once('close',()=>resolve()));let logs='',spawnError:Error|undefined;child.on('error',e=>{spawnError=e});child.stdout.on('data',s=>{logs+=s});child.stderr.on('data',s=>{logs+=s})
 try{
  const deadline=Date.now()+15000;while(!logs.includes('listening on http://127.0.0.1:43998')){if(spawnError||child.exitCode!==null||child.signalCode!==null||Date.now()>deadline)throw Error(spawnError?.message??logs);await new Promise(r=>setTimeout(r,30))}
  const client=new WorkerClient({baseUrl:'http://127.0.0.1:43998',token:'course-demo-only'}),probe=await client.probe('KINAOU/Assets/demo.mp4')
  expect(probe).toMatchObject({durationMs:4000,videoCodec:'h264',audioCodec:'aac'})
  let p=parseProject({...createProject('Synthetic course demo'),assets:[{id:'video',kind:'video',managed:true,uri:'KINAOU/Assets/demo.mp4',metadata:{durationMs:probe.durationMs}},{id:'image',kind:'image',managed:true,uri:'KINAOU/Assets/card.png',metadata:{sourceKind:'authored-explainer-card-v1'}},{id:'voice',kind:'audio',managed:true,uri:'KINAOU/Assets/voice.wav',metadata:{durationMs:5000}}],tracks:[{id:'voice-track',type:'voice',name:'Narration',clips:[{id:'voice-clip',assetId:'voice',startMs:2000,durationMs:5000,sourceOffsetMs:0,gain:.8,speed:1}]}]})
  p=saveCourseOutline(p,{...newCourseOutline(p),modules:[{id:'module',title:'Module',lessons:[{id:'lesson',title:'Lesson',objective:'Test',range:{inMs:2000,outMs:7000},demonstrations:p.assets.slice(0,2).map(a=>({id:a.id,title:a.id,steps:'Synthetic',expected:'Synthetic',observed:'Not teaching acceptance',evidence:{assetId:a.id,kind:a.kind,uri:a.uri}}))}]}]})
  const original=structuredClone(p),snapshots:string[]=[];let failed=true
  const reviewed=reviewCourseDemoPlacement(p,{lessonId:'lesson',demoId:'video',lessonOffsetMs:1000,sourceOffsetMs:1000,durationMs:2000}),deps={snapshot:()=>{snapshots.push('snapshot')},persist:(next:typeof p)=>{if(failed)throw Error('synthetic save');p=next}}
  expect(()=>commitCourseDemoPlacement(p,reviewed,true,deps)).toThrow('synthetic save');failed=false;commitCourseDemoPlacement(p,reviewed,true,deps);expect(snapshots).toHaveLength(1)
  commitCourseDemoPlacement(p,reviewCourseDemoPlacement(p,{lessonId:'lesson',demoId:'image',lessonOffsetMs:3000,sourceOffsetMs:0,durationMs:1000}),true,deps)
  expect(p.tracks[0]).toEqual(original.tracks[0]);expect(p.metadata).toEqual(original.metadata);expect(p.assets).toEqual(original.assets)
  expect(courseProductionOverview(p)[0]).toMatchObject({visuals:{coveredMs:3000,gaps:[{startMs:0,endMs:1000},{startMs:4000,endMs:5000}]},voice:{coveredMs:5000,gaps:[]}})
  const chosen=prepareCourseGapPlacement(p,'lesson',courseProductionOverview(p)[0].visuals.gaps[0],'en'),draft=courseGapPlacementDraft(p,chosen,'en')
  expect(draft.demoId).toBe('');commitCourseDemoPlacement(p,reviewCourseDemoPlacement(p,{lessonId:draft.lessonId,demoId:'image',lessonOffsetMs:parseDemoSeconds(draft.offset),durationMs:parseDemoSeconds(draft.duration),sourceOffsetMs:0}),true,deps)
  expect(courseProductionOverview(p)[0].visuals).toMatchObject({coveredMs:4000,gaps:[{startMs:4000,endMs:5000}]})
  const output='KINAOU/Renders/lesson.mp4',full=createRenderPlan(p,{...preview1080pPreset,width:160,height:90,fps:10},output),plan=planCourseLessonExport(p,'lesson',full,output)
  let job=await client.startRender(plan.plan)
  for(let i=0;i<300&&['queued','running'].includes(job.state);i++){await new Promise(r=>setTimeout(r,30));job=await client.renderStatus(job.id)}
  expect(job.state,job.error).toBe('succeeded')
  const file=path.join(temp,output),info=JSON.parse((await run('ffprobe',['-v','error','-show_streams','-show_format','-of','json',file])).toString());expect(Number(info.format.duration)).toBe(5);expect(info.streams.map((s:any)=>s.codec_name)).toEqual(['h264','aac'])
  const raw=await run('ffmpeg',['-v','error','-i',file,'-f','rawvideo','-pix_fmt','rgb24','-']),frameSize=160*90*3
  expect(raw.length/frameSize).toBe(50)
  const frame=(i:number)=>raw.subarray(i*frameSize,(i+1)*frameSize),mean=(b:Buffer)=>b.reduce((s,v)=>s+v,0)/b.length
  expect(mean(frame(3))).toBeGreaterThan(10);expect(mean(frame(45))).toBeLessThan(3);expect(mean(frame(15))).toBeGreaterThan(20);expect(mean(frame(35))).toBeGreaterThan(10)
  expect(frame(3).reduce((sum,v,i)=>sum+Math.abs(v-frame(35)[i]),0)/frameSize).toBeLessThan(4)
  const reference=await run('ffmpeg',['-v','error','-ss','1.5','-i',video,'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','-'])
  expect(frame(15).reduce((sum,v,i)=>sum+Math.abs(v-reference[i]),0)/frameSize).toBeLessThan(12)
  const audio=await run('ffmpeg',['-v','error','-ss','1.5','-i',file,'-t','0.5','-ac','1','-ar','48000','-f','f32le','-'])
  const energy=(freq:number)=>{let real=0,imag=0;for(let i=0;i<audio.length/4;i++){const v=audio.readFloatLE(i*4),phase=2*Math.PI*freq*i/48000;real+=v*Math.cos(phase);imag+=v*Math.sin(phase)}return real*real+imag*imag}
  expect(energy(440)).toBeGreaterThan(energy(880)*1000)
  expect(await Promise.all([video,voice,image].map(hash))).toEqual(before)
 }finally{child.kill('SIGKILL');await closed;await rm(temp,{recursive:true,force:true})}
},60000)
