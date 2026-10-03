import type { KinaouProject } from './project'
import { buildFrameProvenance, frameMetadataSchema } from './frameProvenance'
import { sourceFrameSource } from './sourceFrame'
import type { SourceFrame } from './frameAnnotations'

/** Resolve a saved editing template, never treating retained hashes as a fresh file check. */
export function prepareFrameRevision(project:KinaouProject,assetId:string){
 buildFrameProvenance(project,assetId,'en')
 const asset=project.assets.find(a=>a.id===assetId)!,metadata=frameMetadataSchema.parse(asset.metadata),source=sourceFrameSource(project,metadata.sourceAsset.id)
 if(JSON.stringify(source)!==JSON.stringify(metadata.sourceAsset))throw Error('Original source record changed; extract a new frame explicitly instead')
 return {assetId,sourceId:source.id,parentPngSha256:metadata.annotations?.outputPngSha256??metadata.extraction.sha256,expected:structuredClone(metadata.extraction),marks:structuredClone(metadata.annotations?.marks??[])}
}
export type FrameRevisionSeed=ReturnType<typeof prepareFrameRevision>
/** A fresh, byte-verified extraction must reproduce the exact retained base PNG. */
export function matchFrameRevision(seed:FrameRevisionSeed,frame:SourceFrame){
 const keys=['sourcePath','requestedMs','sourceDurationMs','sourceSizeBytes','sourceWidth','sourceHeight','width','height','sizeBytes','sha256'] as const
 if(keys.some(key=>seed.expected[key]!==frame.record[key]))throw Error('Original frame no longer matches saved annotation base; old marks were not applied')
 return {parentAssetId:seed.assetId,parentPngSha256:seed.parentPngSha256}
}
