import { z } from 'zod'
import type { parseSourceFrameResult } from './sourceFrame'

const coordinate = z.number().finite().min(0).max(100)
export const frameMarkSchema = z.object({ id: z.string().uuid(), kind: z.enum(['arrow','box','label']), color: z.enum(['yellow','red','white']), x1: coordinate, y1: coordinate, x2: coordinate, y2: coordinate, text: z.string().max(40).refine(s => !/[\x00-\x1f\x7f]/.test(s) && new TextDecoder('utf-8',{fatal:true}).decode(new TextEncoder().encode(s)) === s) }).strict()
export const frameAnnotationsSchema = z.array(frameMarkSchema).max(16).superRefine((marks, context) => {
  if (new Set(marks.map(m => m.id)).size !== marks.length) context.addIssue({code:'custom',message:'Duplicate annotation IDs'})
  for (const mark of marks) {
    if (mark.kind === 'label' && !mark.text.trim()) context.addIssue({code:'custom',message:'Annotation label is empty'})
    if (mark.kind === 'box' && (Math.abs(mark.x2-mark.x1)<1 || Math.abs(mark.y2-mark.y1)<1)) context.addIssue({code:'custom',message:'Annotation box is too small'})
    if (mark.kind === 'arrow' && Math.hypot(mark.x2-mark.x1,mark.y2-mark.y1)<1) context.addIssue({code:'custom',message:'Annotation arrow is too short'})
  }
})
export type FrameMark = z.infer<typeof frameMarkSchema>
export type SourceFrame = Awaited<ReturnType<typeof parseSourceFrameResult>>
export const frameMarkColors = { yellow:'#fde047',red:'#ef4444',white:'#ffffff' } as const
export function newFrameMark(kind: FrameMark['kind'], text = 'Text'): FrameMark { return {id:crypto.randomUUID(),kind,color:'yellow',x1:20,y1:30,x2:75,y2:70,text:kind==='label'?text:''} }
export function frameAnnotationPoint(clientX:number, clientY:number, rect:{left:number;top:number;width:number;height:number}) {
  if (![clientX,clientY,rect.left,rect.top,rect.width,rect.height].every(Number.isFinite) || rect.width<=0 || rect.height<=0) throw Error('Invalid annotation canvas bounds')
  return {x:Math.round(Math.max(0,Math.min(100,(clientX-rect.left)/rect.width*100))*100)/100,y:Math.round(Math.max(0,Math.min(100,(clientY-rect.top)/rect.height*100))*100)/100}
}
/** Coordinates are displayed and persisted; no inference of real positions or motion. */
export function paintFrameAnnotations(context:CanvasRenderingContext2D, width:number, height:number, input:FrameMark[]) {
  if (!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>1920||height>1080) throw Error('Invalid annotation image size')
  const marks=frameAnnotationsSchema.parse(input),stroke=Math.max(2,Math.min(width,height)*0.009),font=Math.max(10,height*0.055)
  for(const mark of marks){
    const x1=mark.x1*width/100,y1=mark.y1*height/100,x2=mark.x2*width/100,y2=mark.y2*height/100,color=frameMarkColors[mark.color]
    context.save();context.strokeStyle=color;context.fillStyle=color;context.lineWidth=stroke;context.lineJoin='round';context.lineCap='round'
    try {
      if(mark.kind==='box')context.strokeRect(Math.min(x1,x2),Math.min(y1,y2),Math.abs(x2-x1),Math.abs(y2-y1))
      else if(mark.kind==='arrow'){
        const angle=Math.atan2(y2-y1,x2-x1),head=Math.min(Math.hypot(x2-x1,y2-y1)*0.4,stroke*5)
        context.beginPath();context.moveTo(x1,y1);context.lineTo(x2,y2);context.stroke();context.beginPath();context.moveTo(x2,y2);context.lineTo(x2-head*Math.cos(angle-0.5),y2-head*Math.sin(angle-0.5));context.lineTo(x2-head*Math.cos(angle+0.5),y2-head*Math.sin(angle+0.5));context.closePath();context.fill()
      }else{
        context.font=`700 ${font}px Arial,sans-serif`;context.textBaseline='top';const padding=stroke*2,textWidth=context.measureText(mark.text).width
        if(textWidth+padding*2>width||font*1.4+padding*2>height)throw Error('Annotation label does not fit; shorten the text')
        const left=Math.min(x1,width-textWidth-padding*2),top=Math.min(y1,height-font*1.4-padding*2)
        context.fillStyle='#111827';context.fillRect(left,top,textWidth+padding*2,font*1.4+padding*2);context.fillStyle=color;context.fillText(mark.text,left+padding,top+padding)
      }
    }finally{context.restore()}
  }
}
export async function loadFrameBitmap(frame: SourceFrame):Promise<ImageBitmap> {
  if(typeof createImageBitmap!=='function')throw Error('Image decoding unavailable')
  const bytes=await frame.file.arrayBuffer(),hash=await framePngHash(bytes)
  if(bytes.byteLength!==frame.record.sizeBytes||hash!==frame.record.sha256||frame.file.type!=='image/png')throw Error('Original PNG differs from the reviewed frame')
  const image=await new Promise<ImageBitmap>((resolve,reject)=>{let expired=false;const timer=setTimeout(()=>{expired=true;reject(Error('Frame decoding timed out'))},15000);createImageBitmap(frame.file).then(value=>{clearTimeout(timer);if(expired)value.close();else resolve(value)},error=>{clearTimeout(timer);reject(error)})})
  if(image.width!==frame.record.width||image.height!==frame.record.height){image.close();throw Error('Decoded PNG dimensions differ')}
  return image
}
export async function framePngHash(bytes:ArrayBuffer) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('') }
export interface AnnotatedFrame { file:File; provenance:{schemaVersion:1;renderer:'canvas-source-annotations-v1';sourcePngSha256:string;outputPngSha256:string;marks:FrameMark[]} }
/** Actual local PNG rendering. The base video and base frame are never overwritten. */
export async function rasterizeFrameAnnotations(frame:SourceFrame, input:FrameMark[]):Promise<AnnotatedFrame> {
  const marks=frameAnnotationsSchema.parse(input);if(!marks.length)throw Error('Add at least one annotation')
  const image=await loadFrameBitmap(frame)
  try{
    const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const context=canvas.getContext('2d');if(!context)throw Error('Canvas unavailable')
    context.drawImage(image,0,0);paintFrameAnnotations(context,image.width,image.height,marks)
    const blob=await new Promise<Blob>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Annotated PNG encoding timed out')),15000);try{canvas.toBlob(value=>{clearTimeout(timer);if(value)resolve(value);else reject(Error('Annotated PNG encoding failed'))},'image/png')}catch(cause){clearTimeout(timer);reject(cause)}})
    if(blob.type!=='image/png'||blob.size<33||blob.size>16*1024**2)throw Error('Annotated PNG exceeds bounds')
    const outputPngSha256=await framePngHash(await blob.arrayBuffer())
    return {file:new File([blob],`annotated-frame-${crypto.randomUUID()}.png`,{type:'image/png'}),provenance:{schemaVersion:1,renderer:'canvas-source-annotations-v1',sourcePngSha256:frame.record.sha256,outputPngSha256,marks}}
  }finally{image.close()}
}
