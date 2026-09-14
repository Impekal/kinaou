import { describe, expect, it } from 'vitest'
import { cancelPendingShortBatchItems, clearProjectShortBatch, createPersistedShortBatch, failMissingShortBatchJob, nextShortBatchItem, projectPersistedShortBatch, rebuildPersistedShortBatchPlans, replacePersistedShortBatchItems, requeueMissingShortBatchJob, shortBatchBusy, shortBatchPlanSignature, storeProjectShortBatch, type ShortBatchRenderItem } from '../src/core/shortExportBatch'
import { assetSchema, clipSchema, createProject, parseProject, trackSchema } from '../src/core/project'
import { createRenderPlan, formatProfiles, type RenderPlan } from '../src/core/render'
import { createRangeRenderPlan } from '../src/core/renderRange'
import { planShortExportBatch, planShortExportRanges } from '../src/core/shortExportRanges'

function item(id: string, state: ShortBatchRenderItem['state'] = 'queued', jobId?: string): ShortBatchRenderItem {
  return { id, title: id, sceneIds: [id], format: 'vertical', inMs: 0, outMs: 1000, durationMs: 1000, outputPath: `KINAOU/Renders/${id}.mp4`, state, progress: 0, ...(jobId ? { jobId } : {}) }
}

function durableFixture() {
  const base = createProject('Durable Shorts', new Date('2026-09-14T08:00:00.000Z'))
  const asset = assetSchema.parse({ id: 'asset-1', kind: 'image', uri: 'KINAOU/Assets/still.png', managed: true })
  const project = {
    ...base,
    id: 'project-1',
    storyboard: [{ id: 'scene-1', title: 'Hook', description: '', durationMs: 5000 }],
    assets: [asset],
    tracks: [trackSchema.parse({ id: 'video', type: 'video', name: 'Video', clips: [clipSchema.parse({ id: 'clip-1', assetId: asset.id, sceneId: 'scene-1', startMs: 0, durationMs: 5000 })] })]
  }
  const candidates = planShortExportRanges(project).candidates
  const planned = planShortExportBatch(project, candidates, [candidates[0].id], ['vertical', 'square'], new Date('2026-09-14T08:01:00.000Z'))
  const items = planned.map((entry) => ({ ...entry, state: 'queued' as const, progress: 0 }))
  const plans = new Map<string, RenderPlan>()
  for (const entry of items) {
    const full = createRenderPlan(project, formatProfiles[entry.format].export, entry.outputPath)
    plans.set(entry.id, createRangeRenderPlan(full, { inMs: entry.inMs, outMs: entry.outMs }, entry.outputPath))
  }
  return { project, items, plans }
}

describe('Short export batch scheduling', () => {
  it('allows only the first unsubmitted item while no worker job is active', () => {
    expect(nextShortBatchItem([item('a'), item('b')])?.id).toBe('a')
    expect(nextShortBatchItem([item('a', 'running', 'job-a'), item('b')])).toBeUndefined()
    expect(nextShortBatchItem([item('a', 'queued', 'job-a'), item('b')])).toBeUndefined()
  })

  it('releases the next item after every terminal result, including a failure', () => {
    expect(nextShortBatchItem([item('a', 'succeeded', 'job-a'), item('b')])?.id).toBe('b')
    expect(nextShortBatchItem([item('a', 'failed', 'job-a'), item('b')])?.id).toBe('b')
  })

  it('cancels only work that has not been submitted and reports honest busy state', () => {
    const active = item('a', 'running', 'job-a')
    const cancelled = cancelPendingShortBatchItems([active, item('b')])
    expect(cancelled).toEqual([active, item('b', 'cancelled')])
    expect(shortBatchBusy(cancelled)).toBe(true)
    expect(shortBatchBusy([item('a', 'succeeded', 'job-a'), item('b', 'cancelled')])).toBe(false)
  })

  it('persists a bounded exact batch and rebuilds only unfinished render plans after reload', () => {
    const { project, items, plans } = durableFixture()
    const batch = createPersistedShortBatch(items, plans, new Date('2026-09-14T08:02:00.000Z'), '11111111-1111-4111-8111-111111111111')
    expect(batch.items.map((entry) => entry.planSignature)).toEqual([...plans.values()].map(shortBatchPlanSignature))
    const stored = storeProjectShortBatch(project, batch, new Date('2026-09-14T08:02:01.000Z'))
    const reloaded = parseProject(JSON.parse(JSON.stringify(stored)))
    expect(projectPersistedShortBatch(reloaded)).toEqual(batch)
    expect([...rebuildPersistedShortBatchPlans(reloaded, batch).keys()]).toEqual(batch.items.map((entry) => entry.id))

    const terminalItems = batch.items.map((entry, index) => index === 0 ? { ...entry, state: 'succeeded' as const, progress: 1, jobId: 'job-1', createdAt: '2026-09-14T08:03:00.000Z', updatedAt: '2026-09-14T08:04:00.000Z', renderedPath: entry.outputPath, sizeBytes: 2048 } : entry)
    const updated = replacePersistedShortBatchItems(batch, terminalItems, new Date('2026-09-14T08:04:00.000Z'))
    expect([...rebuildPersistedShortBatchPlans(reloaded, updated).keys()]).toEqual([batch.items[1].id])
    const cleared = clearProjectShortBatch(storeProjectShortBatch(project, updated), new Date('2026-09-14T08:05:00.000Z'))
    expect(projectPersistedShortBatch(cleared)).toBeNull()
    expect(cleared.metadata.shortExportBatch).toBeUndefined()
  })

  it('blocks stale or malformed resume state instead of silently rendering a changed timeline', () => {
    const { project, items, plans } = durableFixture()
    const batch = createPersistedShortBatch(items, plans, new Date('2026-09-14T08:02:00.000Z'), '22222222-2222-4222-8222-222222222222')
    const changed = { ...project, tracks: project.tracks.map((track) => ({ ...track, clips: track.clips.map((clip) => ({ ...clip, durationMs: 4000 })) })) }
    expect(() => rebuildPersistedShortBatchPlans(changed, batch)).toThrow(/timeline, media or render settings changed/)
    expect(projectPersistedShortBatch({ ...project, metadata: { shortExportBatch: { schemaVersion: 999 } } })).toBeNull()
    expect(() => replacePersistedShortBatchItems(batch, [...batch.items, { ...batch.items[0], id: batch.items[1].id }])).toThrow(/unique/)
  })

  it('requeues only a missing active worker job while preserving completed items', () => {
    const active = item('a', 'running', 'job-a')
    const succeeded = item('b', 'succeeded', 'job-b')
    expect(requeueMissingShortBatchJob([active, succeeded], 'a')).toEqual([item('a'), succeeded])
    expect(requeueMissingShortBatchJob([active, succeeded], 'b')).toEqual([active, succeeded])
    expect(failMissingShortBatchJob([active, succeeded], 'a', 'Existing output was left untouched.')).toEqual([{ ...active, state: 'failed', error: 'Existing output was left untouched.' }, succeeded])
    expect(() => failMissingShortBatchJob([active], 'a', ' ')).toThrow(/at most 2000/)
  })
})
