import { describe, expect, it } from 'vitest'
import { cancelPendingShortBatchItems, nextShortBatchItem, shortBatchBusy, type ShortBatchRenderItem } from '../src/core/shortExportBatch'

function item(id: string, state: ShortBatchRenderItem['state'] = 'queued', jobId?: string): ShortBatchRenderItem {
  return { id, title: id, inMs: 0, outMs: 1000, durationMs: 1000, outputPath: `KINAOU/Renders/${id}.mp4`, state, progress: 0, ...(jobId ? { jobId } : {}) }
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
})
