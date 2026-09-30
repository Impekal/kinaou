import { parseFootballTactics, type FootballTacticsBoard } from './footballTactics'
import { parseProject, type KinaouProject } from './project'
import { placeAssetOnTrack } from './timelinePlacement'
export interface FootballMotion { schemaVersion: 1; from: FootballTacticsBoard; to: FootballTacticsBoard; title: string; durationMs: number }
export const footballMotionFps = 25
export function parseFootballMotion(value: unknown): FootballMotion {
  const v = value as FootballMotion
  if (v?.schemaVersion !== 1 || !Number.isSafeInteger(v.durationMs) || v.durationMs < 2000 || v.durationMs > 10000 || v.durationMs % 1000 !== 0) throw Error('Choose a whole duration from 2 to 10 seconds')
  const from = parseFootballTactics(v.from), to = parseFootballTactics(v.to)
  const identity = (b: FootballTacticsBoard) => JSON.stringify([b.language,b.home,b.away,b.players.map(p=>[p.id,p.team,p.number,p.label])])
  if (identity(from) !== identity(to)) throw Error('Both boards must retain the same language, teams, player identities and labels. Edit a saved board as a new draft to create the second pose.')
  const title = parseFootballTactics({...from,title:v.title}).title
  if (JSON.stringify([from.players.map(p=>[p.x,p.y]),from.ball]) === JSON.stringify([to.players.map(p=>[p.x,p.y]),to.ball])) throw Error('At least one player or the ball must change position')
  return {schemaVersion:1,from,to,title,durationMs:v.durationMs}
}
/** Authored straight-line interpolation with half-second opening/closing holds, not tracking. */
export function footballMotionFrame(value: FootballMotion, frame: number): FootballTacticsBoard {
  const motion=parseFootballMotion(value), count=motion.durationMs/1000*footballMotionFps
  if(!Number.isInteger(frame)||frame<0||frame>=count)throw Error('Motion frame out of range')
  const progress=Math.max(0,Math.min(1,(frame*40-500)/(motion.durationMs-1000)))
  const lerp=(a:number,b:number)=>a+(b-a)*progress
  return parseFootballTactics({...motion.from,title:motion.title,arrows:[],ball:{x:lerp(motion.from.ball.x,motion.to.ball.x),y:lerp(motion.from.ball.y,motion.to.ball.y)},players:motion.from.players.map((p,i)=>({...p,x:lerp(p.x,motion.to.players[i].x),y:lerp(p.y,motion.to.players[i].y)}))})
}
export function validateFootballMotionProbe<T extends {width?:number;height?:number;videoCodec?:string;durationMs?:number;fps?:number}>(probe:T, durationMs:number):T {
  if(probe.width!==1920||probe.height!==1080||probe.videoCodec!=='vp8'||probe.durationMs!==durationMs||probe.fps!==footballMotionFps)throw Error('Motion file must be measured VP8, 1920×1080, 25 fps and the exact authored duration')
  return probe
}
export function placeFootballMotion(project:KinaouProject,assetId:string,name:string):KinaouProject {
  const asset=project.assets.find(a=>a.id===assetId)
  if(!asset||asset.kind!=='video'||asset.metadata.sourceKind!=='authored-football-motion-v1'||!name.trim()||name.length>120)throw Error('Choose a registered authored motion video')
  parseFootballMotion(asset.metadata.motion)
  const id=crypto.randomUUID(),next=parseProject({...project,tracks:[...project.tracks,{id,name,type:'video',clips:[]}]})
  return parseProject(placeAssetOnTrack(next,assetId,id))
}
