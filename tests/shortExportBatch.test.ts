import { describe, expect, it } from 'vitest'
import { cancelPendingShortBatchItems, clearProjectShortBatch, createPersistedShortBatch, failMissingShortBatchJob, nextShortBatchItem, planSelectiveShortBatchRetry, projectPersistedShortBatch, rebuildPersistedShortBatchPlans, replacePersistedShortBatchItems, requeueMissingShortBatchJob, retryableShortBatchItems, shortBatchBusy, shortBatchPlanSignature, storeProjectShortBatch, type ShortBatchRenderItem } from '../src/core/shortExportBatch'
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
    const legacyBatch = JSON.parse(JSON.stringify(batch))
    for (const entry of legacyBatch.items) { delete entry.candidateId; delete entry.attempt }
    expect(projectPersistedShortBatch({ ...project, metadata: { ...project.metadata, shortExportBatch: legacyBatch } })?.items).toEqual(legacyBatch.items)

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

  it('selectively retries only the latest terminal failure with a fresh output identity', () => {
    const { project, items, plans } = durableFixture()
    const original = createPersistedShortBatch(items, plans, new Date('2026-09-14T08:02:00.000Z'), '33333333-3333-4333-8333-333333333333')
    const terminal = replacePersistedShortBatchItems(original, original.items.map((entry, index) => index === 0
      ? { ...entry, state: 'succeeded' as const, progress: 1, jobId: 'job-success', createdAt: '2026-09-14T08:03:00.000Z', updatedAt: '2026-09-14T08:04:00.000Z', renderedPath: entry.outputPath, sizeBytes: 2048 }
      : { ...entry, state: 'failed' as const, error: 'Encoder stopped.' }), new Date('2026-09-14T08:04:00.000Z'))
    expect(retryableShortBatchItems(terminal).map((entry) => entry.id)).toEqual([terminal.items[1].id])
    const retry = planSelectiveShortBatchRetry(project, terminal, planShortExportRanges(project).candidates, [terminal.items[1].id], {
      audioDucking: { enabled: true, reductionDb: 20, attackMs: 100, releaseMs: 300 },
      loudnessNormalization: { enabled: true, targetLufs: -14, truePeakDb: -1.5, loudnessRange: 11 }
    }, new Date('2026-09-14T08:05:00.000Z'))
    expect(retry.batch.items.slice(0, 2)).toEqual(terminal.items)
    const attempt = retry.batch.items[2]
    expect(attempt).toMatchObject({ candidateId: 'scene-1', format: 'square', state: 'queued', progress: 0, attempt: 2, retryOfId: terminal.items[1].id })
    expect(attempt.id).toBe('scene-1:square:retry-2')
    expect(attempt.outputPath).not.toBe(terminal.items[1].outputPath)
    expect(attempt.outputPath).toContain('retry2')
    expect(retry.batch.audioDucking.reductionDb).toBe(20)
    expect(retry.batch.loudnessNormalization.enabled).toBe(true)
    expect(retry.plans.get(attempt.id)?.outputRelativePath).toBe(attempt.outputPath)
    const reloaded = parseProject(JSON.parse(JSON.stringify(storeProjectShortBatch(project, retry.batch))))
    const restored = projectPersistedShortBatch(reloaded)
    expect(restored).not.toBeNull()
    expect([...rebuildPersistedShortBatchPlans(reloaded, restored!).keys()]).toEqual([attempt.id])
    expect(retryableShortBatchItems(retry.batch)).toEqual([])
    expect(nextShortBatchItem(retry.batch.items)?.id).toBe(attempt.id)
  })

  it('refuses stale, duplicate, successful or nonterminal retry selections', () => {
    const { project, items, plans } = durableFixture()
    const original = createPersistedShortBatch(items, plans, new Date('2026-09-14T08:02:00.000Z'), '44444444-4444-4444-8444-444444444444')
    const failed = replacePersistedShortBatchItems(original, original.items.map((entry) => ({ ...entry, state: 'failed' as const, error: 'Failed.' })))
    const candidates = planShortExportRanges(project).candidates
    const settings = { audioDucking: plans.values().next().value!.audioDucking!, loudnessNormalization: plans.values().next().value!.loudnessNormalization! }
    expect(() => planSelectiveShortBatchRetry(project, failed, candidates, [failed.items[0].id, failed.items[0].id], settings)).toThrow(/only once/)
    expect(() => planSelectiveShortBatchRetry(project, failed, candidates, ['unknown'], settings)).toThrow(/not the latest/)
    expect(() => planSelectiveShortBatchRetry(project, failed, [{ ...candidates[0], outMs: 4000, durationMs: 4000 }], [failed.items[0].id], settings)).toThrow(/range changed/)

    const succeeded = replacePersistedShortBatchItems(original, original.items.map((entry) => ({ ...entry, state: 'succeeded' as const, progress: 1, jobId: `job-${entry.id}`, createdAt: '2026-09-14T08:03:00.000Z', updatedAt: '2026-09-14T08:04:00.000Z', renderedPath: entry.outputPath, sizeBytes: 1024 })))
    expect(() => planSelectiveShortBatchRetry(project, succeeded, candidates, [succeeded.items[0].id], settings)).toThrow(/not the latest/)
    expect(() => planSelectiveShortBatchRetry(project, original, candidates, [original.items[0].id], settings)).toThrow(/finish or cancel/)

    const invalidLineage = { ...failed, items: [...failed.items, { ...failed.items[0], id: 'scene-1:vertical:retry-2', outputPath: 'KINAOU/Renders/retry-2.mp4', attempt: 2, candidateId: 'scene-1', retryOfId: failed.items[1].id }] }
    expect(() => replacePersistedShortBatchItems(failed, invalidLineage.items)).toThrow(/lineage is inconsistent/)
  })
})
