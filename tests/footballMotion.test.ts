import {it,expect,vi} from 'vitest'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {FootballMotionPanel} from '../src/components/FootballMotionPanel'
import {UiLanguageProvider} from '../src/components/UiLanguageProvider'
import {PersistentVersionHistory} from '../src/core/versioning'
import {translateUi} from '../src/core/uiMessages'
import {createFootballTactics} from '../src/core/footballTactics'
import {footballMotionFrame,parseFootballMotion,placeFootballMotion,validateFootballMotionProbe} from '../src/core/footballMotion'
import {encodeFootballMotion,footballMotionContainer,type MotionChunk} from '../src/core/footballMotionEncoder'
import {createProject,parseProject} from '../src/core/project'
function motion(){const from=createFootballTactics('de'),to=structuredClone(from);to.ball.x=83;to.players[0].x=27;return parseFootballMotion({schemaVersion:1,from,to,title:'Authored motion',durationMs:2000})}
it.each(['de','en','fr'] as const)('renders explicit motion preparation without camera/network/automatic encoding in %s',language=>{
  const fetch=vi.spyOn(globalThis,'fetch'),history=new PersistentVersionHistory({getItem:()=>null,setItem:()=>{},removeItem:()=>{}})
  try{const html=renderToStaticMarkup(createElement(UiLanguageProvider,{initialLanguage:language,children:createElement(FootballMotionPanel,{project:createProject('Motion'),history,workerUrl:'http://127.0.0.1:43117',workerToken:'PRIVATE',workerConnected:true,workerCapabilities:['asset-upload'],managedRoots:['/fixture/KINAOU'],onProjectChange:vi.fn()})}));expect(html).toContain(translateUi(language,'tactics.motionHeading'));expect(html).toContain(translateUi(language,'tactics.motionReview'));expect(html).not.toContain('PRIVATE');expect(fetch).not.toHaveBeenCalled()}finally{fetch.mockRestore()}
})
it('aborts while browser capability discovery is unresolved, without starting an encoder',async()=>{
  const configure=vi.fn();class Encoder{static isConfigSupported(){return new Promise(()=>{})}configure=configure}
  vi.stubGlobal('VideoEncoder',Encoder);vi.stubGlobal('VideoFrame',class{})
  try{const controller=new AbortController(),pending=encodeFootballMotion(motion(),controller.signal,vi.fn());controller.abort();await expect(pending).rejects.toThrow('cancelled');expect(configure).not.toHaveBeenCalled()}finally{vi.unstubAllGlobals()}
})
it('interpolates real player/ball coordinates with opening and closing holds and no retained arrows',()=>{
  const m=motion(),before=structuredClone(m)
  expect(footballMotionFrame(m,0).ball.x).toBe(43);expect(footballMotionFrame(m,10).ball.x).toBe(43)
  expect(footballMotionFrame(m,25).ball.x).toBe(63);expect(footballMotionFrame(m,25).players[0].x).toBe(17)
  expect(footballMotionFrame(m,40).ball.x).toBe(83);expect(footballMotionFrame(m,49).players[0].x).toBe(27)
  expect(footballMotionFrame(m,25).arrows).toEqual([]);expect(m).toEqual(before)
  expect(()=>footballMotionFrame(m,50)).toThrow();expect(()=>footballMotionFrame(m,-1)).toThrow()
})
it.each(['same','labels','team','language','number','duration','fraction','title','version'] as const)('rejects incompatible %s before encoding',issue=>{
  const m=motion()
  if(issue==='same')m.to=structuredClone(m.from)
  if(issue==='labels')m.to.players[0].label='Someone else'
  if(issue==='team')m.to.home='Other team'
  if(issue==='language')m.to.language='fr'
  if(issue==='number')m.to.players[0].number=99
  if(issue==='duration')m.durationMs=11000
  if(issue==='fraction')m.durationMs=2500
  if(issue==='title')m.title='x'.repeat(61)
  if(issue==='version')(m as any).schemaVersion=2
  expect(()=>parseFootballMotion(m)).toThrow()
})
it('requires exact measured encoded video and allows independent normal timeline placement',()=>{
  const good={width:1920,height:1080,videoCodec:'vp8',durationMs:2000,fps:25}
  expect(validateFootballMotionProbe(good,2000)).toBe(good)
  for(const patch of [{width:1280},{videoCodec:'png'},{durationMs:1960},{fps:24}])expect(()=>validateFootballMotionProbe({...good,...patch},2000)).toThrow()
  const p=parseProject({...createProject('Motion'),assets:[{id:'m',kind:'video',uri:'KINAOU/Assets/motion.ivf',managed:true,metadata:{sourceKind:'authored-football-motion-v1',motion:motion(),durationMs:2000}}]})
  const next=placeFootballMotion(p,'m','Animation');expect(p.tracks).toEqual([]);expect(next.tracks[0].clips[0]).toMatchObject({assetId:'m',durationMs:2000});expect(next.assets).toEqual(p.assets)
})
function chunks():MotionChunk[]{return Array.from({length:50},(_,i)=>({timestamp:i*40000,key:i===0,data:new Uint8Array([i,1,2])}))}
it('writes bounded little-endian IVF headers and exact per-frame timestamps without dropping/reordering',async()=>{
  const bytes=await footballMotionContainer(chunks(),50).arrayBuffer(),v=new DataView(bytes)
  expect(new TextDecoder().decode(bytes.slice(0,4))).toBe('DKIF');expect(new TextDecoder().decode(bytes.slice(8,12))).toBe('VP80')
  expect([v.getUint16(6,true),v.getUint16(12,true),v.getUint16(14,true),v.getUint32(16,true),v.getUint32(20,true),v.getUint32(24,true)]).toEqual([32,1920,1080,25,1,50])
  for(let i=0;i<50;i++){expect(v.getUint32(32+i*15,true)).toBe(3);expect(v.getBigUint64(36+i*15,true)).toBe(BigInt(i))}
})
it.each(['missing','timestamp','key','empty','size','bound'] as const)('refuses invalid %s IVF output',issue=>{
  const c=chunks();if(issue==='missing')c.pop();if(issue==='timestamp')c[20].timestamp=1;if(issue==='key')c[0].key=false;if(issue==='empty')c[2].data=new Uint8Array();if(issue==='size')c[0].data=new Uint8Array(32*1024**2)
  expect(()=>footballMotionContainer(c,issue==='bound'?300:50)).toThrow()
})
it.each(['success','abort','unsupported','error','drawError'] as const)('encoder handles %s with bounded frames, disposal and no network capture',async outcome=>{
  const create=vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:motion-owned'),revoke=vi.spyOn(URL,'revokeObjectURL').mockImplementation(()=>{}),closed=vi.fn(),frameClosed=vi.fn(),fetch=vi.spyOn(globalThis,'fetch'),abort=new AbortController()
  class Frame {timestamp:number;constructor(_canvas:unknown,opts:{timestamp:number}){this.timestamp=opts.timestamp}close(){frameClosed()}}
  class Encoder {static async isConfigSupported(){return {supported:outcome!=='unsupported'}}state='unconfigured';constructor(private init:{output:(chunk:unknown)=>void;error:(e:Error)=>void}){}configure(){this.state='configured'}encode(frame:Frame){if(outcome==='error'){this.init.error(Error('Encoder fixture error'));return}this.init.output({timestamp:frame.timestamp,type:frame.timestamp===0?'key':'delta',byteLength:3,copyTo:(dest:Uint8Array)=>dest.set([1,2,3])})}async flush(){}close(){this.state='closed';closed()}}
  class Image {onload?:()=>void;onerror?:()=>void;set src(_value:string){queueMicrotask(()=>outcome==='drawError'?this.onerror?.():this.onload?.())}}
  vi.stubGlobal('VideoEncoder',Encoder);vi.stubGlobal('VideoFrame',Frame);vi.stubGlobal('Image',Image);vi.stubGlobal('document',{createElement:()=>({getContext:()=>({drawImage:()=>{}})})})
  try{const result=encodeFootballMotion(motion(),abort.signal,done=>{if(outcome==='abort'&&done===3)abort.abort()});if(outcome==='success'){const file=await result;expect(file.type).toBe('video/x-ivf');expect(file.size).toBe(782);expect(frameClosed).toHaveBeenCalledTimes(50)}else await expect(result).rejects.toThrow();expect(closed).toHaveBeenCalledTimes(outcome==='unsupported'?0:1);expect(revoke).toHaveBeenCalledTimes(create.mock.calls.length);expect(fetch).not.toHaveBeenCalled()}finally{vi.unstubAllGlobals();create.mockRestore();revoke.mockRestore();fetch.mockRestore()}
})
