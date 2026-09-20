import { expect, it, vi } from 'vitest'
import { createProject, parseProject } from '../src/core/project'
import { createRenderPlan, formatProfiles } from '../src/core/render'
import { acceptShortBatchJob, createPersistedShortBatch, nextShortBatchItem, persistedShortBatchItemSchema, projectPersistedShortBatch, rebuildPersistedShortBatchPlans, requestPersistedShortBatchCancellation, storeProjectShortBatch } from '../src/core/shortExportBatch'
import { markShortBatchSubmission, ShortBatchSubmission } from '../src/core/shortBatchSubmission'
import type { RenderJobRecord } from '../src/core/renderJobs'

function fixture() {
  const project = parseProject({ ...createProject('Dispatch'), assets: [{id:'i',kind:'image',uri:'KINAOU/Assets/image.png',managed:true}],tracks:[{id:'v',name:'Video',type:'video',clips:[{id:'c',assetId:'i',startMs:0,durationMs:1000}]}] })
  const outputPath='KINAOU/Renders/short.mp4'
  const plan=createRenderPlan(project,formatProfiles.landscape.export,outputPath)
  const batch=createPersistedShortBatch([{id:'one:landscape',title:'Original',sceneIds:[],format:'landscape',inMs:0,outMs:1000,durationMs:1000,outputPath,state:'queued',progress:0}],new Map([['one:landscape',plan]]))
  const job:RenderJobRecord={id:'job',state:'queued',progress:0,createdAt:batch.createdAt,updatedAt:batch.updatedAt}
  return {project,plan,batch,job}
}
function setup() {
  const f=fixture(), order:string[]=[]
  const deps={
    plan:f.plan,
    client:{startRender:vi.fn(async()=>{order.push('post');return f.job})},
    isCurrent:vi.fn(()=>true),
    saveIntent:vi.fn(()=>{order.push('save');return markShortBatchSubmission(f.batch,'one:landscape').items[0]}),
    accepted:vi.fn(),error:vi.fn(),finished:vi.fn()
  }
  return {...f,deps,order,session:new ShortBatchSubmission(deps)}
}
function deferred<T>() {
  let resolve!:(value:T)=>void, reject!:(cause:Error)=>void
  const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no})
  return {promise,resolve,reject}
}
it('persists intent before exactly one POST and clears it only on validated acknowledgement',async()=>{
  const s=setup()
  await Promise.all([s.session.run(),s.session.run()])
  await s.session.run()
  expect(s.order).toEqual(['save','post'])
  expect(s.deps.client.startRender).toHaveBeenCalledExactlyOnceWith(s.plan)
  expect(s.deps.accepted.mock.calls[0][0].jobId).toBe('job')
  expect(s.deps.accepted.mock.calls[0][0].submissionStartedAt).toBeUndefined()
})
it('never sends a job when the write-ahead save fails',async()=>{
  const s=setup()
  s.deps.saveIntent.mockImplementation(()=>{throw new Error('disk full')})
  await s.session.run()
  expect(s.deps.client.startRender).not.toHaveBeenCalled()
  expect(s.deps.error).toHaveBeenCalledWith(expect.stringContaining('no job was sent'))
  expect(s.deps.finished).toHaveBeenCalledOnce()
})
it('preserves uncertainty rather than fabricating failure or retrying a lost acknowledgement',async()=>{
  const s=setup()
  s.deps.client.startRender.mockRejectedValue(new Error('connection lost'))
  await s.session.run();await s.session.run()
  expect(s.deps.accepted).not.toHaveBeenCalled()
  expect(s.deps.error).toHaveBeenCalledWith(expect.stringContaining('unconfirmed'))
  expect(s.deps.client.startRender).toHaveBeenCalledOnce()
})
it.each(['detach','scope'] as const)('drops late success and finalizer after %s',async(mode)=>{
  const s=setup(), pending=deferred<RenderJobRecord>()
  s.deps.client.startRender.mockReturnValue(pending.promise)
  const run=s.session.run()
  if(mode==='detach') s.session.detach()
  else s.deps.isCurrent.mockReturnValue(false)
  pending.resolve(s.job);await run
  expect(s.deps.accepted).not.toHaveBeenCalled()
  expect(s.deps.finished).not.toHaveBeenCalled()
  expect(s.deps.error).not.toHaveBeenCalled()
})
it('drops late errors after detachment',async()=>{
  const s=setup(), pending=deferred<RenderJobRecord>()
  s.deps.client.startRender.mockReturnValue(pending.promise)
  const run=s.session.run();s.session.detach()
  pending.reject(new Error('offline'));await run
  expect(s.deps.error).not.toHaveBeenCalled()
  expect(s.deps.finished).not.toHaveBeenCalled()
})
it('does not save or send after scope invalidation',async()=>{
  const s=setup();s.deps.isCurrent.mockReturnValue(false)
  await s.session.run()
  expect(s.order).toEqual([])
})
it('does not publish an acknowledgement with a different output path',async()=>{
  const s=setup()
  s.deps.client.startRender.mockResolvedValue({...s.job,state:'succeeded',progress:1,outputPath:'KINAOU/Renders/other.mp4',sizeBytes:123})
  await s.session.run()
  expect(s.deps.accepted).not.toHaveBeenCalled()
  expect(s.deps.error).toHaveBeenCalledWith(expect.stringContaining('unconfirmed'))
})
it('retains a portable marker on reload and blocks the whole queue without reconstructing',()=>{
  const {project,batch}=fixture()
  const marked=markShortBatchSubmission(batch,'one:landscape')
  const saved=parseProject(JSON.parse(JSON.stringify(storeProjectShortBatch(project,marked))))
  const loaded=projectPersistedShortBatch(saved)!
  expect(loaded.items[0].submissionStartedAt).toBeTruthy()
  expect(nextShortBatchItem([...loaded.items,{...batch.items[0],id:'two',outputPath:'KINAOU/Renders/two.mp4'}])).toBeUndefined()
  expect(()=>rebuildPersistedShortBatchPlans(saved,loaded)).toThrow(/acknowledgement/)
  expect(batch.items[0].submissionStartedAt).toBeUndefined()
})
it('does not erase an uncertain submission when saving cancellation',()=>{
  const {batch}=fixture()
  const marked=markShortBatchSubmission(batch,'one:landscape')
  const cancelled=requestPersistedShortBatchCancellation(marked)
  expect(cancelled.items[0]).toEqual(marked.items[0])
  expect(cancelled.cancelRequested).toBe(true)
})
it.each(['wrong item','already marked','cancelled','active'] as const)('rejects a start for %s',kind=>{
  const {batch,job}=fixture()
  const input=kind==='already marked'?markShortBatchSubmission(batch,'one:landscape')
    :kind==='cancelled'?requestPersistedShortBatchCancellation(batch)
    :kind==='active'?{...batch,items:[acceptShortBatchJob(batch.items[0],job)]}:batch
  expect(()=>markShortBatchSubmission(input,kind==='wrong item'?'other':'one:landscape')).toThrow()
})
it.each(['cancelled','failed','running','succeeded'] as const)('rejects an unconfirmed marker labelled %s',state=>{
  const {batch}=fixture()
  expect(persistedShortBatchItemSchema.safeParse({...markShortBatchSubmission(batch,'one:landscape').items[0],state}).success).toBe(false)
})
