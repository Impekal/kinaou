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
import {parseExplainerCard,validateExplainerProbe,placeExplainerOnNewTrack,explainerDimensions} from '../src/core/explainerCard'
const exec=promisify(execFile),run=async(command:string,args:string[])=>(await exec(command,args,{encoding:'buffer',maxBuffer:8*1024**2})).stdout
it('imports actual browser-produced explainer PNGs in three formats and preserves their pixels through real FFmpeg export',async context=>{
  try{await run('ffmpeg',['-version']);await run('ffprobe',['-version'])}catch(cause){if(process.env.CI)throw cause;context.skip('FFmpeg required');return}
  const fixtures=JSON.parse(await readFile('tests/fixtures/explainer-cards.json','utf8')) as Array<{file:string;sha256:string;card:unknown}>
  const temp=await mkdtemp(path.join(os.tmpdir(),'kinaou-explainer-render-')),root=path.join(temp,'KINAOU');await mkdir(root)
  const child=spawn(process.execPath,[path.resolve('worker/mac-worker.mjs')],{env:{PATH:process.env.PATH,KINAOU_MANAGED_ROOT:root,KINAOU_WORKER_PORT:'43996',KINAOU_WORKER_TOKEN:'explainer-render-test-only'},stdio:['ignore','pipe','pipe']})
  const closed=new Promise<void>(resolve=>child.once('close',()=>resolve()));let logs='',spawnError:Error|undefined
  child.on('error',error=>{spawnError=error});child.stdout.on('data',value=>{logs+=value});child.stderr.on('data',value=>{logs+=value})
  try{
    const deadline=Date.now()+15000
    while(!logs.includes('listening on http://127.0.0.1:43996')){if(spawnError||child.exitCode!==null||child.signalCode!==null||Date.now()>deadline)throw Error(spawnError?.message??logs);await new Promise(r=>setTimeout(r,30))}
    const client=new WorkerClient({baseUrl:'http://127.0.0.1:43996',token:'explainer-render-test-only'})
    for(const fixture of fixtures){
      const bytes=await readFile('tests/fixtures/'+fixture.file),card=parseExplainerCard(fixture.card)
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(fixture.sha256)
      const events:AssetImportFeedback[]=[],counts={uploads:0,probes:0,snapshots:0};let project=createProject('Original explainer '+card.format),fail=true
      const task=new AssetImportSession(project,'isolated',new File([new Uint8Array(bytes)],fixture.file,{type:'image/png'}),'image',{
        client:{importAsset:(blob,name)=>{counts.uploads++;return client.importAsset(blob,name)},probe:async file=>{counts.probes++;return validateExplainerProbe(await client.probe(file),card)}},
        assetMetadata:{sourceKind:'authored-explainer-card-v1',authored:true,illustrationOnly:true,renderer:'canvas-explainer-png-v1',card},environment:()=>({project,connection:'isolated'}),snapshot:()=>{counts.snapshots++},persist:value=>{if(fail)throw Error('Synthetic persistence failure');project=value},publish:value=>events.push(value)
      })
      await task.run();expect(events.at(-1)?.phase).toBe('saveFailed');expect(project.assets).toHaveLength(0)
      fail=false;await task.run();await task.run();expect(events.at(-1)?.phase).toBe('succeeded');expect(counts).toEqual({uploads:1,probes:1,snapshots:1})
      expect(await readFile(path.join(temp,project.assets[0].uri))).toEqual(bytes);expect(parseExplainerCard(project.assets[0].metadata.card)).toEqual(card)
      project=placeExplainerOnNewTrack(project,project.assets[0].id,'Original graphic');project.tracks[0].clips[0].durationMs=1000
      const [sourceWidth,sourceHeight]=explainerDimensions[card.format],width=sourceWidth/5,height=sourceHeight/5,output=`KINAOU/Renders/${card.format}.mp4`
      let job=await client.startRender(createRenderPlan(project,{...preview1080pPreset,width,height,fps:10,fit:'contain'},output))
      for(let i=0;i<250&&['queued','running'].includes(job.state);i++){await new Promise(r=>setTimeout(r,30));job=await client.renderStatus(job.id)}
      expect(job.state,job.error).toBe('succeeded')
      const file=path.join(temp,output),info=JSON.parse((await run('ffprobe',['-v','error','-show_streams','-show_format','-of','json',file])).toString())
      expect(info.streams[0]).toMatchObject({codec_name:'h264',width,height});expect(Math.abs(Number(info.format.duration)-1)).toBeLessThan(.1)
      const actual=await run('ffmpeg',['-v','error','-i',file,'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','-']),reference=await run('ffmpeg',['-v','error','-i','tests/fixtures/'+fixture.file,'-vf',`scale=${width}:${height},format=yuv420p`,'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','-'])
      expect(actual.length).toBe(reference.length)
      let total=0,textPixels=0,textError=0
      for(let i=0;i<actual.length;i+=3){const delta=Math.abs(actual[i]-reference[i])+Math.abs(actual[i+1]-reference[i+1])+Math.abs(actual[i+2]-reference[i+2]);total+=delta
        const light=(reference[i]+reference[i+1]+reference[i+2])/3
        if(card.theme==='indigo'?light>140:light<140){textPixels++;textError+=delta}
      }
      expect(textPixels).toBeGreaterThan(200);expect(total/actual.length).toBeLessThan(8);expect(textError/(textPixels*3)).toBeLessThan(24)
      expect(createHash('sha256').update(await readFile(path.join(temp,project.assets[0].uri))).digest('hex')).toBe(fixture.sha256)
    }
    expect(await readdir(path.join(root,'Assets'))).toHaveLength(3)
  }finally{child.kill('SIGKILL');await closed;await rm(temp,{recursive:true,force:true})}
},60000)
