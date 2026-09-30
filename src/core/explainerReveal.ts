import { z } from 'zod'
import { parseExplainerCard, explainerDimensions, type ExplainerCard } from './explainerCard'
import { parseProject, type KinaouProject } from './project'
import { placeAssetOnTrack } from './timelinePlacement'

export interface ExplainerReveal { schemaVersion:1; sourceAssetId:string; card:ExplainerCard; stepMs:number }
const schema=z.object({schemaVersion:z.literal(1),sourceAssetId:z.string().min(1).max(200),card:z.unknown(),stepMs:z.union([z.literal(1000),z.literal(2000),z.literal(3000)])}).strict()
export function parseExplainerReveal(value:unknown):ExplainerReveal {const v=schema.parse(value);return {...v,card:parseExplainerCard(v.card)}}
export function explainerRevealDuration(value:ExplainerReveal){const v=parseExplainerReveal(value);return 1000+v.card.points.length*v.stepMs}
/** One-second title hold, then cumulative quarter-second fades. Authored timing, not narration alignment. */
export function explainerRevealOpacity(value:ExplainerReveal,frame:number):number[]{
  const v=parseExplainerReveal(value),total=explainerRevealDuration(v)/40
  if(!Number.isInteger(frame)||frame<0||frame>=total)throw Error('Reveal frame out of range')
  return v.card.points.map((_,index)=>Math.max(0,Math.min(1,(frame*40-1000-index*v.stepMs)/240)))
}
export function createExplainerReveal(project:KinaouProject,assetId:string,stepMs:number):ExplainerReveal {
  const asset=project.assets.find(a=>a.id===assetId)
  if(!asset||asset.kind!=='image'||asset.metadata.sourceKind!=='authored-explainer-card-v1')throw Error('Choose a saved authored explainer card')
  // Reads the retained definition only, deliberately no claim of inspecting the original PNG.
  return parseExplainerReveal({schemaVersion:1,sourceAssetId:asset.id,card:asset.metadata.card,stepMs})
}
export function validateExplainerRevealProbe<T extends {width?:number;height?:number;videoCodec?:string;durationMs?:number;fps?:number}>(probe:T,value:ExplainerReveal):T {
  const v=parseExplainerReveal(value),[width,height]=explainerDimensions[v.card.format]
  if(probe.width!==width||probe.height!==height||probe.videoCodec!=='vp8'||probe.durationMs!==explainerRevealDuration(v)||probe.fps!==25)throw Error('Reveal video does not match the reviewed dimensions, VP8 codec, duration or 25 fps')
  return probe
}
export function placeExplainerReveal(project:KinaouProject,assetId:string,name:string):KinaouProject {
  const asset=project.assets.find(a=>a.id===assetId)
  if(!asset||asset.kind!=='video'||asset.metadata.sourceKind!=='authored-explainer-reveal-v1'||!name.trim()||name.length>200)throw Error('Choose a saved reveal video')
  const reveal=parseExplainerReveal(asset.metadata.reveal)
  if(asset.metadata.durationMs!==explainerRevealDuration(reveal))throw Error('Saved duration does not match authored timing')
  const id=crypto.randomUUID(),next=parseProject({...project,tracks:[...project.tracks,{id,name,type:'video',clips:[]}]})
  return parseProject(placeAssetOnTrack(next,assetId,id))
}
