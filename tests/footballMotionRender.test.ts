import {it,expect} from 'vitest'
import {execFile,spawn} from 'node:child_process'
import {createHash} from 'node:crypto'
import {promisify} from 'node:util'
import {mkdtemp,mkdir,readFile,rm} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {createProject} from '../src/core/project'
import {parseFootballMotion,footballMotionFrame,placeFootballMotion,validateFootballMotionProbe} from '../src/core/footballMotion'
import {WorkerClient} from '../src/core/workerClient'
import {AssetImportSession,type AssetImportFeedback} from '../src/core/assetImportSession'
import {createRenderPlan,preview1080pPreset} from '../src/core/render'
const exec=promisify(execFile),run=async(program:string,args:string[])=>(await exec(program,args,{encoding:'buffer',maxBuffer:8*1024**2})).stdout
it('imports a real browser-encoded 50-frame animation and verifies moving player/ball pixels in an actual timeline export',async context=>{
  try{await run('ffmpeg',['-version']);await run('ffprobe',['-version'])}catch(cause){if(process.env.CI)throw cause;context.skip('FFmpeg required');return}
  const file=await readFile('tests/fixtures/football-motion.ivf'),motion=parseFootballMotion(JSON.parse(await readFile('tests/fixtures/football-motion.json','utf8')))
  expect(createHash('sha256').update(file).digest('hex')).toBe('a2d1936b5efc773a71da92b1cbff3ae29f33e064751365aec48d768cdae34dfc')
  const original=JSON.parse((await run('ffprobe',['-v','error','-count_frames','-show_streams','-show_format','-of','json','tests/fixtures/football-motion.ivf'])).toString())
  expect(original.streams[0]).toMatchObject({codec_name:'vp8',width:1920,height:1080,nb_read_frames:'50',r_frame_rate:'25/1'});expect(Number(original.format.duration)).toBe(2)
  const temp=await mkdtemp(path.join(os.tmpdir(),'kinaou-motion-render-')),root=path.join(temp,'KINAOU');await mkdir(root)
  const child=spawn(process.execPath,[path.resolve('worker/mac-worker.mjs')],{env:{PATH:process.env.PATH,KINAOU_MANAGED_ROOT:root,KINAOU_WORKER_PORT:'43978',KINAOU_WORKER_TOKEN:'motion-test-only'},stdio:['ignore','pipe','pipe']})
  let logs='';child.stdout.on('data',v=>{logs+=v});child.stderr.on('data',v=>{logs+=v})
  try{
    const deadline=Date.now()+15000;while(!logs.includes('listening on http://127.0.0.1:43978')){if(child.exitCode!==null||Date.now()>deadline)throw Error(logs);await new Promise(r=>setTimeout(r,30))}
    const client=new WorkerClient({baseUrl:'http://127.0.0.1:43978',token:'motion-test-only'}),events:AssetImportFeedback[]=[]
    let project=createProject('Original moving tactics'),fail=true,uploads=0,probes=0,snapshots=0
    const session=new AssetImportSession(project,'root',new File([new Uint8Array(file)],'motion.ivf',{type:'video/x-ivf'}),'video',{
      client:{importAsset:(blob,name)=>{uploads++;return client.importAsset(blob,name)},probe:async p=>{probes++;return validateFootballMotionProbe(await client.probe(p),motion.durationMs)}},assetMetadata:{sourceKind:'authored-football-motion-v1',motion,authored:true,illustrationOnly:true},environment:()=>({project,connection:'root'}),snapshot:()=>{snapshots++},persist:p=>{if(fail)throw Error('Fixture save failure');project=p},publish:e=>events.push(e)
    })
    await session.run();expect(events.at(-1)?.phase).toBe('saveFailed');fail=false;await session.run();await session.run();expect(events.at(-1)?.phase).toBe('succeeded');expect([uploads,probes,snapshots]).toEqual([1,1,1])
    expect(parseFootballMotion(project.assets[0].metadata.motion)).toEqual(motion)
    expect(await readFile(path.join(temp,project.assets[0].uri))).toEqual(file)
    project=placeFootballMotion(project,project.assets[0].id,'Authored movement')
    let job=await client.startRender(createRenderPlan(project,{...preview1080pPreset,width:960,height:540,fps:25,fit:'contain'},'KINAOU/Renders/motion.mp4'))
    for(let i=0;i<200&&['queued','running'].includes(job.state);i++){await new Promise(r=>setTimeout(r,30));job=await client.renderStatus(job.id)}
    expect(job.state,job.error).toBe('succeeded')
    const output=path.join(root,'Renders/motion.mp4'),probe=JSON.parse((await run('ffprobe',['-v','error','-count_frames','-show_streams','-show_format','-of','json',output])).toString())
    expect(Number(probe.format.duration)).toBe(2);expect(probe.streams[0].nb_read_frames).toBe('50')
    const count=(pixels:Buffer,x:number,y:number,predicate:(r:number,g:number,b:number)=>boolean)=>{let found=0;for(let yy=Math.round(y)-3;yy<=Math.round(y)+3;yy++)for(let xx=Math.round(x)-3;xx<=Math.round(x)+3;xx++){const i=(yy*960+xx)*3;if(predicate(pixels[i],pixels[i+1],pixels[i+2]))found++}return found}
    const blue=(r:number,g:number,b:number)=>b>130&&b>r*1.5&&b>g*1.2,white=(r:number,g:number,b:number)=>r>180&&g>180&&b>180
    for(const frame of [0,25,49]){
      const board=footballMotionFrame(motion,frame),pixels=await run('ffmpeg',['-v','error','-ss',String(frame/25),'-i',output,'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','-'])
      expect(pixels.length).toBe(960*540*3)
      const x=(value:number)=>(80+1760*value/100)/2,y=(value:number)=>(145+810*value/100)/2
      expect(count(pixels,x(board.players[0].x)-8,y(board.players[0].y),blue),`player frame ${frame}`).toBeGreaterThan(20)
      expect(count(pixels,x(board.ball.x)+5,y(board.ball.y),white),`ball frame ${frame}`).toBeGreaterThan(5)
      const other=footballMotionFrame(motion,frame===0?49:0)
      expect(count(pixels,x(other.players[0].x)-8,y(other.players[0].y),blue),`old player position frame ${frame}`).toBeLessThan(3)
    }
  }finally{child.kill('SIGKILL');await new Promise<void>(resolve=>{if(child.exitCode!==null||child.signalCode!==null)return resolve();child.once('close',()=>resolve());setTimeout(resolve,3000).unref()});await rm(temp,{recursive:true,force:true})}
},60000)
