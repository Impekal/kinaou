import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { createProject, parseProject } from '../src/core/project'
import { parseDirectorPlan } from '../src/core/director'
import { commitDirectorReview, reviewDirectorPlan } from '../src/core/directorReview'
import { PersistentVersionHistory } from '../src/core/versioning'
import { DirectorPanel, DirectorPlanReview } from '../src/components/DirectorPanel'
import { ContentProfilePanel } from '../src/components/ContentProfilePanel'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import { uiLanguages } from '../src/core/uiLanguage'
import { translateUi } from '../src/core/uiMessages'
import { setProjectContentProfile, defaultProjectContentProfile } from '../src/core/contentProfile'
import { planSceneVoiceovers } from '../src/core/sceneVoiceover'
import { captionsFromStoryboard } from '../src/core/scriptCaptions'

const input = { schemaVersion:1, title:'Original plan', objective:'Original objective', script:'Original script', scenes:[
  { id:'spoken', title:'Original scene', description:'Original camera direction', narration:'Original speech', visualBrief:'Original framing', durationMs:2000, requiredMedia:['image','voice'] },
  { id:'silent', title:'Silent', description:'Silent direction', narration:'', durationMs:2000, requiredMedia:[] }
], provenance:{kind:'manual'} }
function fixture() {
  const project=parseProject({...createProject('Unchanged title'), assets:[{id:'image',kind:'image',uri:'KINAOU/Assets/original.png',managed:true}], tracks:[{id:'visual',name:'Original track',type:'video',clips:[{id:'c',assetId:'image',startMs:0,durationMs:2000,gain:1,speed:1,metadata:{sceneId:'spoken'}}]}]})
  const data=new Map<string,string>()
  const history=new PersistentVersionHistory({getItem:key=>data.get(key)??null,setItem:(key,value)=>{data.set(key,value)},removeItem:key=>{data.delete(key)}})
  return {project,history}
}
it('saves a reviewed plan, retains media/timeline and restores exact prior project content',()=>{
  const {project,history}=fixture(),before=JSON.stringify(project)
  let saved=project
  commitDirectorReview(project,reviewDirectorPlan(project,input),history,next=>{saved=parseProject(JSON.parse(JSON.stringify(next)))})
  expect(saved.script).toBe('Original script');expect(saved.storyboard[0].narration).toBe('Original speech')
  expect(saved.assets).toEqual(project.assets);expect(saved.tracks).toEqual(project.tracks)
  expect(JSON.stringify(project)).toBe(before)
  const restored=history.restoreReversibly(saved,history.list(project.id)[0].id).project
  expect(restored.storyboard).toEqual(project.storyboard);expect(restored.script).toBe(project.script)
})
it.each(['profile','script','storyboard','metadata'] as const)('rejects stale %s before any writes',kind=>{
  const {project,history}=fixture(),review=reviewDirectorPlan(project,input),persist=vi.fn()
  let next=structuredClone(project)
  if(kind==='profile') next=setProjectContentProfile(next,{...defaultProjectContentProfile,outputLanguage:'fr'})
  if(kind==='script') next.script='Updated'
  if(kind==='storyboard') next.storyboard=[{id:'new',title:'New',description:'New',durationMs:1000}]
  if(kind==='metadata') next.metadata.other='new'
  expect(()=>commitDirectorReview(next,review,history,persist)).toThrow(/changed/)
  expect(history.list(project.id)).toEqual([]);expect(persist).not.toHaveBeenCalled()
})
it('does not persist when safety storage fails',()=>{
  const {project}=fixture(),persist=vi.fn()
  expect(()=>commitDirectorReview(project,reviewDirectorPlan(project,input),{snapshot:()=>{throw Error('history full')}},persist)).toThrow('history full')
  expect(persist).not.toHaveBeenCalled()
})
it('retains reviewed input and prior safety version if project save fails',()=>{
  const {project,history}=fixture(),review=reviewDirectorPlan(project,input)
  expect(()=>commitDirectorReview(project,review,history,()=>{throw Error('project full')})).toThrow('project full')
  expect(review.plan.script).toBe('Original script');expect(history.list(project.id)).toHaveLength(1);expect(project.script).toBe('')
})
it('validates a changed plan before saving safety history',()=>{
  const {project,history}=fixture(),review=reviewDirectorPlan(project,input),persist=vi.fn()
  review.plan.scenes=[]
  expect(()=>commitDirectorReview(project,review,history,persist)).toThrow()
  expect(history.list(project.id)).toEqual([]);expect(persist).not.toHaveBeenCalled()
})
it('routes saved and reloaded narration to actual voice planning and caption generation, not visual directions',()=>{
  const {project,history}=fixture()
  let saved=project
  commitDirectorReview(project,reviewDirectorPlan(project,input),history,next=>{saved=parseProject(JSON.parse(JSON.stringify(next)))})
  saved.storyboard[0].assetId='image'
  saved.tracks[0].clips[0].sceneId='spoken'
  saved=parseProject({...saved,tracks:[...saved.tracks,{id:'captions',name:'Captions',type:'caption',clips:[]}]})
  const voices=planSceneVoiceovers(saved,'visual')
  expect(voices.pending.map(scene=>scene.text)).toEqual(['Original speech'])
  expect(voices.skipped.find(scene=>scene.sceneId==='silent')?.code).toBe('silent')
  const captioned=captionsFromStoryboard(saved,'visual').project
  expect(captioned.assets.at(-1)?.metadata.text).toBe('Original speech')
  expect(captioned.assets.at(-1)?.metadata.source).toBe('storyboard-narration')
})
it.each(uiLanguages)('renders Director controls and unchanged profile content in %s',language=>{
  const {project,history}=fixture()
  const profiled=setProjectContentProfile(project,{...defaultProjectContentProfile,audience:'Original audience',outputLanguage:'fr'})
  const wrap=(children:ReturnType<typeof createElement>)=>renderToStaticMarkup(createElement(UiLanguageProvider,{initialLanguage:language,children}))
  const html=wrap(createElement(DirectorPanel,{project:profiled,history,workerUrl:'http://127.0.0.1:1',workerToken:'',workerConnected:false,workerCapabilities:[],onProjectChange:vi.fn()}))
  for(const key of ['director.heading','director.help','director.brief','director.source','director.boundary','profile.heading','profile.help','profile.save'] as const) expect(html).toContain(translateUi(language,key))
  expect(html).toContain('Original audience');expect(html).toContain('disabled=""')
  const profile=wrap(createElement(ContentProfilePanel,{project:profiled,onProjectChange:vi.fn()}))
  expect(profile).toContain('<option value="fr" selected="">Français</option>')
})
it.each(uiLanguages)('shows full original script, framing, speech, silence and translated media in %s',language=>{
  const plan=parseDirectorPlan(input)
  const html=renderToStaticMarkup(createElement(UiLanguageProvider,{initialLanguage:language,children:createElement(DirectorPlanReview,{plan})}))
  for(const text of ['Original script','Original camera direction','Original framing','Original speech','Original plan']) expect(html).toContain(text)
  for(const key of ['director.script','director.visual','speech.silent','director.image','director.voice'] as const) expect(html).toContain(translateUi(language,key))
})
