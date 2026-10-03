import {lookup} from 'node:dns/promises'
import {request as httpsRequest,Agent} from 'node:https'
import {isIP} from 'node:net'
import {createHash} from 'node:crypto'
import {isPublicSourceAddress} from './public-source.mjs'
import {sourceDownloadUrl,sourceImportLimits as limits} from './source-import-protocol.mjs'
function abortable(promise,signal){return new Promise((resolve,reject)=>{const abort=()=>reject(signal.reason??Error('Download cancelled'));if(signal.aborted)return abort();signal.addEventListener('abort',abort,{once:true});promise.then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort))})}
/** Writes only to the caller-owned exclusive temporary descriptor. Never buffers the whole video. */
export async function downloadPublicMp4(value,{handle,signal,progress=()=>{},lookupImpl=lookup,requestImpl=httpsRequest}={}){
  const requestedUrl=sourceDownloadUrl(value),redirectUrls=[],seen=new Set();let current=requestedUrl
  signal=AbortSignal.any([signal??new AbortController().signal,AbortSignal.timeout(limits.timeoutMs)])
  for(;;){
    signal.throwIfAborted();if(seen.has(current))throw Error('Source download redirect loop');seen.add(current)
    const url=new URL(current),addresses=await abortable(lookupImpl(url.hostname,{all:true,verbatim:true}),signal)
    if(!Array.isArray(addresses)||!addresses.length||addresses.length>32||addresses.some(a=>!isPublicSourceAddress(a.address)||isIP(a.address)!==a.family))throw Error('Source download must resolve exclusively to public addresses')
    const pinned=addresses.find(a=>a.family===4)??addresses[0],agent=new Agent({keepAlive:false,maxSockets:1});let response
    try{
      response=await new Promise((resolve,reject)=>{const request=requestImpl(url,{method:'GET',agent,signal,servername:url.hostname,family:pinned.family,autoSelectFamily:false,lookup:(_host,options,callback)=>options?.all?callback(null,[pinned]):callback(null,pinned.address,pinned.family),headers:{accept:'video/mp4','accept-encoding':'identity','user-agent':'KINAOU-PersonalSourceImport/1.0'},maxHeaderSize:16384},resolve);request.on('error',reject);request.end()})
      if([301,302,303,307,308].includes(response.statusCode)){if(redirectUrls.length>=limits.redirects||typeof response.headers.location!=='string')throw Error('Unsupported source download redirect');current=sourceDownloadUrl(new URL(response.headers.location,url).href);redirectUrls.push(current);continue}
      if(response.statusCode!==200)throw Error(`Source download returned HTTP ${response.statusCode}; no access restriction will be bypassed`)
      if(!/^video\/mp4(?:\s*;|$)/i.test(response.headers['content-type']??'')||(response.headers['content-encoding']&&response.headers['content-encoding']!=='identity'))throw Error('Only uncompressed video/mp4 downloads are supported')
      const declared=response.headers['content-length'];if(declared!==undefined&&(!/^\d+$/.test(declared)||!Number.isSafeInteger(Number(declared))||Number(declared)<=0||Number(declared)>limits.bytes))throw Error('Source MP4 exceeds the 512 MiB limit or has an invalid length')
      let sizeBytes=0;const digest=createHash('sha256'),header=Buffer.alloc(12)
      for await(const chunk of response){signal.throwIfAborted();if(sizeBytes+chunk.length>limits.bytes)throw Error('Source MP4 exceeds the 512 MiB limit');if(sizeBytes<12)chunk.copy(header,sizeBytes,0,Math.min(chunk.length,12-sizeBytes));digest.update(chunk);let offset=0;while(offset<chunk.length){signal.throwIfAborted();const{bytesWritten}=await handle.write(chunk,offset,chunk.length-offset,sizeBytes+offset);if(!bytesWritten)throw Error('Source download write stopped');offset+=bytesWritten}sizeBytes+=chunk.length;progress(sizeBytes)}
      if(sizeBytes<12||header.toString('ascii',4,8)!=='ftyp'||(declared!==undefined&&sizeBytes!==Number(declared)))throw Error('Source MP4 is empty, truncated or lacks its MP4 header')
      signal.throwIfAborted();await handle.sync()
      return{requestedUrl,finalUrl:current,redirectUrls,sizeBytes,sha256:digest.digest('hex'),mimeType:'video/mp4',retrievedAt:new Date().toISOString()}
    }finally{response?.destroy();agent.destroy()}
  }
}
