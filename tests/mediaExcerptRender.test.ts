import {it,expect} from 'vitest'
import {spawn,execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {mkdtemp,mkdir,readFile,realpath,rm} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {createProject,parseProject} from '../src/core/project'
import {importProbedMedia} from '../src/core/mediaImport'
import {MediaExcerptPlacement} from '../src/core/mediaExcerpt'
import {createRenderPlan,projectFormatPreset} from '../src/core/render'
import {WorkerClient} from '../src/core/workerClient'
import {defaultLoudnessNormalization} from '../src/core/audioLoudness'
const exec=promisify(execFile),run=async(program:string,args:string[])=>(await exec(program,args,{encoding:'buffer',maxBuffer:4*1024**2})).stdout
it('actual selected red/blue source interval renders at 2x with exact placement and explicit audio, leaving the source unchanged',async context=>{
 try{await run('ffmpeg',['-version']);await run('ffprobe',['-version'])}catch(cause){if(process.env.CI)throw cause;context.skip('FFmpeg required');return}
 const temp=await mkdtemp(path.join(os.tmpdir(),'kinaou-excerpt-render-'));await mkdir(path.join(temp,'KINAOU/Assets'),{recursive:true});const root=await realpath(path.join(temp,'KINAOU')),source=path.join(root,'Assets/source.mp4')
 const child=spawn(process.execPath,[path.resolve('worker/mac-worker.mjs')],{env:{PATH:process.env.PATH,KINAOU_MANAGED_ROOT:root,KINAOU_WORKER_PORT:'44016',KINAOU_WORKER_TOKEN:'excerpt-render-only'},stdio:['ignore','pipe','pipe']});let logs='';child.stdout.on('data',d=>{logs+=d});child.stderr.on('data',d=>{logs+=d})
 try{
  await run('ffmpeg',['-v','error','-f','lavfi','-i','color=red:size=160x90:rate=30:duration=1','-f','lavfi','-i','color=blue:size=160x90:rate=30:duration=1','-f','lavfi','-i','sine=frequency=440:duration=2','-filter_complex','[0:v][1:v]concat=n=2:v=1:a=0[v]','-map','[v]','-map','2:a','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac',source]);const bytes=await readFile(source)
  const deadline=Date.now()+15000;while(!logs.includes('listening on http://127.0.0.1:44016')){if(child.exitCode!==null||Date.now()>deadline)throw Error(logs);await new Promise(r=>setTimeout(r,30))}
  const client=new WorkerClient({baseUrl:'http://127.0.0.1:44016',token:'excerpt-render-only'}),base=parseProject({...createProject('Synthetic excerpt render'),tracks:[{id:'v',name:'Video',type:'video',clips:[]}]}),project=importProbedMedia(base,{kind:'video',name:'Red blue tone',managedPath:'KINAOU/Assets/source.mp4',probe:await client.probe('KINAOU/Assets/source.mp4')})
  expect((await client.health()).capabilities).toContain('embedded-video-audio')
  for(const [includeAudio,normalize] of [[false,false],[true,false],[true,true]]){
   const placement=new MediaExcerptPlacement(project,{assetId:project.assets[0].id,trackId:'v',sourceInMs:500,sourceOutMs:1500,timelineInMs:500,speed:2,includeAudio}),next=placement.commit(project,'',true,()=>{},()=>{}),output=`KINAOU/Renders/excerpt-${includeAudio}-${normalize}.mp4`,plan=createRenderPlan(next,projectFormatPreset(next,'landscape','preview'),output,{loudnessNormalization:{...defaultLoudnessNormalization,enabled:normalize}})
   if(!includeAudio){const malformed=structuredClone(plan);(malformed.clips[0] as any).embeddedAudio='yes';await expect(client.startRender(malformed)).rejects.toThrow(/Embedded/)}
   let job=await client.startRender(plan);for(let n=0;n<300&&['queued','running'].includes(job.state);n++){await new Promise(r=>setTimeout(r,30));job=await client.renderStatus(job.id)}expect(job.state,job.error).toBe('succeeded')
   const file=path.join(root,output.slice('KINAOU/'.length)),pixel=async(t:string)=>run('ffmpeg',['-v','error','-ss',t,'-i',file,'-vf','scale=1:1','-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','-'])
   const black=await pixel('0.2'),red=await pixel('0.6'),blue=await pixel('0.9');expect(Math.max(...black)).toBeLessThan(20);expect(red[0]).toBeGreaterThan(200);expect(red[2]).toBeLessThan(30);expect(blue[2]).toBeGreaterThan(200);expect(blue[0]).toBeLessThan(30)
   const measured=await client.probe(output);expect(Math.abs(measured.durationMs!-1000)).toBeLessThan(100)
   if(measured.audioCodec){const pcm=await run('ffmpeg',['-v','error','-i',file,'-vn','-ac','1','-ar','8000','-f','s16le','-']);let sum=0;const from=4800,to=6400;for(let n=from;n<to&&n*2<pcm.length;n++)sum+=(pcm.readInt16LE(n*2)/32768)**2;const rms=Math.sqrt(sum/(to-from));expect(pcm.length,(await run('ffprobe',['-v','error','-show_streams','-of','json',file])).toString()).toBeGreaterThan(to*2);if(includeAudio)expect(rms).toBeGreaterThan(0.02);else expect(rms).toBeLessThan(0.001);let early=0;for(let n=800;n<2400;n++)early+=(pcm.readInt16LE(n*2)/32768)**2;expect(Math.sqrt(early/1600)).toBeLessThan(0.002)}else expect(includeAudio).toBe(false)
  }
  const silent=path.join(root,'Assets/silent.mp4');await run('ffmpeg',['-v','error','-i',source,'-an','-c:v','copy',silent])
  const withoutAudio=importProbedMedia(base,{kind:'video',name:'Actual silent source',managedPath:'KINAOU/Assets/silent.mp4',probe:await client.probe('KINAOU/Assets/silent.mp4')}),silentPlacement=new MediaExcerptPlacement(withoutAudio,{assetId:withoutAudio.assets[0].id,trackId:'v',sourceInMs:0,sourceOutMs:1000,timelineInMs:0,speed:1,includeAudio:true}),silentNext=silentPlacement.commit(withoutAudio,'',true,()=>{},()=>{})
  let missingAudio=await client.startRender(createRenderPlan(silentNext,projectFormatPreset(silentNext,'landscape','preview'),'KINAOU/Renders/missing-original-audio.mp4'));for(let n=0;n<300&&['queued','running'].includes(missingAudio.state);n++){await new Promise(r=>setTimeout(r,30));missingAudio=await client.renderStatus(missingAudio.id)}expect(missingAudio.state).toBe('failed');expect(missingAudio.error).toBeTruthy()
  expect(await readFile(source)).toEqual(bytes);expect(project.tracks[0].clips).toEqual([])
 }finally{child.kill('SIGKILL');await new Promise<void>(resolve=>{child.on('close',()=>resolve());setTimeout(resolve,3000).unref()});await rm(temp,{recursive:true,force:true})}
},60000)
