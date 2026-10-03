import path from 'node:path'
import {constants} from 'node:fs'
import {mkdir,open,link,unlink,statfs} from 'node:fs/promises'
import {sourceArchiveIO as io} from './project-source-archive.mjs'
import {downloadPublicMp4} from './source-import-download.mjs'
import {sourceImportRequestSchema,sourceImportIdSchema,sourceImportPath,sourceImportLimits,validateSourceImportJob} from './source-import-protocol.mjs'
export function createSourceImportRuntime({root,probe,download=downloadPublicMp4}){
  const active=new Map();let starting=false
  async function location(id,create=false){const canonical=await io.canonical(root),parent=await io.directory(canonical,['Assets','SourceImports'],create);return{canonical,parent,folder:path.join(parent,id)}}
  async function disk(id){const{canonical}=await location(id),bytes=await io.readRecord(canonical,['Assets','SourceImports',id,'status.json'],32768);const job=validateSourceImportJob(JSON.parse(bytes));if(job.request.id!==id)throw Error('Source import identity differs');if(!['succeeded','failed','cancelled'].includes(job.state))return{...job,state:'failed',error:'Source import was interrupted; it is not automatically restarted',result:undefined};if(job.result){const r=job.result;if(await io.hashFile(canonical,['Assets','SourceImports',id,'original.mp4'],r.sizeBytes)!==r.sha256)throw Error('Downloaded source no longer matches its original hash')}return job}
  async function status(value){const id=sourceImportIdSchema.parse(value.id);return active.has(id)?structuredClone(active.get(id).job):disk(id)}
  async function run(entry,folder,canonical){let handle,promoted=false
    const save=async(job=entry.job)=>{job.updatedAt=new Date().toISOString();await io.writeStatus(folder,job)}
    try{
      const space=await statfs(folder);if(space.bavail*space.bsize<sourceImportLimits.bytes+64*1024**2)throw Error('Insufficient free space for a bounded source download')
      entry.job.state='downloading';await save();entry.abort.signal.throwIfAborted()
      handle=await open(path.join(folder,'download.part'),constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600)
      const result=await download(entry.job.request.downloadUrl,{handle,signal:entry.abort.signal,progress:n=>{entry.job.receivedBytes=n}});await handle.close();handle=undefined
      entry.abort.signal.throwIfAborted();entry.job.state='probing';await save()
      if(await io.hashFile(canonical,['Assets','SourceImports',entry.job.request.id,'download.part'],result.sizeBytes)!==result.sha256)throw Error('Downloaded source readback hash differs')
      const measured=await probe(path.join(folder,'download.part'));entry.abort.signal.throwIfAborted()
      const managedPath=sourceImportPath(entry.job.request.id),finished=validateSourceImportJob({...entry.job,state:'succeeded',receivedBytes:result.sizeBytes,result:{...result,managedPath,probe:{...measured,path:managedPath},legalClearance:false}})
      entry.job.state='committing' // Cancellation after this point must observe the actual final result.
      await link(path.join(folder,'download.part'),path.join(folder,'original.mp4'));promoted=true
      await save(finished)
    }catch(cause){const failed={...entry.job,state:!promoted&&entry.abort.signal.aborted?'cancelled':'failed',result:undefined,error:io.failure(cause)};await save(failed).catch(()=>undefined)}
    finally{await handle?.close().catch(()=>undefined);await unlink(path.join(folder,'download.part')).catch(()=>undefined);active.delete(entry.job.request.id)}
  }
  return{
    async start(value){const request=sourceImportRequestSchema.parse(value),id=request.id
      if(active.has(id)){const job=await status({id});if(!io.equal(job.request,request))throw Error('Source import ID is already bound to another request');return job}
      if(starting||active.size)throw Error('Another source download is already running')
      starting=true
      try{const{canonical,parent,folder}=await location(id,true)
        try{await mkdir(folder,{mode:0o700})}catch(cause){if(cause.code!=='EEXIST')throw cause;const job=await disk(id);if(!io.equal(job.request,request))throw Error('Source import ID is already bound to another request');return job}
        await io.directory(parent,[id]);const time=new Date().toISOString(),entry={job:{request,state:'queued',createdAt:time,updatedAt:time,receivedBytes:0},abort:new AbortController()}
        await io.writeStatus(folder,entry.job);active.set(id,entry);void run(entry,folder,canonical);return structuredClone(entry.job)
      }finally{starting=false}
    },status,
    async cancel(value){const id=sourceImportIdSchema.parse(value.id),entry=active.get(id);if(entry&&entry.job.state!=='committing'&&entry.job.state!=='succeeded')entry.abort.abort(Error('Source download cancelled'));return status({id})}
  }
}
