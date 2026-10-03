import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { mkdtemp, mkdir, writeFile, readFile, rm, open, symlink } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { createCourseOutputStreamRuntime, courseStreamLimits, courseStreamRange, validCourseStreamOrigin } from './course-output-stream.mjs'
const receipt = { schemaVersion: 1, jobId: 'job', label: 'lesson', outputRelativePath: 'KINAOU/Renders/lesson.mp4', format: 'landscape', range: { inMs: 0, outMs: 1000 }, sceneIds: [], durationMs: 1000, completedAt: '2026-09-27T00:00:00.000Z', courseLesson: { courseId: 'course', moduleId: 'module', lessonId: 'lesson' } }
const bytes = Buffer.from([0,0,0,16,...Buffer.from('ftypisomTEST')]), origin = 'http://127.0.0.1:43995'
async function fixture(fn) {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'kinaou-stream-')), root = path.join(temp, 'KINAOU'), file = path.join(root, 'Renders/lesson.mp4')
  await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, bytes)
  let now = Date.now(); const runtime = createCourseOutputStreamRuntime({ root, now: () => now })
  const server = http.createServer((req, res) => { void runtime.serve(req,res) }); await new Promise(resolve => server.listen(0,'127.0.0.1',resolve))
  const base = `http://127.0.0.1:${server.address().port}/course/output-stream/`
  const get = (id, options = {}) => fetch(base + id, { ...options, headers: { origin, ...options.headers } })
  try { await fn({ runtime, file, root, get, advance: ms => { now += ms }, expire: () => { now += courseStreamLimits.lifetimeMs + 1 } }) }
  finally { runtime.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await rm(temp, { recursive: true, force: true }) }
}
test('only exact local app origins can create capabilities', () => {
  for (const value of ['http://localhost:1234','https://127.0.0.1']) assert.equal(validCourseStreamOrigin(value),true)
  for (const value of [undefined,'null','file:///tmp/a','http://localhost:1234/','http://localhost.evil','https://evil.test','http://a@localhost','http://127.0.0.2','http://localhost/path']) assert.equal(validCourseStreamOrigin(value),false)
})
test('single byte ranges support bounded/open/suffix without unsafe arithmetic', () => {
  assert.deepEqual(courseStreamRange(undefined,16),{start:0,end:15,partial:false})
  for (const [value,start,end] of [['bytes=1-4',1,4],['bytes=8-',8,15],['bytes=-4',12,15],['bytes=0-99',0,15],['bytes=-99',0,15]]) assert.deepEqual(courseStreamRange(value,16),{start,end,partial:true})
  for (const value of ['bytes=-0','bytes=-','bytes=16-','bytes=4-2','bytes=0-1,4-5','items=0-4','bytes=1.2-4','bytes=999999999999999999999-','bytes=0-1\n',[]]) assert.throws(()=>courseStreamRange(value,16))
})
test('actual HTTP reads exact bytes and HEAD without buffering or modifying source',()=>fixture(async({runtime,get,file})=>{
  const ticket = await runtime.create({...receipt,sizeBytes:bytes.length},origin)
  assert.match(ticket.id,/^[a-f0-9]{64}$/); assert.equal(ticket.sizeBytes,bytes.length)
  assert.equal(JSON.stringify(ticket).includes('Renders'),false)
  for(const [range,start,end] of [['bytes=1-4',1,4],['bytes=-4',12,15],['bytes=8-',8,15],[undefined,0,15]]){
    const res = await get(ticket.id,{headers:range?{range}:{}})
    assert.equal(res.status,range?206:200);assert.equal(res.headers.get('cache-control'),'no-store');assert.equal(res.headers.get('content-type'),'video/mp4');assert.equal(res.headers.get('accept-ranges'),'bytes')
    assert.deepEqual(Buffer.from(await res.arrayBuffer()),bytes.subarray(start,end+1))
    if(range)assert.equal(res.headers.get('content-range'),`bytes ${start}-${end}/16`)
  }
  const head=await get(ticket.id,{method:'HEAD'});assert.equal(head.status,200);assert.equal(head.headers.get('content-length'),'16');assert.equal((await head.arrayBuffer()).byteLength,0)
  assert.deepEqual(await readFile(file),bytes)
}))
test('wrong/missing origins, unsupported methods and token guessing cannot read',()=>fixture(async({runtime,get})=>{
  await assert.rejects(runtime.create(receipt,'https://evil.test'))
  const ticket=await runtime.create(receipt,origin)
  for(const options of [{headers:{origin:'https://evil.test'}},{headers:{origin:'null'}},{headers:{origin:''}},{method:'POST'}])assert.equal((await get(ticket.id,options)).status,401)
  assert.equal((await get('a'.repeat(64))).status,401)
  assert.equal((await get(ticket.id+'?path=secret')).status,401)
  assert.equal((await get('../output-media')).status,401)
}))
test('malformed or unsatisfiable ranges return 416 and leave valid playback available',()=>fixture(async({runtime,get})=>{
  const ticket=await runtime.create(receipt,origin)
  for(const range of ['bytes=16-','bytes=0-1,4-5','bytes=-0']){const res=await get(ticket.id,{headers:{range}});assert.equal(res.status,416);assert.equal(res.headers.get('content-range'),'bytes */16')}
  assert.equal((await get(ticket.id)).status,200)
}))
test('revocation is origin-bound, idempotent and final',()=>fixture(async({runtime,get})=>{
  const ticket=await runtime.create(receipt,origin)
  assert.throws(()=>runtime.revoke(ticket.id,'http://localhost:9999'))
  assert.equal((await get(ticket.id)).status,200)
  runtime.revoke(ticket.id,origin);runtime.revoke(ticket.id,origin)
  assert.equal((await get(ticket.id)).status,401)
}))
test('expiration refuses further reads without renewing automatically',()=>fixture(async({runtime,get,expire})=>{
  const ticket=await runtime.create(receipt,origin);expire();assert.equal((await get(ticket.id)).status,401)
  const next=await runtime.create(receipt,origin);assert.notEqual(next.id,ticket.id);assert.equal((await get(next.id)).status,200)
}))
test('unused lost-reply grants expire after 30 seconds while activated grants retain their absolute lifetime',()=>fixture(async({runtime,get,advance})=>{
  const lost=await runtime.create(receipt,origin),active=await runtime.create(receipt,origin)
  assert.equal((await get(active.id,{method:'HEAD'})).status,200)
  advance(30001);assert.equal((await get(lost.id)).status,401);assert.equal((await get(active.id)).status,200)
}))
test('concurrent creation is bounded and releasing permits another player',()=>fixture(async({runtime})=>{
  const results=await Promise.allSettled(Array.from({length:12},()=>runtime.create(receipt,origin)))
  const accepted=results.filter(r=>r.status==='fulfilled');assert.equal(accepted.length,8)
  runtime.revoke(accepted[0].value.id,origin);assert.ok(await runtime.create(receipt,origin))
}))
test('same-size file edits revoke old capabilities instead of serving changed bytes',()=>fixture(async({runtime,get,file})=>{
  const ticket=await runtime.create(receipt,origin)
  await writeFile(file,Buffer.from([0,0,0,16,...Buffer.from('ftypisomEDIT')]))
  assert.equal((await get(ticket.id)).status,409);assert.equal((await get(ticket.id)).status,401)
}))
test('symlink replacement, size mismatch, invalid receipt and non-MP4 fail closed',()=>fixture(async({runtime,get,file,root})=>{
  await assert.rejects(runtime.create({...receipt,sizeBytes:100},origin))
  await assert.rejects(runtime.create({...receipt,courseLesson:undefined},origin))
  const ticket=await runtime.create(receipt,origin)
  await rm(file);await writeFile(path.join(root,'outside.mp4'),bytes);await symlink(path.join(root,'outside.mp4'),file)
  assert.equal((await get(ticket.id)).status,409)
  await assert.rejects(runtime.create(receipt,origin))
}))
test('streams small ranges of a sparse original above the old 256 MiB limit',()=>fixture(async({runtime,get,file})=>{
  const handle=await open(file,'r+');await handle.truncate(300*1024**2);await handle.close()
  const ticket=await runtime.create(receipt,origin);assert.equal(ticket.sizeBytes,300*1024**2)
  const res=await get(ticket.id,{headers:{range:'bytes=0-15'}});assert.equal(res.status,206);assert.deepEqual(Buffer.from(await res.arrayBuffer()),bytes)
  const tail=await get(ticket.id,{headers:{range:'bytes=-16'}});assert.equal(tail.status,206);assert.deepEqual(Buffer.from(await tail.arrayBuffer()),Buffer.alloc(16))
  const again=await open(file,'r+');await again.truncate(courseStreamLimits.bytes+1);await again.close()
  await assert.rejects(runtime.create(receipt,origin),/8192 MiB/)
}))
test('bounded simultaneous readers are aborted by revocation and worker remains usable',()=>fixture(async({runtime,get,file})=>{
  const handle=await open(file,'r+');await handle.truncate(300*1024**2);await handle.close()
  const ticket=await runtime.create(receipt,origin)
  const readers=await Promise.all(Array.from({length:4},()=>get(ticket.id)))
  assert.equal((await get(ticket.id)).status,429)
  runtime.revoke(ticket.id,origin)
  await Promise.all(readers.map(res=>res.body.cancel().catch(()=>undefined)))
  const next=await runtime.create(receipt,origin)
  assert.equal((await get(next.id,{method:'HEAD'})).status,200)
}))
