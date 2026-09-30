import {it,expect} from 'vitest'
import {execFile,spawn} from 'node:child_process'
import {createHash} from 'node:crypto'
import {promisify} from 'node:util'
import {mkdir,mkdtemp,readFile,readdir,rm} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {createProject} from '../src/core/project'
import {createRenderPlan,preview1080pPreset} from '../src/core/render'
import {WorkerClient} from '../src/core/workerClient'
import {AssetImportSession,type AssetImportFeedback} from '../src/core/assetImportSession'
import {parseExplainerCard,explainerDimensions,layoutExplainerCard} from '../src/core/explainerCard'
import {parseExplainerReveal,explainerRevealDuration,validateExplainerRevealProbe,placeExplainerReveal} from '../src/core/explainerReveal'
import fixtures from './fixtures/explainer-reveals.json'
const exec=promisify(execFile),run=async(command:string,args:string[])=>(await exec(command,args,{encoding:'buffer',maxBuffer:96*1024**2})).stdout
it('imports three actual browser-encoded reveal videos, retries only save, then proves cumulative fade timing in decoded FFmpeg output',async context=>{
  try{await run('ffmpeg',['-version']);await run('ffprobe',['-version'])}catch(cause){if(process.env.CI)throw cause;context.skip('FFmpeg required');return}
  const cards=JSON.parse(await readFile('tests/fixtures/explainer-cards.json','utf8')) as Array<{card:unknown}>
  const temp=await mkdtemp(path.join(os.tmpdir(),'kinaou-reveal-render-')),root=path.join(temp,'KINAOU');await mkdir(root)
  const child=spawn(process.execPath,[path.resolve('worker/mac-worker.mjs')],{env:{PATH:process.env.PATH,KINAOU_MANAGED_ROOT:root,KINAOU_WORKER_PORT:'43997',KINAOU_WORKER_TOKEN:'reveal-render-test-only'},stdio:['ignore','pipe','pipe']})
  const closed=new Promise<void>(resolve=>child.once('close',()=>resolve()));let logs='',spawnError:Error|undefined
  child.on('error',error=>{spawnError=error});child.stdout.on('data',value=>{logs+=value});child.stderr.on('data',value=>{logs+=value})
  try{
    const deadline=Date.now()+15000
    while(!logs.includes('listening on http://127.0.0.1:43997')){if(spawnError||child.exitCode!==null||child.signalCode!==null||Date.now()>deadline)throw Error(spawnError?.message??logs);await new Promise(r=>setTimeout(r,30))}
    const client=new WorkerClient({baseUrl:'http://127.0.0.1:43997',token:'reveal-render-test-only'})
    for(let index=0;index<cards.length;index++){
      const card=parseExplainerCard(cards[index].card),value=parseExplainerReveal({schemaVersion:1,sourceAssetId:'card-'+index,card,stepMs:(index+1)*1000}),fileName=`explainer-reveal-${card.format}.ivf`,bytes=await readFile('tests/fixtures/'+fileName),hash=createHash('sha256').update(bytes).digest('hex'),duration=explainerRevealDuration(value)
      expect(fixtures[index]).toEqual({format:card.format,sourceAssetId:value.sourceAssetId,stepMs:value.stepMs,durationMs:duration,sizeBytes:bytes.length,sha256:hash})
      const events:AssetImportFeedback[]=[],counts={uploads:0,probes:0,snapshots:0};let project=createProject('Reveal '+card.format),fail=true
      const task=new AssetImportSession(project,'isolated',new File([new Uint8Array(bytes)],fileName,{type:'video/x-ivf'}),'video',{
        client:{importAsset:(blob,name)=>{counts.uploads++;return client.importAsset(blob,name)},probe:async path=>{counts.probes++;return validateExplainerRevealProbe(await client.probe(path),value)}},
        assetMetadata:{sourceKind:'authored-explainer-reveal-v1',authored:true,illustrationOnly:true,renderer:'canvas-vp8-reveal-v1',reveal:value},environment:()=>({project,connection:'isolated'}),snapshot:()=>{counts.snapshots++},persist:next=>{if(fail)throw Error('Synthetic persistence failure');project=next},publish:e=>events.push(e)
      })
      await task.run();expect(events.at(-1)?.phase).toBe('saveFailed');fail=false;await task.run();await task.run();expect(events.at(-1)?.phase).toBe('succeeded');expect(counts).toEqual({uploads:1,probes:1,snapshots:1})
      project=placeExplainerReveal(project,project.assets[0].id,'Authored reveal');expect(project.tracks[0].clips[0].durationMs).toBe(duration)
      const [sw,sh]=explainerDimensions[card.format],width=sw/5,height=sh/5,output=`KINAOU/Renders/${card.format}.mp4`
      let job=await client.startRender(createRenderPlan(project,{...preview1080pPreset,width,height,fps:25,fit:'contain'},output))
      for(let n=0;n<500&&['queued','running'].includes(job.state);n++){await new Promise(r=>setTimeout(r,30));job=await client.renderStatus(job.id)}
      expect(job.state,job.error).toBe('succeeded')
      const outputFile=path.join(temp,output),info=JSON.parse((await run('ffprobe',['-v','error','-show_streams','-show_format','-of','json',outputFile])).toString())
      expect(info.streams).toHaveLength(1);expect(info.streams[0]).toMatchObject({codec_name:'h264',width,height,r_frame_rate:'25/1'});expect(Number(info.format.duration)*1000).toBe(duration)
      const actual=await run('ffmpeg',['-v','error','-i',outputFile,'-f','rawvideo','-pix_fmt','rgb24','-']),frameSize=width*height*3
      expect(actual.length/frameSize).toBe(duration/40)
      const pixel=(frame:number,x:number,y:number)=>[...actual.subarray(frame*frameSize+(y*width+x)*3,frame*frameSize+(y*width+x)*3+3)]
      const rows=layoutExplainerCard(card,text=>text.length*10).rects.filter(r=>r.step!==undefined),last=duration/40-1
      for(const row of rows){
        const start=(1000+row.step!*value.stepMs)/40,x=Math.floor((row.x+row.width-40)/5),y=Math.floor((row.y+12)/5),initial=pixel(0,x,y),before=pixel(start-1,x,y),half=pixel(start+3,x,y),full=pixel(start+8,x,y),final=pixel(last,x,y)
        const diff=(a:number[],b:number[])=>a.reduce((sum,c,i)=>sum+Math.abs(c-b[i]),0)/3
        expect(diff(initial,before)).toBeLessThan(3);expect(diff(initial,final)).toBeGreaterThan(6);expect(diff(full,final)).toBeLessThan(3)
        expect(diff(half,initial)).toBeGreaterThan(2);expect(diff(half,final)).toBeGreaterThan(2);expect(diff(half,initial.map((c,i)=>(c+final[i])/2))).toBeLessThan(4)
      }
      // Full last frame still matches the real static card, including text, not just rectangles.
      const staticFrame=await run('ffmpeg',['-v','error','-i',`tests/fixtures/explainer-${card.format}.png`,'-vf',`scale=${width}:${height},format=yuv420p`,'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','-'])
      const final=actual.subarray(last*frameSize,(last+1)*frameSize);let error=0,textError=0,textPixels=0
      for(let p=0;p<final.length;p+=3){const delta=Math.abs(final[p]-staticFrame[p])+Math.abs(final[p+1]-staticFrame[p+1])+Math.abs(final[p+2]-staticFrame[p+2]);error+=delta;const light=(staticFrame[p]+staticFrame[p+1]+staticFrame[p+2])/3;if(card.theme==='indigo'?light>140:light<140){textPixels++;textError+=delta}}
      expect(error/final.length).toBeLessThan(8);expect(textPixels).toBeGreaterThan(200);expect(textError/(textPixels*3)).toBeLessThan(24)
      expect(createHash('sha256').update(await readFile(path.join(temp,project.assets[0].uri))).digest('hex')).toBe(hash)
    }
    expect(await readdir(path.join(root,'Assets'))).toHaveLength(3)
  }finally{child.kill('SIGKILL');await closed;await rm(temp,{recursive:true,force:true})}
},60000)
