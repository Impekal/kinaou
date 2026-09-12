import type { RenderJobState } from './renderJobs'
import type { ShortExportBatchItem } from './shortExportRanges'

export interface ShortBatchRenderItem extends ShortExportBatchItem {
  state: RenderJobState
  progress: number
  jobId?: string
  sizeBytes?: number
  renderedPath?: string
  error?: string
}

export const shortBatchTerminalStates = new Set<RenderJobState>(['succeeded', 'failed', 'cancelled'])

export function shortBatchBusy(items: ShortBatchRenderItem[]): boolean {
  return items.some((item) => !shortBatchTerminalStates.has(item.state))
}

export function nextShortBatchItem(items: ShortBatchRenderItem[]): ShortBatchRenderItem | undefined {
  if (items.some((item) => item.jobId && !shortBatchTerminalStates.has(item.state))) return undefined
  return items.find((item) => item.state === 'queued' && !item.jobId)
}

export function cancelPendingShortBatchItems(items: ShortBatchRenderItem[]): ShortBatchRenderItem[] {
  return items.map((item) => item.state === 'queued' && !item.jobId ? { ...item, state: 'cancelled' } : item)
}
