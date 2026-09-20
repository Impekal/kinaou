import { expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createProject, parseProject } from '../src/core/project'
import { createRenderPlan, formatProfiles, type RenderPlan } from '../src/core/render'
import { createRangeRenderPlan } from '../src/core/renderRange'
import { planShortExportBatch, planShortExportRanges } from '../src/core/shortExportRanges'
import { acceptShortBatchJob, createPersistedShortBatch, planSelectiveShortBatchRetry, projectPersistedShortBatch, rebuildPersistedShortBatchPlans, requestPersistedShortBatchCancellation, storeProjectShortBatch } from '../src/core/shortExportBatch'
import { commitShortBatchChange } from '../src/core/shortBatchCommit'
import { ShortBatchStatus, type ShortBatchStatusProps } from '../src/components/ShortBatchStatus'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import { uiLanguages } from '../src/core/uiLanguage'
import { translateUi } from '../src/core/uiMessages'

function fixture() {
  const project=parseProject({...createProject('Cancel test'),storyboard:[{id:'s',title:'Original scene',description:'',durationMs:1000}],assets:[{id:'i',kind:'image',uri:'KINAOU/Assets/image.png',managed:true}],tracks:[{id:'v',name:'Video',type:'video',clips:[{id:'c',assetId:'i',sceneId:'s',startMs:0,durationMs:1000}]}]})
  const candidates=planShortExportRanges(project).candidates
  const items=planShortExportBatch(project,candidates,[candidates[0].id],['landscape','square']).map(item=>({...item,state:'queued' as const,progress:0}))
  const plans=new Map<string,RenderPlan>()
  for(const item of items) plans.set(item.id,createRangeRenderPlan(createRenderPlan(project,formatProfiles[item.format].export,item.outputPath),{inMs:item.inMs,outMs:item.outMs},item.outputPath))
  return {project,candidates,batch:createPersistedShortBatch(items,plans)}
}
it('saves cancellation intent and only marks genuinely unsubmitted entries cancelled',()=>{
  const {batch}=fixture(), before=JSON.stringify(batch)
  const cancelled=requestPersistedShortBatchCancellation(batch,batch.items[0].id)
  expect(cancelled.cancelRequested).toBe(true)
  expect(cancelled.items.map(item=>item.state)).toEqual(['queued','cancelled'])
  expect(JSON.stringify(batch)).toBe(before)
})
it('does not activate or send cancellation when the project write fails',()=>{
  const {project,batch}=fixture(), activate=vi.fn(), cancelRender=vi.fn()
  const next=storeProjectShortBatch(project,requestPersistedShortBatchCancellation(batch))
  expect(()=>commitShortBatchChange(next,()=>{throw new Error('quota')},()=>{activate();cancelRender()})).toThrow('quota')
  expect(activate).not.toHaveBeenCalled();expect(cancelRender).not.toHaveBeenCalled()
  expect(batch.cancelRequested).toBeUndefined()
  expect(batch.items.every(item=>item.state==='queued')).toBe(true)
})
it('retains cancellation on reload and blocks an unconfirmed in-flight submission instead of rebuilding it',()=>{
  const {project,batch}=fixture()
  const cancelled=requestPersistedShortBatchCancellation(batch,batch.items[0].id)
  const loaded=parseProject(JSON.parse(JSON.stringify(storeProjectShortBatch(project,cancelled))))
  expect(projectPersistedShortBatch(loaded)?.cancelRequested).toBe(true)
  expect(()=>rebuildPersistedShortBatchPlans(loaded,projectPersistedShortBatch(loaded)!)).toThrow(/unconfirmed/)
})
it('does not rebuild accepted work under saved cancellation even after the edit changes',()=>{
  const {project,batch}=fixture()
  const active=acceptShortBatchJob(batch.items[0],{id:'known-job',state:'running',progress:0.2,createdAt:batch.createdAt,updatedAt:batch.updatedAt})
  const cancelled=requestPersistedShortBatchCancellation({...batch,items:[active,batch.items[1]]})
  const changed=parseProject({...project,tracks:[]})
  expect(rebuildPersistedShortBatchPlans(changed,cancelled).size).toBe(0)
  expect(cancelled.items[0]).toEqual(active)
  expect(cancelled.items[1].state).toBe('cancelled')
})
it('retains actual completed results rather than replacing success with cancellation',()=>{
  const {batch}=fixture()
  const completed=acceptShortBatchJob(batch.items[0],{id:'done',state:'succeeded',progress:1,createdAt:batch.createdAt,updatedAt:batch.updatedAt,outputPath:batch.items[0].outputPath,sizeBytes:1000})
  const cancelled=requestPersistedShortBatchCancellation({...batch,items:[completed,batch.items[1]]})
  expect(cancelled.items[0]).toEqual(completed)
})
it('clears saved cancellation only for an explicit validated retry with a fresh file',()=>{
  const {project,candidates,batch}=fixture()
  const cancelled=requestPersistedShortBatchCancellation(batch)
  const retried=planSelectiveShortBatchRetry(project,cancelled,candidates,[batch.items[0].id],{audioDucking:batch.audioDucking,loudnessNormalization:batch.loudnessNormalization},new Date(Date.now()+1000))
  expect(retried.batch.cancelRequested).toBe(false)
  expect(retried.batch.items.slice(0,2)).toEqual(cancelled.items)
  expect(retried.batch.items[2].outputPath).not.toBe(batch.items[0].outputPath)
  expect(rebuildPersistedShortBatchPlans(project,retried.batch).size).toBe(1)
})
it('keeps legacy batches without a cancellation flag normally resumable',()=>{
  const {project,batch}=fixture()
  expect(batch.cancelRequested).toBeUndefined()
  expect(rebuildPersistedShortBatchPlans(project,batch).size).toBe(2)
})
it.each(uiLanguages)('explains persisted cancellation without claiming worker confirmation in %s',language=>{
  const {batch}=fixture()
  const props:ShortBatchStatusProps={items:batch.items,notice:null,resumeError:'',retryableIds:new Set(),retrySelectedIds:[],setRetrySelectedIds:vi.fn(),retryDisabled:true,busy:true,retryReframingBlocked:false,canCancel:true,canDiscard:false,archiveOnDiscard:false,onRetry:vi.fn(),onCancel:vi.fn(),onDiscard:vi.fn(),cancelRequested:true}
  const html=renderToStaticMarkup(createElement(UiLanguageProvider,{initialLanguage:language,children:createElement(ShortBatchStatus,props)}))
  expect(html).toContain(translateUi(language,'shortBatch.cancelSaved'))
  expect(html).toContain(translateUi(language,'shortBatch.queued'))
  expect(html).not.toContain(translateUi(language,'shortBatch.cancelled'))
  const uncertain = renderToStaticMarkup(createElement(UiLanguageProvider,{initialLanguage:language,children:createElement(ShortBatchStatus,{...props,cancelRequested:false,items:[{...batch.items[0],submissionStartedAt:batch.createdAt}]})}))
  expect(uncertain).toContain(translateUi(language,'shortBatch.unconfirmed'))
  expect(uncertain).toContain(translateUi(language,'shortBatch.unconfirmedHelp'))
  expect(uncertain).not.toContain(translateUi(language,'shortBatch.queued'))
})
