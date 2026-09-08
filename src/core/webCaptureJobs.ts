export type WebCaptureJobState = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'

export interface WebCaptureBrowser {
  id: string
  engine: 'chromium' | 'gecko'
  label: string
  version?: string
}

export interface WebCaptureProvenance {
  kind: 'real-capture'
  adapterId: 'headless-browser'
  browserId: string
  engine: 'chromium' | 'gecko'
  browserVersion?: string
  url: string
  width: number
  height: number
}

export interface WebCaptureJobRecord {
  id: string
  state: WebCaptureJobState
  progress: number
  createdAt: string
  updatedAt: string
  provenance: WebCaptureProvenance
  imagePath?: string
  sizeBytes?: number
  error?: string
}

export interface WebCaptureRequest {
  browserId: string
  url: string
  width?: number
  height?: number
}

const WEB_CAPTURE_PREFIX = 'KINAOU/Assets/WebCaptures/'

export function parseWebCaptureBrowsers(value: unknown): WebCaptureBrowser[] {
  if (!Array.isArray(value)) throw new Error('Invalid web capture browser list')
  return value.map((entry) => {
    const browser = entry as Partial<WebCaptureBrowser>
    if (typeof browser?.id !== 'string' || !browser.id || !['chromium', 'gecko'].includes(String(browser.engine)) || typeof browser.label !== 'string' || !browser.label) throw new Error('Invalid web capture browser entry')
    if (browser.version !== undefined && typeof browser.version !== 'string') throw new Error('Invalid web capture browser entry')
    return browser as WebCaptureBrowser
  })
}

export function parseWebCaptureProvenance(value: unknown): WebCaptureProvenance {
  if (!value || typeof value !== 'object') throw new Error('Invalid web capture provenance')
  const provenance = value as Partial<WebCaptureProvenance>
  if (provenance.kind !== 'real-capture' || provenance.adapterId !== 'headless-browser') throw new Error('Invalid web capture provenance identity')
  if (typeof provenance.browserId !== 'string' || !provenance.browserId || !['chromium', 'gecko'].includes(String(provenance.engine))) throw new Error('Invalid web capture provenance browser')
  if (typeof provenance.url !== 'string' || !/^https?:\/\//.test(provenance.url)) throw new Error('Invalid web capture provenance URL')
  if (![provenance.width, provenance.height].every((dimension) => Number.isInteger(dimension) && (dimension as number) > 0)) throw new Error('Invalid web capture provenance viewport')
  return provenance as WebCaptureProvenance
}

export function parseWebCaptureJob(value: unknown): WebCaptureJobRecord {
  if (!value || typeof value !== 'object') throw new Error('Invalid web capture job response')
  const job = value as Partial<WebCaptureJobRecord>
  if (typeof job.id !== 'string' || !['queued', 'running', 'succeeded', 'failed', 'cancelled'].includes(String(job.state))) throw new Error('Invalid web capture job identity or state')
  if (typeof job.progress !== 'number' || job.progress < 0 || job.progress > 1 || typeof job.createdAt !== 'string' || typeof job.updatedAt !== 'string') throw new Error('Invalid web capture job progress or timestamps')
  parseWebCaptureProvenance(job.provenance)
  if (job.state === 'succeeded' && (!job.imagePath?.startsWith(WEB_CAPTURE_PREFIX) || typeof job.sizeBytes !== 'number' || job.sizeBytes <= 0)) throw new Error('Invalid completed web capture result')
  return job as WebCaptureJobRecord
}
