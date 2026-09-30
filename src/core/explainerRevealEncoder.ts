import { explainerDimensions, explainerFont, layoutExplainerCard, paintExplainerLayout } from './explainerCard'
import { explainerRevealDuration, explainerRevealOpacity, parseExplainerReveal, type ExplainerReveal } from './explainerReveal'
export interface RevealChunk {timestamp:number;key:boolean;data:Uint8Array<ArrayBuffer>}
/** VP8 IVF intermediate, 25 fps; format reference: webmproject/libvpx/ivfenc.c. */
export function explainerRevealContainer(chunks:RevealChunk[],value:ExplainerReveal):Blob {
  const reveal=parseExplainerReveal(value),[width,height]=explainerDimensions[reveal.card.format],count=explainerRevealDuration(reveal)/40
  if(chunks.length!==count||!chunks[0]?.key)throw Error('Incomplete reveal video')
  const header=new ArrayBuffer(32),view=new DataView(header)
  new Uint8Array(header).set(new TextEncoder().encode('DKIF'));view.setUint16(6,32,true)
  new Uint8Array(header,8,4).set(new TextEncoder().encode('VP80'));view.setUint16(12,width,true);view.setUint16(14,height,true);view.setUint32(16,25,true);view.setUint32(20,1,true);view.setUint32(24,count,true)
  const parts:BlobPart[]=[header];let bytes=32
  chunks.forEach((chunk,i)=>{if(chunk.timestamp!==i*40000||!chunk.data.byteLength)throw Error('Missing or reordered reveal frame');bytes+=12+chunk.data.byteLength;if(bytes>32*1024**2)throw Error('Reveal exceeds 32 MiB');const header=new ArrayBuffer(12),v=new DataView(header);v.setUint32(0,chunk.data.byteLength,true);v.setBigUint64(4,BigInt(i),true);parts.push(header,chunk.data)})
  return new Blob(parts,{type:'video/x-ivf'})
}
function check(signal:AbortSignal,deadline:number){if(signal.aborted)throw new DOMException('Reveal cancelled','AbortError');if(Date.now()>=deadline)throw Error('Reveal encoding timed out')}
function bounded<T>(promise:Promise<T>,signal:AbortSignal,deadline:number):Promise<T>{
  check(signal,deadline)
  return new Promise((resolve,reject)=>{
    let settled=false
    const cleanup=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort)}
    const fail=(error:unknown)=>{if(!settled){settled=true;cleanup();reject(error)}}
    const abort=()=>fail(new DOMException('Reveal cancelled','AbortError'))
    const timer=setTimeout(()=>fail(Error('Reveal encoding timed out')),Math.max(1,Math.min(15000,deadline-Date.now())))
    signal.addEventListener('abort',abort,{once:true});promise.then(value=>{if(!settled){settled=true;cleanup();resolve(value)}},fail);if(signal.aborted)abort()
  })
}
export interface PreparedExplainerReveal {file:File;frames:Array<{frame:number;png:string}>}
/** Explicit frame timestamps, not screen recording. Every frame is retained; bounded back-pressure and cancellation. */
export async function encodeExplainerReveal(input:ExplainerReveal,signal:AbortSignal,onProgress:(done:number,total:number)=>void):Promise<PreparedExplainerReveal>{
  const reveal=parseExplainerReveal(input),[width,height]=explainerDimensions[reveal.card.format],total=explainerRevealDuration(reveal)/40,deadline=Date.now()+90000
  check(signal,deadline)
  if(typeof VideoEncoder==='undefined'||typeof VideoFrame==='undefined')throw Error('Local WebCodecs unavailable; use the static explainer card instead')
  const config:VideoEncoderConfig={codec:'vp8',width,height,bitrate:4000000,framerate:25,latencyMode:'quality'}
  if(!(await bounded(VideoEncoder.isConfigSupported(config),signal,deadline)).supported)throw Error('Local VP8 unavailable; use the static explainer card instead')
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height
  const context=canvas.getContext('2d');if(!context)throw Error('Canvas unavailable')
  const layout=layoutExplainerCard(reveal.card,(text,size,bold)=>{context.font=explainerFont(size,bold);return context.measureText(text).width})
  const chunks:RevealChunk[]=[],frames:PreparedExplainerReveal['frames']=[];let failure:Error|undefined,bytes=32
  const encoder=new VideoEncoder({error:error=>{failure=error},output:chunk=>{
    bytes+=12+chunk.byteLength;if(bytes>32*1024**2||chunks.length>=total){failure=Error('Reveal output exceeds bounds');return}
    const data=new Uint8Array(chunk.byteLength);chunk.copyTo(data);chunks.push({timestamp:chunk.timestamp,key:chunk.type==='key',data})
  }})
  try{
    encoder.configure(config)
    for(let index=0;index<total;index++){
      check(signal,deadline);if(failure)throw failure
      paintExplainerLayout(context,layout,explainerRevealOpacity(reveal,index))
      if(index===0||index===Math.floor(total/2)||index===total-1){const png=canvas.toDataURL('image/png');if(!png.startsWith('data:image/png;base64,')||png.length>8*1024**2)throw Error('Invalid frame preview');frames.push({frame:index,png})}
      const frame=new VideoFrame(canvas,{timestamp:index*40000,duration:40000})
      try{encoder.encode(frame,{keyFrame:index===0})}finally{frame.close()}
      if(index%4===3){await bounded(encoder.flush(),signal,deadline);await bounded(new Promise<void>(resolve=>setTimeout(resolve,0)),signal,deadline)}
      check(signal,deadline);if(failure)throw failure;onProgress(index+1,total)
    }
    await bounded(encoder.flush(),signal,deadline);check(signal,deadline);if(failure)throw failure
    const blob=explainerRevealContainer(chunks,reveal)
    return {file:new File([blob],'explainer-reveal-'+crypto.randomUUID()+'.ivf',{type:blob.type}),frames}
  }finally{if(encoder.state!=='closed')encoder.close()}
}
