import { expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createProject, parseProject, type KinaouProject } from '../src/core/project'
import { createRenderPlan, formatProfiles } from '../src/core/render'
import { createPersistedShortBatch, storeProjectShortBatch, type PersistedShortBatchItem } from '../src/core/shortExportBatch'
import { forgetExportReceiptWithShortAcknowledgement, persistShortBatchReceipts } from '../src/core/shortBatchReceipts'
import { ProjectRepository } from '../src/core/persistence'
import { forgetExportReceipt, projectExportHistory, recordSuccessfulExport } from '../src/core/exportHistory'
import { ShortBatchReceiptRecovery } from '../src/components/ShortBatchStatus'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import { uiLanguages } from '../src/core/uiLanguage'
import { translateUi } from '../src/core/uiMessages'

function fixture(count = 2) {
  const project = parseProject({ ...createProject('Original'), metadata: { foreign: { untouched: true } }, assets: [{ id: 'i', kind: 'image', uri: 'KINAOU/Assets/image.png', managed: true }], tracks: [{ id: 'v', name: 'Original', type: 'video', clips: [{ id: 'c', assetId: 'i', startMs: 0, durationMs: 1000 }] }] })
  const items = Array.from({length:count}, (_, i) => ({ id: 'item-' + i + ':landscape', title: '<Original ' + i + '>', sceneIds: [], format: 'landscape' as const, inMs: 0, outMs: 1000, durationMs: 1000, outputPath: 'KINAOU/Renders/short-' + i + '.mp4', state: 'queued' as const, progress: 0 }))
  const plans = new Map(items.map(item => [item.id, createRenderPlan(project, formatProfiles.landscape.export, item.outputPath)]))
  const batch = createPersistedShortBatch(items, plans)
  const completed: PersistedShortBatchItem[] = batch.items.map((item, i) => ({ ...item, jobId: 'job-' + i, state: 'succeeded', progress: 1, createdAt: batch.createdAt, updatedAt: batch.updatedAt, renderedPath: item.outputPath, sizeBytes: 1024 }))
  const prepared = storeProjectShortBatch(project, { ...batch, items: completed })
  return { batch, completed, prepared }
}
it('saves all receipts and acknowledgements in one actual repository write', () => {
  const {batch,completed,prepared} = fixture(), before = JSON.stringify(prepared), values = new Map<string,string>()
  const repository = new ProjectRepository({ getItem: key => values.get(key) ?? null, setItem: (key,value) => { values.set(key,value) }, removeItem: key => {values.delete(key)} })
  const persist = vi.fn((project: KinaouProject) => repository.save(project))
  persistShortBatchReceipts(prepared,batch.id,completed,persist)
  expect(persist).toHaveBeenCalledOnce()
  const loaded = repository.load(prepared.id)!
  expect(projectExportHistory(loaded)).toHaveLength(2)
  expect(loaded.metadata.shortExportReceiptLedger).toEqual({batchId:batch.id,jobIds:['job-0','job-1']})
  expect(loaded.metadata.foreign).toEqual({untouched:true})
  expect(JSON.stringify(prepared)).toBe(before)
  persistShortBatchReceipts(loaded,batch.id,completed,persist)
  expect(persist).toHaveBeenCalledOnce()
})
it('leaves no acknowledged job on save failure and retries the same completed results', () => {
  const {batch,completed,prepared} = fixture(), before = JSON.stringify(prepared)
  let saved = prepared
  const persist = vi.fn((project: KinaouProject) => {saved=project}).mockImplementationOnce(() => {throw new Error('quota exceeded')})
  expect(() => persistShortBatchReceipts(prepared,batch.id,completed,persist)).toThrow('quota exceeded')
  expect(JSON.stringify(prepared)).toBe(before)
  expect(prepared.metadata.shortExportReceiptLedger).toBeUndefined()
  expect(projectExportHistory(saved)).toEqual([])
  persistShortBatchReceipts(prepared,batch.id,completed,persist)
  expect(persist).toHaveBeenCalledTimes(2)
  expect(projectExportHistory(saved).map(item=>item.jobId).sort()).toEqual(['job-0','job-1'])
})
it('does not resurrect a deliberately forgotten receipt after project serialization/reload', () => {
  const {batch,completed,prepared} = fixture()
  let saved = prepared
  persistShortBatchReceipts(saved,batch.id,completed,project=>{saved=project})
  saved = parseProject(JSON.parse(JSON.stringify(forgetExportReceipt(saved,'job-0'))))
  const persist = vi.fn()
  persistShortBatchReceipts(saved,batch.id,completed,persist)
  expect(persist).not.toHaveBeenCalled()
  expect(projectExportHistory(saved).map(item=>item.jobId)).toEqual(['job-1'])
})
it('bounds a full 100-attempt batch and does not reinsert evicted 50-receipt history entries', () => {
  const {batch,completed,prepared}=fixture(100)
  let saved=prepared
  persistShortBatchReceipts(saved,batch.id,completed,project=>{saved=project})
  expect(projectExportHistory(saved)).toHaveLength(50)
  expect((saved.metadata.shortExportReceiptLedger as {jobIds:string[]}).jobIds).toHaveLength(100)
  const persist=vi.fn()
  persistShortBatchReceipts(parseProject(JSON.parse(JSON.stringify(saved))),batch.id,completed,persist)
  expect(persist).not.toHaveBeenCalled()
})
it.each(['batch','attempt','path','signature','incomplete'] as const)('rejects a mismatched or incomplete %s without any partial save', invalid => {
  const {batch,completed,prepared}=fixture(), persist=vi.fn()
  const changed=completed.map(item=>({...item}))
  if(invalid==='attempt') changed[1].id='other'
  if(invalid==='path') changed[1].outputPath=changed[1].renderedPath='KINAOU/Renders/other.mp4'
  if(invalid==='signature') changed[1].planSignature='aaaaaaaaaaaaaaaa'
  if(invalid==='incomplete') delete changed[1].sizeBytes
  expect(()=>persistShortBatchReceipts(prepared,invalid==='batch' ? crypto.randomUUID() : batch.id,changed,persist)).toThrow()
  expect(persist).not.toHaveBeenCalled()
  expect(prepared.metadata.shortExportReceiptLedger).toBeUndefined()
})
it('ignores unfinished and failed attempts without fabricating receipts', () => {
  const {batch,prepared}=fixture(), persist=vi.fn()
  persistShortBatchReceipts(prepared,batch.id,batch.items,persist)
  expect(persist).not.toHaveBeenCalled()
})
it('rejects a malformed acknowledgement ledger rather than silently recreating forgotten history', () => {
  const {batch,completed,prepared}=fixture(), persist=vi.fn()
  expect(()=>persistShortBatchReceipts({...prepared,metadata:{...prepared.metadata,shortExportReceiptLedger:{batchId:batch.id,jobIds:['same','same']}}},batch.id,completed,persist)).toThrow()
  expect(persist).not.toHaveBeenCalled()
})
it('starts a bounded new ledger for a genuinely different saved batch', () => {
  const first=fixture(), second=fixture()
  let saved=first.prepared
  persistShortBatchReceipts(saved,first.batch.id,first.completed,project=>{saved=project})
  const next={...second.prepared,metadata:{...second.prepared.metadata,shortExportReceiptLedger:saved.metadata.shortExportReceiptLedger}}
  persistShortBatchReceipts(next,second.batch.id,second.completed,project=>{saved=project})
  expect((saved.metadata.shortExportReceiptLedger as {batchId:string}).batchId).toBe(second.batch.id)
  expect(projectExportHistory(saved)).toHaveLength(2)
})
it.each(uiLanguages)('explains receipt-only retry in %s and escapes original diagnostics', language => {
  const onRetry=vi.fn()
  const html=renderToStaticMarkup(createElement(UiLanguageProvider,{initialLanguage:language,children:createElement(ShortBatchReceiptRecovery,{detail:'<original storage failure>',onRetry})}))
  expect(html).toContain(translateUi(language,'shortBatch.receiptFailed'))
  expect(html).toContain(translateUi(language,'shortBatch.retryReceipt'))
  expect(html).toContain('&lt;original storage failure&gt;')
  expect(onRetry).not.toHaveBeenCalled()
})
it('acknowledges a deliberate removal even before legacy-batch receipt migration ran', () => {
  const {batch,completed,prepared}=fixture(1), item=completed[0]
  const withReceipt=recordSuccessfulExport(prepared,{jobId:item.jobId!,label:item.title,outputRelativePath:item.outputPath,format:item.format,range:{inMs:0,outMs:1000},sceneIds:[],durationMs:1000,sizeBytes:1024,completedAt:item.updatedAt!})
  expect(withReceipt.metadata.shortExportReceiptLedger).toBeUndefined()
  const forgotten=forgetExportReceiptWithShortAcknowledgement(withReceipt,item.jobId!)
  const reloaded=parseProject(JSON.parse(JSON.stringify(forgotten))), persist=vi.fn()
  persistShortBatchReceipts(reloaded,batch.id,completed,persist)
  expect(persist).not.toHaveBeenCalled()
  expect(projectExportHistory(reloaded)).toEqual([])
  expect(reloaded.metadata.shortExportReceiptLedger).toEqual({batchId:batch.id,jobIds:[item.jobId]})
  expect(projectExportHistory(withReceipt)).toHaveLength(1)
})
it('forgets an ordinary single-export receipt without inventing a Short ledger', () => {
  const project=recordSuccessfulExport(createProject('Single'),{jobId:'single',label:'Original',outputRelativePath:'KINAOU/Renders/single.mp4',format:'landscape',range:{inMs:0,outMs:1000},sceneIds:[],durationMs:1000,completedAt:'2026-09-20T00:00:00Z'})
  const forgotten=forgetExportReceiptWithShortAcknowledgement(project,'single')
  expect(projectExportHistory(forgotten)).toEqual([])
  expect(forgotten.metadata.shortExportReceiptLedger).toBeUndefined()
})
