import { expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createProject, parseProject } from '../src/core/project'
import { parseAiEditorProposal } from '../src/core/aiEditor'
import { AiEditorRequestScope, commitAiEditorReview, reviewAiEditorProposal } from '../src/core/aiEditorReview'
import { AiEditorDiff, AiEditorPanel } from '../src/components/AiEditorPanel'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import { uiLanguages } from '../src/core/uiLanguage'
import { translateUi } from '../src/core/uiMessages'
import { PersistentVersionHistory } from '../src/core/versioning'

function fixture() {
  const project=parseProject({...createProject('Original title'),assets:[{id:'a',kind:'audio',uri:'KINAOU/Assets/own.wav',managed:true,metadata:{durationMs:5000}}],tracks:[{id:'t',name:'Original track',type:'voice',clips:[{id:'c',assetId:'a',startMs:0,durationMs:4000,gain:1,speed:1}]}]})
  const proposal=parseAiEditorProposal({schemaVersion:1,title:'Original proposal',objective:'Original objective',operations:[{id:'gain',reason:'<Original reason>',edit:{type:'set-clip-gain',trackId:'t',clipId:'c',gain:0.5}},{id:'move',reason:'Move',edit:{type:'move-clip',trackId:'t',clipId:'c',startMs:500}}],provenance:{kind:'manual'}})
  const data=new Map<string,string>()
  const history=new PersistentVersionHistory({getItem:key=>data.get(key)??null,setItem:(key,value)=>{data.set(key,value)},removeItem:key=>{data.delete(key)}})
  return {project,proposal,history}
}
it('saves only selected validated edits and leaves reversible original state',()=>{
  const {project,proposal,history}=fixture(), review=reviewAiEditorProposal(project,proposal)
  let saved=project
  expect(commitAiEditorReview(project,review,['gain'],history,next=>{saved=next})).toBe(1)
  expect(saved.tracks[0].clips[0]).toMatchObject({gain:0.5,startMs:0})
  expect(saved.assets).toEqual(project.assets)
  expect(history.list(project.id)[0].project).toEqual(project)
  expect(history.restoreReversibly(saved,history.list(project.id)[0].id).project.tracks).toEqual(project.tracks)
})
it.each(['removed','gain','title','metadata'] as const)('blocks a %s project change after review before taking a snapshot',kind=>{
  const {project,proposal,history}=fixture(), review=reviewAiEditorProposal(project,proposal)
  const changed=structuredClone(project)
  if(kind==='removed') changed.tracks=[]
  if(kind==='gain') changed.tracks[0].clips[0].gain=0.8
  if(kind==='title') changed.title='Other'
  if(kind==='metadata') changed.metadata.other=true
  const persist=vi.fn()
  expect(()=>commitAiEditorReview(changed,review,['gain'],history,persist)).toThrow(/changed/)
  expect(persist).not.toHaveBeenCalled();expect(history.list(project.id)).toEqual([])
})
it('rejects impossible selected combinations before writing history or project',()=>{
  const {project,proposal,history}=fixture()
  project.tracks[0].locked=true
  const review=reviewAiEditorProposal(project,proposal),persist=vi.fn()
  expect(()=>commitAiEditorReview(project,review,['move'],history,persist)).toThrow()
  expect(persist).not.toHaveBeenCalled();expect(history.list(project.id)).toEqual([])
})
it('does not write project or report success if history fails',()=>{
  const {project,proposal}=fixture(),persist=vi.fn()
  expect(()=>commitAiEditorReview(project,reviewAiEditorProposal(project,proposal),['gain'],{snapshot:()=>{throw new Error('history full')}},persist)).toThrow('history full')
  expect(persist).not.toHaveBeenCalled()
})
it('retains review and safety snapshot when project persistence fails',()=>{
  const {project,proposal,history}=fixture(),review=reviewAiEditorProposal(project,proposal),before=JSON.stringify(review)
  expect(()=>commitAiEditorReview(project,review,['gain'],history,()=>{throw new Error('project full')})).toThrow('project full')
  expect(JSON.stringify(review)).toBe(before);expect(project.tracks[0].clips[0].gain).toBe(1)
  expect(history.list(project.id)).toHaveLength(1)
})
it('invalidates superseded requests, scope round trips and edited source',()=>{
  const scope=new AiEditorRequestScope()
  scope.update('a');const first=scope.begin();expect(first()).toBe(true)
  const second=scope.begin();expect(first()).toBe(false)
  scope.update('b');scope.update('a');expect(second()).toBe(false)
  const third=scope.begin();scope.invalidate();expect(third()).toBe(false)
})
it('does not revive pre-unmount requests during a StrictMode reattachment',()=>{
  const scope=new AiEditorRequestScope(),old=scope.begin()
  scope.detach();expect(old()).toBe(false)
  scope.attach();expect(old()).toBe(false);expect(scope.begin()()).toBe(true)
})
it.each(uiLanguages)('renders translated controls and disabled unavailable inference in %s',language=>{
  const {project,history}=fixture()
  const html=renderToStaticMarkup(createElement(UiLanguageProvider,{initialLanguage:language,children:createElement(AiEditorPanel,{project,history,workerUrl:'http://127.0.0.1:43117',workerToken:'',workerConnected:false,workerCapabilities:[],onProjectChange:vi.fn()})}))
  for(const key of ['editor.heading','editor.help','editor.scopeHelp','editor.instruction','editor.model','editor.detect','editor.generate','editor.source','editor.review'] as const) expect(html).toContain(translateUi(language,key))
  expect(html).toContain('disabled=""')
})
it.each(uiLanguages)('renders original reasons and localized numeric changes in %s',language=>{
  const {project,proposal}=fixture()
  const html=renderToStaticMarkup(createElement(UiLanguageProvider,{initialLanguage:language,children:createElement(AiEditorDiff,{project,operation:proposal.operations[0]})}))
  expect(html).toContain('&lt;Original reason&gt;')
  expect(html).toContain(translateUi(language,'editor.before'))
  expect(html).toContain(translateUi(language,'editor.gain',{value:(0.5).toLocaleString(language)}))
})
