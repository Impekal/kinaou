import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { mkdtemp, mkdir, writeFile, readFile, rm, stat, symlink } from 'node:fs/promises'
import { createProjectSourceArchiveRuntime } from './project-source-archive.mjs'
import { sourceArchiveDirectory, sourceProjectInventory, sourceAssetPath, validateSourceArchiveQuery, validateSourceArchiveJob } from './project-source-protocol.mjs'
const digest = data => crypto.createHash('sha256').update(data).digest('hex')
async function fixture(t) {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'kinaou-source-archive-')); t.after(() => rm(temp, { recursive: true, force: true }))
  const root = path.join(temp,'KINAOU'); await mkdir(path.join(root,'Assets'), {recursive:true})
  const media = Buffer.alloc(1024 * 1024 + 17, 37); await writeFile(path.join(root,'Assets','source.bin'), media)
  const project = { schemaVersion:1,id:'project',title:'Private fixture',script:'Private answer',assets:[{id:'file',kind:'other',uri:'KINAOU/Assets/source.bin',managed:true,offline:false,metadata:{}},{id:'caption',kind:'caption',uri:'kinaou://caption/caption',managed:true,metadata:{text:'Bonjour'}}],tracks:[],storyboard:[],metadata:{} }
  return {root,media,project,runtime:createProjectSourceArchiveRuntime({root})}
}
function request(project) { const projectText=JSON.stringify(project); return {schemaVersion:1,requestId:crypto.randomUUID(),projectId:project.id,projectSha256:digest(projectText),acknowledgePrivateArchive:true,language:'fr',projectText} }
async function settle(runtime, input) {
  const query=validateSourceArchiveQuery(input), deadline=Date.now()+10000
  for (;;) { const job=await runtime.status(query); if (!['queued','copying'].includes(job.state)) return job; if (Date.now()>deadline) throw Error('Archive test timeout'); await new Promise(resolve=>setTimeout(resolve,5)) }
}
test('copies actual media and exact project bytes, rehashes after restart, and survives deletion of originals', async t=>{
  const f=await fixture(t), input=request(f.project), before=await readFile(path.join(f.root,'Assets','source.bin'))
  await f.runtime.start(input); const job=await settle(f.runtime,input); assert.equal(job.state,'ready'); validateSourceArchiveJob(job,input)
  assert.equal(job.result.files.length,1); assert.equal(job.result.totalBytes,f.media.length)
  const folder=path.join(f.root,sourceArchiveDirectory(input.requestId).slice(7))
  assert.deepEqual(await readFile(path.join(folder,'source/KINAOU/Assets/source.bin')),f.media)
  assert.equal((await readFile(path.join(folder,'source/KINAOU/Projects/project.json'))).toString(),input.projectText)
  assert.equal(job.result.files[0].sha256,digest(f.media)); assert.equal((await stat(path.join(folder,'source/KINAOU/Assets/source.bin'))).mode&0o777,0o600)
  assert.deepEqual(await readFile(path.join(f.root,'Assets','source.bin')),before)
  assert.match((await readFile(path.join(folder,'README.txt'))).toString(),/ARCHIVE PRIVÉE/)
  await rm(path.join(f.root,'Assets','source.bin'))
  const restarted=createProjectSourceArchiveRuntime({root:f.root}); assert.equal((await restarted.status(input)).state,'ready')
  assert.equal((await restarted.start(input)).state,'ready') // same ID reads, never recopies
})
test('unknown status reads never create archive directories and project/hash mismatches are refused',async t=>{
  const f=await fixture(t),input=request(f.project); assert.equal((await f.runtime.status(input)).state,'unknown')
  await assert.rejects(stat(path.join(f.root,'Archive')), {code:'ENOENT'})
  await assert.rejects(f.runtime.start({...input,projectSha256:'0'.repeat(64)}))
  await f.runtime.start(input); await settle(f.runtime,input)
  await assert.rejects(f.runtime.status({...input,projectId:'other'}))
  await assert.rejects(f.runtime.status({...input,projectSha256:'0'.repeat(64)}))
})
test('failed missing media stays incomplete and same ID never resumes after source is repaired',async t=>{
  const f=await fixture(t),input=request(f.project); await rm(path.join(f.root,'Assets','source.bin'))
  await f.runtime.start(input); assert.equal((await settle(f.runtime,input)).state,'failed')
  await writeFile(path.join(f.root,'Assets','source.bin'),f.media)
  assert.equal((await createProjectSourceArchiveRuntime({root:f.root}).start(input)).state,'failed')
})
test('reserves destination exclusively and preserves foreign files in an existing directory',async t=>{
  const f=await fixture(t),input=request(f.project), folder=path.join(f.root,sourceArchiveDirectory(input.requestId).slice(7))
  await mkdir(folder,{recursive:true}); await writeFile(path.join(folder,'keep.txt'),'foreign')
  assert.equal((await f.runtime.start(input)).state,'interrupted')
  assert.equal((await readFile(path.join(folder,'keep.txt'))).toString(),'foreign')
  await assert.rejects(stat(path.join(folder,'request.json')),{code:'ENOENT'})
})
for (const kind of ['media','parent','destination']) test(`refuses symbolic-link ${kind} without overwriting its target`,async t=>{
  const f=await fixture(t),input=request(f.project)
  if(kind==='media') {await writeFile(path.join(f.root,'keep.bin'),'KEEP');await rm(path.join(f.root,'Assets','source.bin'));await symlink('../keep.bin',path.join(f.root,'Assets','source.bin'))}
  if(kind==='parent') {await mkdir(path.join(f.root,'linked'));await writeFile(path.join(f.root,'linked','source.bin'),'KEEP');await rm(path.join(f.root,'Assets'),{recursive:true});await symlink('linked',path.join(f.root,'Assets'))}
  if(kind==='destination') {await mkdir(path.join(f.root,'foreign'));await symlink('foreign',path.join(f.root,'Archive'));await assert.rejects(f.runtime.start(input));return}
  await f.runtime.start(input);assert.equal((await settle(f.runtime,input)).state,'failed')
  assert.equal((await readFile(path.join(f.root,kind==='media'?'keep.bin':'linked/source.bin'))).toString(),'KEEP')
})
for(const file of ['source/KINAOU/Assets/source.bin','source/KINAOU/Projects/project.json','README.txt','SHA256SUMS']) test(`detects changed completed ${file}`,async t=>{
  const f=await fixture(t),input=request(f.project);await f.runtime.start(input);assert.equal((await settle(f.runtime,input)).state,'ready')
  const destination=path.join(f.root,sourceArchiveDirectory(input.requestId).slice(7),file);await writeFile(destination,'CHANGED')
  assert.equal((await createProjectSourceArchiveRuntime({root:f.root}).status(input)).state,'integrityFailed')
})
test('includes duplicate-path assets once and inline captions only in JSON; rejects ambiguous and external sources',async t=>{
  const f=await fixture(t);f.project.assets.push({...f.project.assets[0],id:'same-path'})
  assert.deepEqual(sourceProjectInventory(JSON.stringify(f.project)).paths,['KINAOU/Assets/source.bin'])
  assert.equal(sourceProjectInventory(JSON.stringify(f.project)).inlineCaptions,1)
  for(const mutation of [p=>p.assets[0].offline=true,p=>p.assets[0].managed=false,p=>p.assets[2].id='file',p=>p.assets[2].uri='KINAOU/Assets/SOURCE.bin',p=>p.assets[2].uri='KINAOU/Assets/source.bin/child',p=>p.assets[0].uri='https://example.com/source.mp4']) {
    const project=structuredClone(f.project);mutation(project);assert.throws(()=>sourceProjectInventory(JSON.stringify(project)))
  }
})
test('rejects unsafe paths and bound violations before any copying',async t=>{
  const f=await fixture(t)
  for(const value of ['KINAOU/Assets/../secret','KINAOU/Assets//empty','KINAOU/Models/model.bin','KINAOU/Assets/a\\b','KINAOU/Assets/NUL.mp4','KINAOU/Assets/trailing.','KINAOU/Assets/./x','KINAOU/Assets/é'.normalize('NFD'),'KINAOU/Assets/'+ 'x'.repeat(256)]) assert.throws(()=>sourceAssetPath(value))
  const input=request(f.project);await assert.rejects(f.runtime.start({...input,acknowledgePrivateArchive:false}));await assert.rejects(f.runtime.start({...input,language:'xx'}))
  const project=structuredClone(f.project);project.assets=Array.from({length:501},(_,i)=>({...project.assets[0],id:String(i)}));assert.throws(()=>sourceProjectInventory(JSON.stringify(project)))
  assert.throws(()=>sourceProjectInventory('x'.repeat(5*1024**2+1)))
  assert.throws(()=>sourceAssetPath('KINAOU/Assets/'+Array(10).fill('界'.repeat(60)).join('/')))
  await assert.rejects(stat(path.join(f.root,'Archive')),{code:'ENOENT'})
})
