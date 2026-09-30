import { it, expect } from 'vitest'
import { execFile, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { promisify } from 'node:util'
import { mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createProject } from '../src/core/project'
import { createRenderPlan, preview1080pPreset } from '../src/core/render'
import { WorkerClient } from '../src/core/workerClient'
import { AssetImportSession, type AssetImportFeedback } from '../src/core/assetImportSession'
import { footballBoardSvg, parseFootballTactics, validateTacticsImageProbe } from '../src/core/footballTactics'
import { placeTacticsOnNewTrack } from '../src/core/footballTacticsPlacement'
import { commitFootballSequence, reviewFootballSequence } from '../src/core/footballSequence'
const exec = promisify(execFile)
const run = async (command: string, args: string[]) => (await exec(command,args,{encoding:'buffer',maxBuffer:4*1024**2})).stdout
it('imports an actual browser-produced tactics PNG, retries only persistence, and renders its field, teams and arrows through FFmpeg', async context => {
  try { await run('ffmpeg',['-version']); await run('ffprobe',['-version']) } catch (cause) { if (process.env.CI) throw cause; context.skip('FFmpeg required'); return }
  const png = await readFile('tests/fixtures/football-tactics.png'), board = parseFootballTactics(JSON.parse(await readFile('tests/fixtures/football-tactics.json','utf8')))
  expect(createHash('sha256').update(png).digest('hex')).toBe('fc8765b48d23aee5e70797d9e0eb21c4e373b7d7721e3a6bbbe00b8036eb7174')
  expect(footballBoardSvg(board)).toBe((await readFile('tests/fixtures/football-tactics.svg','utf8')).trimEnd())
  const temp = await mkdtemp(path.join(os.tmpdir(),'kinaou-tactics-render-')), root = path.join(temp,'KINAOU')
  await mkdir(root)
  const child = spawn(process.execPath,[path.resolve('worker/mac-worker.mjs')],{env:{PATH:process.env.PATH,KINAOU_MANAGED_ROOT:root,KINAOU_WORKER_PORT:'43979',KINAOU_WORKER_TOKEN:'tactics-test-only'},stdio:['ignore','pipe','pipe']})
  let logs = ''; child.stdout.on('data',v=>{logs+=v}); child.stderr.on('data',v=>{logs+=v})
  try {
    const deadline = Date.now()+15000
    while (!logs.includes('listening on http://127.0.0.1:43979')) { if (child.exitCode !== null || Date.now()>deadline) throw Error(logs); await new Promise(resolve=>setTimeout(resolve,30)) }
    const client = new WorkerClient({baseUrl:'http://127.0.0.1:43979',token:'tactics-test-only'}), events: AssetImportFeedback[] = []
    let project = createProject('Authored football illustration'), fail = true, uploads = 0, probes = 0, snapshots = 0
    const original = structuredClone(project), session = new AssetImportSession(project,'root',new File([new Uint8Array(png)],'tactics.png',{type:'image/png'}),'image',{
      client: { importAsset: (blob,name)=>{uploads++;return client.importAsset(blob,name)}, probe: async file=>{probes++;return validateTacticsImageProbe(await client.probe(file))} },
      assetMetadata:{sourceKind:'authored-football-tactics-v1',authored:true,illustrationOnly:true,renderer:'svg-canvas-png-v1',board},
      environment:()=>({project,connection:'root'}),snapshot:()=>{snapshots++},persist:value=>{if(fail)throw Error('Synthetic storage failure');project=value},publish:value=>events.push(value)
    })
    await session.run(); expect(events.at(-1)?.phase).toBe('saveFailed'); expect(project).toEqual(original)
    fail=false; await session.run(); await session.run()
    expect(events.at(-1)?.phase).toBe('succeeded'); expect([uploads,probes,snapshots]).toEqual([1,1,1]); expect(project.assets).toHaveLength(1)
    expect(await readdir(path.join(root,'Assets'))).toHaveLength(1)
    expect(await readFile(path.join(temp,project.assets[0].uri))).toEqual(png)
    expect(parseFootballTactics(project.assets[0].metadata.board)).toEqual(board)
    project=placeTacticsOnNewTrack(project,project.assets[0].id,'Tactics')
    expect(project.tracks[0].clips[0].durationMs).toBe(5000)
    project.tracks[0].clips[0].durationMs=1000
    let job=await client.startRender(createRenderPlan(project,{...preview1080pPreset,width:384,height:216,fps:10,fit:'contain'},'KINAOU/Renders/tactics.mp4'))
    for(let i=0;i<200&&['queued','running'].includes(job.state);i++){await new Promise(resolve=>setTimeout(resolve,30));job=await client.renderStatus(job.id)}
    expect(job.state,job.error).toBe('succeeded')
    const output=path.join(root,'Renders/tactics.mp4'), probe=JSON.parse((await run('ffprobe',['-v','error','-show_format','-of','json',output])).toString())
    expect(Math.abs(Number(probe.format.duration)-1)).toBeLessThan(0.1)
    const pixels=await run('ffmpeg',['-v','error','-i',output,'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','-'])
    let green=0,red=0,blue=0,yellow=0
    for(let i=0;i<pixels.length;i+=3){const [r,g,b]=[pixels[i],pixels[i+1],pixels[i+2]];if(g>r*1.3&&g>b*1.2)green++;if(r>160&&g<120&&b<120)red++;if(b>150&&b>r*1.4)blue++;if(r>170&&g>140&&b<110)yellow++}
    expect(green).toBeGreaterThan(30000);expect(red).toBeGreaterThan(200);expect(blue).toBeGreaterThan(200);expect(yellow).toBeGreaterThan(30)
    // A second actual browser raster proves ordered cuts, not only duration or a repeated still.
    const secondPng=await readFile('tests/fixtures/football-tactics-phase2.png'),secondBoard=parseFootballTactics(JSON.parse(await readFile('tests/fixtures/football-tactics-phase2.json','utf8')))
    expect(createHash('sha256').update(secondPng).digest('hex')).toBe('dcb91ebaea98b4cf8ac0a8d52b0cf461fdd4a0412d68297b3e4dfe66536474f8')
    const second= new AssetImportSession(project,'root',new File([new Uint8Array(secondPng)],'phase2.png',{type:'image/png'}),'image',{
      client:{importAsset:(blob,name)=>client.importAsset(blob,name),probe:async file=>validateTacticsImageProbe(await client.probe(file))},assetMetadata:{sourceKind:'authored-football-tactics-v1',board:secondBoard},environment:()=>({project,connection:'root'}),snapshot:()=>{},persist:p=>{project=p},publish:e=>events.push(e)
    })
    await second.run();expect(events.at(-1)?.phase).toBe('succeeded')
    const beforeSequence=structuredClone(project),review=reviewFootballSequence(project,{name:'Two authored phases',startMs:0,steps:[{assetId:project.assets[0].id,durationMs:1500},{assetId:project.assets[1].id,durationMs:2000}]})
    commitFootballSequence(project,review,true,()=>{},p=>{project=p})
    expect(project.tracks[0]).toEqual(beforeSequence.tracks[0]);expect(await readdir(path.join(root,'Assets'))).toHaveLength(2)
    // Only the new sequence is rendered; unrelated existing tracks are preserved above.
    const renderProject={...project,tracks:[project.tracks.at(-1)!]}
    // Compare distinguishing regions rather than shared grass/background: RGB↔YUV rounding
    // affects the entire common field and otherwise dominates the small changed ball/arrows.
    const error=(a:Buffer,b:Buffer,mask:number[])=>{expect(a.length).toBe(b.length);let total=0;for(const i of mask)total+=Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2]);return total/(mask.length*3)}
    for(const [width,height] of [[384,216],[216,384]]){
      const relative=`KINAOU/Renders/sequence-${width}.mp4`
      let sequence=await client.startRender(createRenderPlan(renderProject,{...preview1080pPreset,width,height,fps:10,fit:'contain'},relative))
      for(let i=0;i<200&&['queued','running'].includes(sequence.state);i++){await new Promise(r=>setTimeout(r,30));sequence=await client.renderStatus(sequence.id)}
      expect(sequence.state,sequence.error).toBe('succeeded')
      const file=path.join(temp,relative),info=JSON.parse((await run('ffprobe',['-v','error','-show_format','-of','json',file])).toString())
      expect(Math.abs(Number(info.format.duration)-3.5)).toBeLessThan(0.1)
      // Center on a YUV canvas like the exported video. RGB pad would position an
      // odd-height portrait letterbox one chroma pixel differently from overlay.
      const references=await Promise.all(['tests/fixtures/football-tactics.png','tests/fixtures/football-tactics-phase2.png'].map(image=>run('ffmpeg',['-v','error','-i',image,'-f','lavfi','-i',`color=black:s=${width}x${height}`,'-filter_complex',`[0:v]scale=${width}:${height}:force_original_aspect_ratio=decrease[board];[1:v][board]overlay=(W-w)/2:(H-h)/2`,'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','-'])))
      const mask:number[]=[];for(let i=0;i<references[0].length;i+=3){if(Math.abs(references[0][i]-references[1][i])+Math.abs(references[0][i+1]-references[1][i+1])+Math.abs(references[0][i+2]-references[1][i+2])>100)mask.push(i)}
      expect(mask.length).toBeGreaterThan(80)
      for(const [time,index] of [['1.4',0],['1.6',1],['3.3',1]] as const){const frame=await run('ffmpeg',['-v','error','-ss',time,'-i',file,'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','-']);expect(error(frame,references[index],mask),`${width}x${height} at ${time}s must show phase ${index+1}`).toBeLessThan(error(frame,references[1-index],mask)*0.75)}
    }
  } finally {
    child.kill('SIGKILL')
    await new Promise<void>(resolve=>{if(child.exitCode!==null||child.signalCode!==null)return resolve();child.once('close',()=>resolve());setTimeout(resolve,3000).unref()})
    await rm(temp,{recursive:true,force:true})
  }
},60000)
