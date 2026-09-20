import { expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createProject, parseProject } from '../src/core/project'
import { commitPortraitPresenter, planPortraitPresenter, PresenterValidationError } from '../src/core/portraitPresenter'
import { PersistentVersionHistory } from '../src/core/versioning'
import { PortraitPresenterPanel } from '../src/components/PortraitPresenterPanel'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import { uiLanguages } from '../src/core/uiLanguage'
import { translateUi } from '../src/core/uiMessages'

function fixture() {
  return parseProject({...createProject('Original project'), assets:[
    {id:'photo',kind:'image',managed:true,uri:'KINAOU/Assets/photo.png',metadata:{name:'<Original portrait>',generated:true,seed:42}},
    {id:'own',kind:'audio',managed:true,uri:'KINAOU/Assets/own.wav',metadata:{name:'My own voice',durationMs:2345,provenance:'authorized own recording'}},
    {id:'unknown',kind:'audio',managed:true,uri:'KINAOU/Assets/unknown.wav',metadata:{name:'Unknown duration'}}
  ]})
}
const input={name:' Camille ',portraitAssetId:'photo',narrationAssetId:'own'}
function history() {
  const data=new Map<string,string>()
  const store={getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>{data.set(key,value)},removeItem:(key:string)=>{data.delete(key)}}
  return new PersistentVersionHistory(store)
}
it.each(uiLanguages)('renders honest translated presenter controls and original sources in %s',language=>{
  const project=fixture(), before=JSON.stringify(project)
  const html=renderToStaticMarkup(createElement(UiLanguageProvider,{initialLanguage:language,children:createElement(PortraitPresenterPanel,{project,history:history(),onProjectChange:vi.fn(),onOpenStudio:vi.fn()})}))
  for(const key of ['presenter.heading','presenter.badge','presenter.boundary','presenter.videoHelp','presenter.name','presenter.narration','presenter.add','presenter.openStudio','presenter.reason.input','presenter.unknownDuration'] as const) expect(html).toContain(translateUi(language,key))
  expect(html).toContain('&lt;Original portrait&gt;')
  expect(html).toContain('My own voice')
  expect(html).toContain((2.345).toLocaleString(language,{minimumFractionDigits:2,maximumFractionDigits:2})+' s')
  expect(JSON.stringify(project)).toBe(before)
})
it.each(uiLanguages)('shows translated missing media and a disabled action in %s',language=>{
  const html=renderToStaticMarkup(createElement(UiLanguageProvider,{initialLanguage:language,children:createElement(PortraitPresenterPanel,{project:createProject('Empty'),history:history(),onProjectChange:vi.fn(),onOpenStudio:vi.fn()})}))
  expect(html).toContain(translateUi(language,'presenter.noPortrait'))
  expect(html).toContain(translateUi(language,'presenter.noNarration'))
  expect(html).toMatch(/button class="primary" disabled=""/)
})
it('saves a reversible paired composition and returns stable result data rather than translated content',()=>{
  const project=fixture(), versions=history()
  let stored=project
  const result=commitPortraitPresenter(project,input,versions,next=>{stored=next})
  expect(result).toEqual({name:'Camille',startMs:0,durationMs:2345})
  expect(stored.assets).toEqual(project.assets)
  expect(stored.tracks.map(track=>track.type)).toEqual(['avatar','voice'])
  const safety=versions.list(project.id)[0]
  expect(safety.project).toEqual(project)
  expect(versions.restoreReversibly(stored,safety.id).project.tracks).toEqual([])
})
it('does not write the project if its safety version fails',()=>{
  const persist=vi.fn()
  expect(()=>commitPortraitPresenter(fixture(),input,{snapshot:()=>{throw new Error('history full')}},persist)).toThrow('history full')
  expect(persist).not.toHaveBeenCalled()
})
it('does not report success on failed project persistence and retains the valid safety version',()=>{
  const project=fixture(), before=JSON.stringify(project), versions=history()
  expect(()=>commitPortraitPresenter(project,input,versions,()=>{throw new Error('project full')})).toThrow('project full')
  expect(versions.list(project.id)).toHaveLength(1)
  expect(JSON.stringify(project)).toBe(before)
})
it.each(['input','portrait','narration','duration','limit'] as const)('returns a stable %s validation code',code=>{
  const project=fixture(), parameters={...input}
  if(code==='input') parameters.name=' '
  if(code==='portrait') project.assets[0].offline=true
  if(code==='narration') parameters.narrationAssetId='missing'
  if(code==='duration') delete project.assets[1].metadata.durationMs
  if(code==='limit') project.tracks=[{id:'old',type:'video',name:'Old',muted:false,locked:false,clips:[{id:'clip',assetId:'photo',startMs:86400000,durationMs:1,sourceOffsetMs:0,gain:1,speed:1}]}]
  try { planPortraitPresenter(project,parameters); expect.fail('must reject') }
  catch(cause) { expect(cause).toBeInstanceOf(PresenterValidationError); expect((cause as PresenterValidationError).code).toBe(code) }
})
