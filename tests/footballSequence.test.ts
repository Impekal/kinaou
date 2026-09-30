import { it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createProject, parseProject } from '../src/core/project'
import { createFootballTactics } from '../src/core/footballTactics'
import { commitFootballSequence, footballSequenceAsset, reviewFootballSequence } from '../src/core/footballSequence'
import { FootballSequencePanel } from '../src/components/FootballSequencePanel'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import { PersistentVersionHistory } from '../src/core/versioning'
import { translateUi } from '../src/core/uiMessages'
const project = () => parseProject({...createProject('Sequence'),assets:['a','b'].map(id=>({id,kind:'image',managed:true,uri:'KINAOU/Assets/'+id+'.png',metadata:{sourceKind:'authored-football-tactics-v1',board:createFootballTactics('en')}})),tracks:[{id:'existing',name:'Keep',type:'image',clips:[]}]})
const draft = () => ({name:'Explanation',startMs:1000,steps:[{assetId:'b',durationMs:1500},{assetId:'a',durationMs:2200},{assetId:'b',durationMs:1000}]})
it('builds a reviewed exact-order hard-cut track with stable IDs, untouched existing state, and serializable clips',()=>{
  const before=project(),copy=structuredClone(before),input=draft(),review=reviewFootballSequence(before,input),save=vi.fn()
  input.steps.reverse();expect(review.draft.steps.map(s=>s.assetId)).toEqual(['b','a','b'])
  expect(review.endMs).toBe(5700);expect(before).toEqual(copy)
  commitFootballSequence(before,review,true,vi.fn(),save)
  const next=parseProject(JSON.parse(JSON.stringify(save.mock.calls[0][0])))
  expect(next.assets).toEqual(before.assets);expect(next.tracks[0]).toEqual(before.tracks[0]);expect(next.tracks[1].id).toBe(review.trackId)
  expect(next.tracks[1].clips.map(c=>[c.assetId,c.startMs,c.durationMs])).toEqual([['b',1000,1500],['a',2500,2200],['b',4700,1000]])
  expect(new Set(next.tracks[1].clips.map(c=>c.id)).size).toBe(3)
  expect(next.tracks[1].clips.every(c=>!c.transitionIn&&!c.motion)).toBe(true)
  expect(()=>commitFootballSequence(before,review,true,vi.fn(),save)).toThrow();expect(save).toHaveBeenCalledTimes(1)
})
it.each(['empty','name','start','count','missing','offline','unmanaged','path','board','kind','duration','fraction','tooLong'] as const)('refuses invalid %s without project changes',issue=>{
  const p=project(),d=draft()
  if(issue==='empty')d.name=' '
  if(issue==='name')d.name='x'.repeat(121)
  if(issue==='start')d.startMs=3600001
  if(issue==='count')d.steps=d.steps.slice(0,1)
  if(issue==='missing')d.steps[0].assetId='absent'
  if(issue==='offline')p.assets[1].offline=true
  if(issue==='unmanaged')p.assets[1].managed=false
  if(issue==='path')p.assets[1].uri='KINAOU/Assets/../outside.png'
  if(issue==='board')p.assets[1].metadata.board={}
  if(issue==='kind')p.assets[1].kind='video'
  if(issue==='duration')d.steps[0].durationMs=0
  if(issue==='fraction')d.steps[0].durationMs=1001
  if(issue==='tooLong')d.steps[0].durationMs=60001
  const before=JSON.stringify(p);expect(()=>reviewFootballSequence(p,d)).toThrow();expect(JSON.stringify(p)).toBe(before)
})
it('rejects forged, modified, unacknowledged and stale reviews before history or persistence',()=>{
  const p=project(),review=reviewFootballSequence(p,draft()),snapshot=vi.fn(),persist=vi.fn()
  expect(()=>commitFootballSequence(p,structuredClone(review),true,snapshot,persist)).toThrow()
  expect(()=>commitFootballSequence(p,review,false,snapshot,persist)).toThrow()
  expect(()=>commitFootballSequence({...p,title:'Changed'},review,true,snapshot,persist)).toThrow()
  review.draft.steps[0].durationMs=2000
  expect(()=>commitFootballSequence(p,review,true,snapshot,persist)).toThrow()
  expect(snapshot).not.toHaveBeenCalled();expect(persist).not.toHaveBeenCalled()
})
it('retries persistence with exactly the same track/clip IDs and one history snapshot; restores prior project',()=>{
  const p=project(),review=reviewFootballSequence(p,draft()),map=new Map<string,string>(),history=new PersistentVersionHistory({getItem:k=>map.get(k)??null,setItem:(k,v)=>{map.set(k,v)},removeItem:k=>{map.delete(k)}})
  const snapshot=vi.fn(value=>{history.snapshot(value,'Before manual timeline edit','system')}),writes:any[]=[]
  expect(()=>commitFootballSequence(p,review,true,snapshot,next=>{writes.push(structuredClone(next));next.title='Mutated failing sink';throw Error('Storage full')})).toThrow('Storage full')
  commitFootballSequence(p,review,true,snapshot,next=>writes.push(next))
  expect(writes[0]).toEqual(writes[1]);expect(snapshot).toHaveBeenCalledTimes(1)
  expect(history.restoreReversibly(writes[1],history.list(p.id)[0].id).project.tracks).toEqual(p.tracks)
})
it('retries a failed history snapshot before attempting persistence and supports maximum bounds',()=>{
  const p=project(),review=reviewFootballSequence(p,{name:'Bounds',startMs:3600000,steps:Array.from({length:12},()=>({assetId:'a',durationMs:60000}))}),persist=vi.fn()
  expect(review.endMs).toBe(4320000)
  expect(()=>commitFootballSequence(p,review,true,()=>{throw Error('History full')},persist)).toThrow()
  expect(persist).not.toHaveBeenCalled();commitFootballSequence(p,review,true,vi.fn(),persist);expect(persist).toHaveBeenCalledTimes(1)
  expect(footballSequenceAsset(p.assets[0])).toBe(true)
})
it.each(['de','en','fr'] as const)('renders explicit no-request sequence drafting in %s',language=>{
  const fetch=vi.spyOn(globalThis,'fetch'),history=new PersistentVersionHistory({getItem:()=>null,setItem:()=>{},removeItem:()=>{}})
  try{const html=renderToStaticMarkup(createElement(UiLanguageProvider,{initialLanguage:language,children:createElement(FootballSequencePanel,{project:project(),history,onProjectChange:vi.fn()})}));expect(html).toContain(translateUi(language,'tactics.sequenceHeading'));expect(html).toContain(translateUi(language,'tactics.sequenceReview'));expect(fetch).not.toHaveBeenCalled()}finally{fetch.mockRestore()}
})
