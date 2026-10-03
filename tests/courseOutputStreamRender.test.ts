import { it, expect } from 'vitest'
import { spawn, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, mkdir, open, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { WorkerClient } from '../src/core/workerClient'
const exec=promisify(execFile),origin='http://127.0.0.1:43995',base='http://127.0.0.1:43992'
const run=async(program:string,args:string[])=>(await exec(program,args,{encoding:'buffer',maxBuffer:4*1024**2})).stdout
it('real authenticated worker streams and seeks an original MP4 above 256 MiB with actual decoded video/audio',async context=>{
  try{await run('ffmpeg',['-version']);await run('ffprobe',['-version'])}catch(cause){if(process.env.CI)throw cause;context.skip('FFmpeg required');return}
  const temp=await mkdtemp(path.join(os.tmpdir(),'kinaou-course-stream-')),root=path.join(temp,'KINAOU'),file=path.join(root,'Renders/lesson.mp4')
  await mkdir(path.dirname(file),{recursive:true})
  const child=spawn(process.execPath,[path.resolve('worker/mac-worker.mjs')],{env:{PATH:process.env.PATH,KINAOU_MANAGED_ROOT:root,KINAOU_WORKER_TOKEN:'stream-test-only',KINAOU_WORKER_PORT:'43992'},stdio:['ignore','pipe','pipe']});let logs='';child.stdout.on('data',d=>{logs+=d});child.stderr.on('data',d=>{logs+=d})
  try{
    await run('ffmpeg',['-v','error','-f','lavfi','-i','color=red:size=160x90:rate=10:duration=10','-f','lavfi','-i','color=blue:size=160x90:rate=10:duration=10','-f','lavfi','-i','sine=frequency=440:duration=20','-filter_complex','[0:v][1:v]concat=n=2:v=1:a=0[v]','-map','[v]','-map','2:a','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-movflags','+faststart',file])
    const original=await readFile(file),size=300*1024**2,handle=await open(file,'r+')
    const box=Buffer.alloc(8);box.writeUInt32BE(size-original.length);box.write('free',4);await handle.write(box,0,8,original.length);await handle.truncate(size);await handle.close()
    const deadline=Date.now()+15000;while(!logs.includes(`listening on ${base}`)){if(child.exitCode!==null||Date.now()>deadline)throw Error(logs);await new Promise(r=>setTimeout(r,30))}
    const receipt={schemaVersion:1 as const,jobId:'stream-original',label:'Synthetic original lesson',outputRelativePath:'KINAOU/Renders/lesson.mp4',format:'landscape' as const,range:{inMs:0,outMs:20000},sceneIds:[],durationMs:20000,sizeBytes:size,completedAt:'2026-10-03T00:00:00.000Z',courseLesson:{courseId:'course',moduleId:'module',lessonId:'lesson',outlineRevision:1,courseTitle:'Course',moduleTitle:'Module',lessonTitle:'Lesson',language:'en' as const}}
    const fetchImpl:typeof fetch=(url,init)=>fetch(url,{...init,headers:{...init?.headers,origin}})
    const client=new WorkerClient({baseUrl:base,token:'stream-test-only',fetchImpl})
    expect((await fetch(base+'/course/output-stream',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({export:receipt})})).status).toBe(401)
    await expect(client.loadCourseOutput(receipt)).rejects.toThrow()
    const source=await client.openCourseOutputStream(receipt)
    const res=await fetch(source.url,{headers:{origin,range:'bytes=0-31'}});expect(res.status).toBe(206);expect(res.headers.get('access-control-allow-origin')).toBe(origin);expect(res.headers.get('content-range')).toBe(`bytes 0-31/${size}`);expect(Buffer.from(await res.arrayBuffer())).toEqual(original.subarray(0,32))
    expect((await fetch(source.url)).status).toBe(401);expect((await fetch(source.url,{headers:{origin:'https://evil.test'}})).status).toBe(401)
    const probe=JSON.parse((await run('ffprobe',['-v','error','-headers',`Origin: ${origin}\r\n`,'-show_streams','-show_format','-of','json',source.url])).toString())
    expect(Number(probe.format.duration)).toBeCloseTo(20,1);expect(probe.streams.some((s:any)=>s.codec_type==='audio')).toBe(true)
    for(const [time,channel] of [['2',0],['12',2]] as const){const rgb=await run('ffmpeg',['-v','error','-headers',`Origin: ${origin}\r\n`,'-ss',time,'-i',source.url,'-vf','scale=1:1','-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','-']);expect(rgb[channel]).toBeGreaterThan(200);expect(rgb[channel===0?2:0]).toBeLessThan(30)}
    const pcm=await run('ffmpeg',['-v','error','-headers',`Origin: ${origin}\r\n`,'-ss','12','-i',source.url,'-t','0.25','-map','0:a','-ac','1','-ar','8000','-f','f32le','-']);let squares=0;for(let n=0;n+4<=pcm.length;n+=4)squares+=pcm.readFloatLE(n)**2;expect(Math.sqrt(squares/(pcm.length/4))).toBeGreaterThan(0.01)
    const release=await fetch(base+'/course/output-stream-release',{method:'POST',headers:{origin,authorization:'Bearer stream-test-only','content-type':'application/json'},body:JSON.stringify({id:source.url.split('/').at(-1)})});expect(release.status).toBe(200);expect((await fetch(source.url,{headers:{origin}})).status).toBe(401)
    const after=await open(file,'r');try{const copied=Buffer.alloc(original.length);await after.read(copied,0,copied.length,0);expect(copied).toEqual(original);expect((await after.stat()).size).toBe(size)}finally{await after.close()}
    expect((await client.health()).capabilities).toContain('course-output-stream')
  }finally{child.kill('SIGKILL');await new Promise<void>(resolve=>{child.on('close',()=>resolve());setTimeout(resolve,3000).unref()});await rm(temp,{recursive:true,force:true})}
},60000)
