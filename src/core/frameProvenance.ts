import { z } from 'zod'
import { assetSchema, parseProject, type KinaouAsset, type KinaouProject } from './project'
import { sourceFrameResultSchema } from './sourceFrame'
import { frameAnnotationsSchema } from './frameAnnotations'
import { buildSourceProvenance, type SourceProvenanceReview } from './sourceProvenance'
import { isUiLanguage, type UiLanguage } from './uiLanguage'
import { translateUi, type UiMessageKey } from './uiMessages'

const sha=z.string().regex(/^[a-f0-9]{64}$/)
const annotationsSchema=z.object({schemaVersion:z.literal(1),renderer:z.literal('canvas-source-annotations-v1'),sourcePngSha256:sha,outputPngSha256:sha,marks:frameAnnotationsSchema.refine(m=>m.length>0)}).strict()
const metadataSchema=z.object({sourceKind:z.enum(['extracted-video-frame-v1','annotated-video-frame-v1']),extractionOnly:z.boolean(),sourceAsset:assetSchema,extraction:sourceFrameResultSchema.omit({pngBase64:true}),timing:z.literal('requested-time-frame-quantized'),sourceHashVerified:z.literal(false),modified:z.boolean().optional(),annotations:annotationsSchema.optional(),sizeBytes:z.number().int().min(33).max(16*1024**2),mimeType:z.literal('image/png')})
export function hasFrameProvenance(asset:KinaouAsset|undefined){return !!asset&&(asset.metadata.extraction!==undefined||['extracted-video-frame-v1','annotated-video-frame-v1'].includes(String(asset.metadata.sourceKind)))}

/** Historical records only. Never reads files, grants rights or verifies final exported pixels. */
export function buildFrameProvenance(project:KinaouProject,assetId:string,language:UiLanguage,now=new Date()):SourceProvenanceReview {
 if(!isUiLanguage(language))throw Error('Unsupported report language')
 const input=parseProject(project),matches=input.assets.filter(a=>a.id===assetId),asset=matches[0]
 if(matches.length!==1||!asset||asset.kind!=='image'||!asset.managed||!/^KINAOU\/Assets\/.+\.png$/.test(asset.uri)||/[\\\x00-\x1f\x7f]/.test(asset.uri)||asset.uri.split('/').some(p=>!p||p==='.'||p==='..'))throw Error('Select one managed source-frame PNG')
 const metadata=metadataSchema.parse(asset.metadata),{sourceAsset,extraction,annotations}=metadata,annotated=metadata.sourceKind==='annotated-video-frame-v1'
 if(sourceAsset.kind!=='video'||!sourceAsset.managed||sourceAsset.uri!==extraction.sourcePath||sourceAsset.id===asset.id||new TextEncoder().encode(JSON.stringify(sourceAsset)).length>48000)throw Error('Invalid retained source binding')
 if(extraction.requestedMs>=extraction.sourceDurationMs||extraction.sourceWidth*extraction.sourceHeight>33177600)throw Error('Invalid retained extraction measurements')
 if(typeof sourceAsset.metadata.durationMs==='number'&&Math.abs(sourceAsset.metadata.durationMs-extraction.sourceDurationMs)>1)throw Error('Retained source duration differs')
 if(annotated){if(metadata.extractionOnly||metadata.modified!==true||!annotations||annotations.sourcePngSha256!==extraction.sha256)throw Error('Annotated provenance is contradictory')}
 else if(!metadata.extractionOnly||metadata.modified===true||annotations||metadata.sizeBytes!==extraction.sizeBytes)throw Error('Original-frame provenance is contradictory')
 if(sourceAsset.metadata.sourceImport!==undefined)buildSourceProvenance({...input,assets:[sourceAsset],tracks:[]},sourceAsset.id,language,now)
 const currentSources=input.assets.filter(a=>a.id===sourceAsset.id)
 if(currentSources.length>1)throw Error('Ambiguous current source asset')
 const currentSourceState=currentSources.length===0?'missing':JSON.stringify(currentSources[0])===JSON.stringify(sourceAsset)?'same-record':'changed-record'
 const uses=input.tracks.flatMap(track=>track.clips.filter(c=>c.assetId===asset.id).map(clip=>{
   const endMs=clip.startMs+clip.durationMs;if(!Number.isSafeInteger(endMs))throw Error('Timeline range exceeds safe numeric bounds')
   return {trackId:track.id,trackName:track.name,trackMuted:track.muted,clipId:clip.id,startMs:clip.startMs,endMs,clip:structuredClone(clip)}
 }))
 const t=(key:UiMessageKey,values?:Record<string,string|number>)=>translateUi(language,key,values),name=typeof asset.metadata.name==='string'?asset.metadata.name:asset.id,createdAt=now.toISOString(),outputSha=annotations?.outputPngSha256??extraction.sha256
 const payload={schemaVersion:1,type:'kinaou-private-frame-provenance',documentLanguage:language,createdAt,project:{id:input.id,title:input.title},asset:{id:asset.id,name,uri:asset.uri,reportedOffline:asset.offline},modified:annotated,currentSourceState,limitations:t('frameReport.boundary'),currentFileHashReverified:false,sourceFileHashReverified:false,finishedExportInspected:false,legalClearance:false,sourceAsset,extraction,annotations:annotations??null,outputPngSha256:outputSha,timelineUses:uses}
 const lines=[t('frameReport.heading'),t('sourceReport.private'),t('frameReport.boundary'),'',name,t('sourceReport.created',{date:createdAt}),t('sourceReport.project')+': '+JSON.stringify(input.title),t(annotated?'frameReport.modified':'frameReport.unmodified'),t(`frameReport.${currentSourceState}`),t('sourceReport.storedPath')+': '+asset.uri,t('frameReport.source')+': '+sourceAsset.uri,t('frameReport.measurements',{time:extraction.requestedMs/1000,width:extraction.width,height:extraction.height,bytes:extraction.sizeBytes}),t('frameReport.baseHash')+': '+extraction.sha256,t('frameReport.outputHash')+': '+outputSha,t('frameReport.extracted')+': '+extraction.extractedAt,'',t('frameReport.marks',{count:annotations?.marks.length??0})]
 for(const mark of annotations?.marks??[])lines.push(t(`frameMarks.${mark.kind}`)+' · '+t(`frameMarks.${mark.color}`)+` · (${mark.x1}, ${mark.y1}) → (${mark.x2}, ${mark.y2}) %`+(mark.kind==='label'?' · '+JSON.stringify(mark.text):''))
 lines.push('',t('frameReport.sourceRecord'),JSON.stringify(sourceAsset,null,2),'',t('sourceReport.uses',{count:uses.length}),t('sourceReport.boundary'))
 for(const use of uses)lines.push('',JSON.stringify(use.trackName)+' · '+use.clipId,t('sourceReport.timelineRange',{start:use.startMs,end:use.endMs}),t(use.trackMuted?'sourceReport.muted':'sourceReport.notMuted'))
 const base='kinaou-frame-'+outputSha.slice(0,16),files={text:{filename:base+'.txt',mimeType:'text/plain;charset=utf-8',text:lines.join('\n')+'\n'},json:{filename:base+'.json',mimeType:'application/json;charset=utf-8',text:JSON.stringify(payload,null,2)+'\n'}}
 for(const file of Object.values(files))if(new TextEncoder().encode(file.text).length>4*1024**2)throw Error('Frame report exceeds 4 MiB')
 return {name,createdAt,uses:uses.length,files}
}
