import { expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createProject, parseProject, type KinaouProject } from '../src/core/project'
import { parseMediaAcquisitionPlan } from '../src/core/mediaAcquisition'
import { MediaPlanSession, pollMediaPlanJob, runMediaPlanItems } from '../src/core/mediaPlanSession'
import { PersistentVersionHistory } from '../src/core/versioning'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import { MediaPlanPanel } from '../src/components/MediaPlanPanel'
import { uiLanguages } from '../src/core/uiLanguage'
import { translateUi } from '../src/core/uiMessages'

function fixture() {
  let project=parseProject({...createProject('Original project'),storyboard:[{id:'scene',title:'Original scene',description:'Original',durationMs:1000}]})
  let connection='worker-a'
  const session=new MediaPlanSession(project,connection,()=>({project,connection}))
  const data=new Map<string,string>()
  const history=new PersistentVersionHistory({getItem:key=>data.get(key)??null,setItem:(key,value)=>{data.set(key,value)},removeItem:key=>{data.delete(key)}})
  const plan=parseMediaAcquisitionPlan({schemaVersion:1,items:[1,2].map(i=>({kind:'generate-image',sceneId:'scene',positivePrompt:'Illustration '+i,rationale:'Test fixture'})),provenance:{kind:'manual'}},project)
  const persist=vi.fn((next:KinaouProject)=>{project=parseProject(JSON.parse(JSON.stringify(next)))})
  const onItem=vi.fn()
  let count=0
  const acquire=vi.fn(async(_item:unknown,current:KinaouProject)=>{
    const id='image-'+(++count),uri='KINAOU/Assets/GeneratedImages/'+id+'.png'
    return {project:parseProject({...current,assets:[...current.assets,{id,kind:'image',uri,managed:true,metadata:{generated:true,source:'explicit unit-test fixture'}}]}),uri}
  })
  const options={session,plan,mode:'reviewed' as const,project,snapshot:(value:KinaouProject)=>{history.snapshot(value,'Before media acquisition run','system')},persist,acquire,onItem}
  return {session,history,options,getProject:()=>project,setProject:(next:KinaouProject)=>{project=next;session.observe(project,connection)},connection:(value:string)=>{connection=value;session.observe(project,connection)}}
}
it('commits serial acquired assets, preserves fulfilled scene and writes completion only at the end',async()=>{
  const f=fixture(),original=f.getProject()
  await runMediaPlanItems(f.options)
  expect(f.options.persist).toHaveBeenCalledTimes(3)
  expect(f.getProject().assets).toHaveLength(2)
  expect(f.getProject().storyboard[0].assetId).toBe('image-1')
  expect(f.getProject().metadata.mediaAcquisition).toMatchObject({mode:'reviewed',results:[{status:'succeeded'},{status:'succeeded'}]})
  expect(f.options.onItem.mock.calls.map(call=>call[1].status)).toEqual(['running','succeeded','running','succeeded'])
  expect(f.history.restoreReversibly(f.getProject(),f.history.list(original.id)[0].id).project.assets).toEqual([])
})
it('never starts acquisition when the safety snapshot fails',async()=>{
  const f=fixture()
  await expect(runMediaPlanItems({...f.options,snapshot:()=>{throw Error('history full')}})).rejects.toThrow('history full')
  expect(f.options.acquire).not.toHaveBeenCalled();expect(f.options.persist).not.toHaveBeenCalled()
})
it('stops after a failed first project save and never submits later items',async()=>{
  const f=fixture()
  f.options.persist.mockImplementation(()=>{throw Error('project full')})
  await expect(runMediaPlanItems(f.options)).rejects.toThrow('project full')
  expect(f.options.acquire).toHaveBeenCalledTimes(1)
  expect(f.getProject().assets).toEqual([])
  expect(f.options.onItem.mock.calls.map(call=>call[1].status)).toEqual(['running','failed'])
  expect(f.session.active).toBe(false)
})
it('retains a successfully saved first item when a later submission fails, without a completed-run claim',async()=>{
  const f=fixture()
  f.options.acquire.mockImplementationOnce(f.options.acquire.getMockImplementation()!).mockRejectedValueOnce(Error('acceptance unknown'))
  await expect(runMediaPlanItems(f.options)).rejects.toThrow('acceptance unknown')
  expect(f.getProject().assets).toHaveLength(1)
  expect(f.getProject().metadata.mediaAcquisition).toBeUndefined()
  expect(f.options.persist).toHaveBeenCalledTimes(1)
})
it('does not claim completion if final result metadata cannot be saved',async()=>{
  const f=fixture(),save=f.options.persist.getMockImplementation()!
  f.options.persist.mockImplementation(next=>{if(next.metadata.mediaAcquisition)throw Error('summary full');save(next)})
  await expect(runMediaPlanItems(f.options)).rejects.toThrow('summary full')
  expect(f.getProject().assets).toHaveLength(2);expect(f.getProject().metadata.mediaAcquisition).toBeUndefined()
})
it.each(['project','connection','detach'] as const)('rejects an acquired late result after %s changes',async kind=>{
  const f=fixture(),original=f.getProject(),acquire=f.options.acquire.getMockImplementation()!
  let release!:()=>void
  const gate=new Promise<void>(resolve=>{release=resolve})
  f.options.acquire.mockImplementation(async(item,current)=>{await gate;return acquire(item,current)})
  const result=runMediaPlanItems(f.options)
  if(kind==='project')f.setProject({...original,title:'User edit'})
  if(kind==='connection')f.connection('worker-b')
  if(kind==='detach')f.session.detach()
  release()
  await expect(result).rejects.toThrow(/detached/)
  expect(f.options.persist).not.toHaveBeenCalled();expect(f.options.acquire).toHaveBeenCalledTimes(1)
  expect(f.options.onItem.mock.calls.map(call=>call[1].status)).toEqual(['running'])
  expect(f.getProject().title).toBe(kind==='project'?'User edit':original.title)
})
it('does not revive a project/connection round trip or detached old session',()=>{
  const f=fixture(),original=f.getProject()
  f.connection('b');f.connection('worker-a')
  expect(()=>f.session.assertCurrent()).toThrow(/detached/)
  const other=fixture()
  other.setProject({...original,title:'Changed'});other.setProject(original)
  expect(()=>other.session.assertCurrent()).toThrow(/detached/)
  expect(new MediaPlanSession(original,'new',()=>({project:original,connection:'new'})).active).toBe(true)
})
it('polls serially using the original job identity',async()=>{
  const f=fixture(),status=vi.fn().mockResolvedValueOnce({id:'job',state:'running'}).mockResolvedValueOnce({id:'job',state:'succeeded'})
  const wait=vi.fn(async()=>{})
  expect(await pollMediaPlanJob({id:'job',state:'queued'},status,f.session.assertCurrent,wait)).toEqual({id:'job',state:'succeeded'})
  expect(status.mock.calls).toEqual([['job'],['job']]);expect(wait).toHaveBeenCalledTimes(2)
})
it('does not poll after detachment during the wait and does not accept another job',async()=>{
  const f=fixture(),status=vi.fn()
  await expect(pollMediaPlanJob({id:'job',state:'queued'},status,f.session.assertCurrent,async()=>f.session.detach())).rejects.toThrow(/detached/)
  expect(status).not.toHaveBeenCalled()
  const g=fixture()
  await expect(pollMediaPlanJob({id:'job',state:'queued'},async()=>({id:'other',state:'succeeded'}),g.session.assertCurrent,async()=>{})).rejects.toThrow(/identity/)
})
it('ignores a status response that arrives after a project edit',async()=>{
  const f=fixture()
  await expect(pollMediaPlanJob({id:'job',state:'queued'},async()=>{f.setProject({...f.getProject(),script:'User edit'});return{id:'job',state:'succeeded'}},f.session.assertCurrent,async()=>{})).rejects.toThrow(/detached/)
})
it.each(uiLanguages)('renders truthful session boundaries in %s without enabling unavailable runtimes',language=>{
  const f=fixture()
  const html=renderToStaticMarkup(createElement(UiLanguageProvider,{initialLanguage:language,children:createElement(MediaPlanPanel,{project:f.getProject(),history:f.history,workerUrl:'http://127.0.0.1:1',workerToken:'',workerConnected:false,workerCapabilities:[],onProjectChange:vi.fn()})}))
  expect(html).toContain(translateUi(language,'mediaPlan.scope'))
  for(const key of ['mediaPlan.heading','mediaPlan.help','mediaPlan.auto','mediaPlan.propose','editor.model'] as const) expect(html).toContain(translateUi(language,key).replaceAll('&','&amp;'))
  expect(html).toContain('disabled=""')
  expect(html).not.toContain('Done.')
})
