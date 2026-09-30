import { footballBoardSvg } from './footballTactics'
import { footballMotionFrame, footballMotionFps, parseFootballMotion, type FootballMotion } from './footballMotion'
const config: VideoEncoderConfig = {codec:'vp8',width:1920,height:1080,bitrate:4000000,framerate:footballMotionFps,latencyMode:'quality'}
export interface MotionChunk {timestamp:number;key:boolean;data:Uint8Array<ArrayBuffer>}
/** IVF stores individual VP8 frames with a fixed 1/25 timebase. No third-party muxer required.
 * Format reference: https://github.com/webmproject/libvpx/blob/main/ivfenc.c */
export function footballMotionContainer(chunks:MotionChunk[],frameCount:number):Blob {
  if(!Number.isInteger(frameCount)||frameCount<50||frameCount>250||chunks.length!==frameCount||!chunks[0]?.key)throw Error('Incomplete motion video')
  const header=new ArrayBuffer(32),view=new DataView(header)
  new Uint8Array(header).set(new TextEncoder().encode('DKIF'));view.setUint16(6,32,true)
  new Uint8Array(header,8,4).set(new TextEncoder().encode('VP80'));view.setUint16(12,1920,true);view.setUint16(14,1080,true);view.setUint32(16,25,true);view.setUint32(20,1,true);view.setUint32(24,frameCount,true)
  const parts:BlobPart[]=[header];let bytes=32
  chunks.forEach((chunk,i)=>{if(chunk.timestamp!==i*40000||!chunk.data.byteLength)throw Error('Missing or reordered encoded frame');bytes+=12+chunk.data.byteLength;if(bytes>32*1024**2)throw Error('Motion file exceeds 32 MiB');const frame=new ArrayBuffer(12),v=new DataView(frame);v.setUint32(0,chunk.data.byteLength,true);v.setBigUint64(4,BigInt(i),true);parts.push(frame,chunk.data)})
  return new Blob(parts,{type:'video/x-ivf'})
}
function cancelled(signal:AbortSignal,deadline:number){if(signal.aborted)throw new DOMException('Motion preparation cancelled','AbortError');if(Date.now()>deadline)throw Error('Motion preparation timed out')}
function bounded<T>(promise:Promise<T>,signal:AbortSignal,deadline:number):Promise<T>{
  cancelled(signal,deadline)
  return new Promise((resolve,reject)=>{
    let settled=false
    const cleanup=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort)}
    const fail=(error:unknown)=>{if(!settled){settled=true;cleanup();reject(error)}}
    const abort=()=>fail(new DOMException('Motion preparation cancelled','AbortError'))
    const timer=setTimeout(()=>fail(Error('Motion preparation timed out')),Math.max(1,Math.min(15000,deadline-Date.now())))
    signal.addEventListener('abort',abort,{once:true})
    promise.then(value=>{if(!settled){settled=true;cleanup();resolve(value)}},fail)
    if(signal.aborted)abort()
  })
}
export async function encodeFootballMotion(value:FootballMotion,signal:AbortSignal,onProgress:(done:number,total:number)=>void):Promise<File>{
  const motion=parseFootballMotion(value),total=motion.durationMs/40,deadline=Date.now()+90000
  if(typeof VideoEncoder==='undefined'||typeof VideoFrame==='undefined')throw Error('This browser does not provide local WebCodecs encoding; use the static explanation sequence')
  if(!(await bounded(VideoEncoder.isConfigSupported(config),signal,deadline)).supported)throw Error('Local VP8 encoding unavailable; use the static explanation sequence')
  const canvas=document.createElement('canvas');canvas.width=1920;canvas.height=1080
  const context=canvas.getContext('2d');if(!context)throw Error('Canvas unavailable')
  const chunks:MotionChunk[]=[];let failure:Error|undefined,bytes=0
  const encoder=new VideoEncoder({error:e=>{failure=e},output:chunk=>{bytes+=chunk.byteLength;if(bytes>32*1024**2){failure=Error('Motion file exceeds 32 MiB');return}const data=new Uint8Array(chunk.byteLength);chunk.copyTo(data);chunks.push({timestamp:chunk.timestamp,key:chunk.type==='key',data})}})
  try{
    encoder.configure(config)
    for(let index=0;index<total;index++){
      cancelled(signal,deadline);if(failure)throw failure
      const url=URL.createObjectURL(new Blob([footballBoardSvg(footballMotionFrame(motion,index))],{type:'image/svg+xml'})),image=new Image()
      try{await bounded(new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(Error('Motion frame drawing failed'));image.src=url}),signal,deadline);cancelled(signal,deadline);context.drawImage(image,0,0)}finally{image.onload=null;image.onerror=null;URL.revokeObjectURL(url)}
      const frame=new VideoFrame(canvas,{timestamp:index*40000,duration:40000})
      try{encoder.encode(frame,{keyFrame:index===0})}finally{frame.close()}
      // Back-pressure, not dropped frames or wall-clock recording; every timestamp is retained.
      if(index%4===3)await bounded(encoder.flush(),signal,deadline)
      cancelled(signal,deadline);if(failure)throw failure;onProgress(index+1,total)
    }
    await bounded(encoder.flush(),signal,deadline);cancelled(signal,deadline);if(failure)throw failure
    const blob=footballMotionContainer(chunks,total)
    return new File([blob],'football-motion-'+crypto.randomUUID()+'.ivf',{type:blob.type})
  }finally{if(encoder.state!=='closed')encoder.close()}
}
