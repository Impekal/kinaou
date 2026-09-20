import { describe, expect, it } from 'vitest'
import { archiveProjectShortBatch, cancelPendingShortBatchItems, clearProjectShortBatch, createPersistedShortBatch, failMissingShortBatchJob, forgetProjectShortBatchArchiveEntry, nextShortBatchItem, planSelectiveShortBatchRetry, projectPersistedShortBatch, projectShortBatchArchive, rebuildPersistedShortBatchPlans, replacePersistedShortBatchItems, requeueMissingShortBatchJob, retryableShortBatchItems, reviewArchivedShortBatchSelection, shortBatchArchiveLimit, shortBatchBusy, shortBatchPlanSignature, storeProjectShortBatch, type ShortBatchRenderItem } from '../src/core/shortExportBatch'
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

  it('archives a compact terminal batch summary that survives reload and never replaces output references', () => {
    const { project, items, plans } = durableFixture()
    const original = createPersistedShortBatch(items, plans, new Date('2026-09-14T08:02:00.000Z'), '55555555-5555-4555-8555-555555555555')
    const terminal = replacePersistedShortBatchItems(original, original.items.map((entry, index) => index === 0
      ? { ...entry, state: 'succeeded' as const, progress: 1, jobId: 'job-success', createdAt: '2026-09-14T08:03:00.000Z', updatedAt: '2026-09-14T08:04:00.000Z', renderedPath: entry.outputPath, sizeBytes: 4096 }
      : { ...entry, state: 'failed' as const, error: 'Encoder stopped.' }), new Date('2026-09-14T08:04:00.000Z'))
    const stored = storeProjectShortBatch(project, terminal)
    const archived = archiveProjectShortBatch(stored, terminal, new Date('2026-09-14T08:05:00.000Z'))
    const cleared = clearProjectShortBatch(archived, new Date('2026-09-14T08:05:00.000Z'))
    const reloaded = parseProject(JSON.parse(JSON.stringify(cleared)))
    const history = projectShortBatchArchive(reloaded)
    expect(projectPersistedShortBatch(reloaded)).toBeNull()
    expect(history).toHaveLength(1)
    expect(history[0]).toMatchObject({ schemaVersion: 1, batchId: terminal.id, createdAt: terminal.createdAt, completedAt: terminal.updatedAt, archivedAt: '2026-09-14T08:05:00.000Z' })
    expect(history[0].items).toEqual([
      expect.objectContaining({ id: terminal.items[0].id, candidateId: 'scene-1', state: 'succeeded', attempt: 1, outputPath: terminal.items[0].outputPath, sizeBytes: 4096 }),
      expect.objectContaining({ id: terminal.items[1].id, candidateId: 'scene-1', state: 'failed', attempt: 1, outputPath: terminal.items[1].outputPath })
    ])
    expect(history[0].items[0]).not.toHaveProperty('preset')
    expect(history[0].items[1]).not.toHaveProperty('error')
    const sanitized = projectShortBatchArchive({ ...reloaded, metadata: { ...reloaded.metadata, shortExportBatchArchive: [{ schemaVersion: 999 }, history[0], history[0]] } })
    expect(sanitized.map((entry) => entry.batchId)).toEqual([terminal.id])
    const forgotten = forgetProjectShortBatchArchiveEntry(reloaded, terminal.id, new Date('2026-09-14T08:06:00.000Z'))
    expect(projectShortBatchArchive(forgotten)).toEqual([])
    expect(forgotten.metadata.shortExportBatchArchive).toBeUndefined()
  })

  it('restores only current reviewed candidates from a complete archived selection without starting a batch', () => {
    const { project, items, plans } = durableFixture()
    const original = createPersistedShortBatch(items, plans, new Date('2026-09-14T08:02:00.000Z'), 'abababab-0000-4000-8000-000000000001')
    const terminal = replacePersistedShortBatchItems(original, original.items.map((entry, index) => index === 0
      ? { ...entry, state: 'succeeded' as const, progress: 1, jobId: 'job-success', createdAt: '2026-09-14T08:03:00.000Z', updatedAt: '2026-09-14T08:04:00.000Z', renderedPath: entry.outputPath, sizeBytes: 2048 }
      : { ...entry, state: 'cancelled' as const }), new Date('2026-09-14T08:04:00.000Z'))
    const archived = projectShortBatchArchive(archiveProjectShortBatch(project, terminal, new Date('2026-09-14T08:05:00.000Z')))[0]
    const candidates = planShortExportRanges(project).candidates
    expect(reviewArchivedShortBatchSelection(archived, candidates)).toEqual({ candidateIds: [candidates[0].id], formats: ['vertical', 'square'], unavailable: [] })
    expect(reviewArchivedShortBatchSelection(archived, [])).toEqual({ candidateIds: [], formats: ['vertical', 'square'], unavailable: [{ candidateId: candidates[0].id, title: 'Hook' }] })
    expect(() => reviewArchivedShortBatchSelection({ ...archived, items: [...archived.items, { ...archived.items[0], id: 'other:vertical', candidateId: 'other', title: 'Other', outputPath: 'KINAOU/Renders/other.mp4' }] }, candidates)).toThrow(/complete candidate/)
  })

  it('rejects unfinished archives and retains only ten unique newest terminal runs', () => {
    const { project, items, plans } = durableFixture()
    const queued = createPersistedShortBatch(items, plans, new Date('2026-09-14T08:02:00.000Z'), '66666666-6666-4666-8666-666666666666')
    expect(() => archiveProjectShortBatch(project, queued)).toThrow(/fully finished/)
    const terminal = replacePersistedShortBatchItems(queued, queued.items.map((entry) => ({ ...entry, state: 'cancelled' as const })), new Date('2026-09-14T08:03:00.000Z'))
    let archived = project
    const ids: string[] = []
    for (let index = 1; index <= shortBatchArchiveLimit + 1; index += 1) {
      const marker = String(index).padStart(8, '0')
      const id = `${marker}-0000-4000-8000-${String(index).padStart(12, '0')}`
      ids.push(id)
      archived = archiveProjectShortBatch(archived, { ...terminal, id }, new Date(`2026-09-14T${String(index + 8).padStart(2, '0')}:00:00.000Z`))
    }
    expect(projectShortBatchArchive(archived).map((entry) => entry.batchId)).toEqual(ids.slice(1).reverse())
    const retained = { ...terminal, id: ids[4] }
    const moved = archiveProjectShortBatch(archived, retained, new Date('2026-09-14T21:00:00.000Z'))
    expect(projectShortBatchArchive(moved)).toHaveLength(shortBatchArchiveLimit)
    expect(projectShortBatchArchive(moved)[0].batchId).toBe(ids[4])
    expect(new Set(projectShortBatchArchive(moved).map((entry) => entry.batchId)).size).toBe(shortBatchArchiveLimit)
    expect(forgetProjectShortBatchArchiveEntry(moved, '77777777-7777-4777-8777-777777777777')).toBe(moved)
    expect(projectShortBatchArchive({ ...project, metadata: { shortExportBatchArchive: [{ schemaVersion: 999 }] } })).toEqual([])
  })
})
