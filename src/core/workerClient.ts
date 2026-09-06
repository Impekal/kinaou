import { parseAssetUploadResult, type AssetUploadResult } from './assetUpload'
import { workerHandshakeSchema, type MediaProbeResult, type WorkerHandshake } from './workerProtocol'
import type { RenderPlan } from './render'
import { parseRenderJob, type RenderJobRecord } from './renderJobs'

export interface WorkerClientOptions {
  baseUrl: string
  token: string
  fetchImpl?: typeof fetch
}

export class WorkerClient {
  private readonly baseUrl: string
  private readonly token: string
  private readonly fetchImpl: typeof fetch

  constructor(options: WorkerClientOptions) {
    const url = new URL(options.baseUrl)
    if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname)) {
      throw new Error('Local worker client only accepts localhost HTTP endpoints')
    }
    if (!options.token.trim()) throw new Error('Worker token is required')
    this.baseUrl = url.toString().replace(/\/$/, '')
    this.token = options.token
    this.fetchImpl = options.fetchImpl ?? fetch
  }

  async health(): Promise<WorkerHandshake> {
    const payload = await this.request('/health', { method: 'GET' })
    if (payload?.ok !== true || payload?.type !== 'health') throw new Error('Invalid worker health response')
    return workerHandshakeSchema.parse(payload.handshake)
  }

  async importAsset(file: Blob, filename: string): Promise<AssetUploadResult> {
    if (!filename.trim()) throw new Error('Asset filename is required')
    const response = await this.fetchImpl(`${this.baseUrl}/assets/import`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.token}`,
        'content-type': file.type || 'application/octet-stream',
        'x-kinaou-filename': encodeURIComponent(filename)
      },
      body: file
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok) throw new Error(payload?.error?.message ?? `Worker request failed with HTTP ${response.status}`)
    if (payload?.ok !== true || payload?.type !== 'asset-upload') throw new Error('Invalid worker asset upload response')
    return parseAssetUploadResult(payload.result)
  }

  async probe(path: string): Promise<MediaProbeResult> {
    const payload = await this.request('/probe', { method: 'POST', body: JSON.stringify({ path }) })
    if (payload?.ok !== true || payload?.type !== 'probe-media') throw new Error('Invalid worker probe response')
    return payload.result as MediaProbeResult
  }

  async startRender(plan: RenderPlan): Promise<RenderJobRecord> {
    const payload = await this.request('/render', { method: 'POST', body: JSON.stringify({ plan }) })
    if (payload?.ok !== true || payload?.type !== 'render-job') throw new Error('Invalid worker render job response')
    return parseRenderJob(payload.job)
  }

  async renderStatus(jobId: string): Promise<RenderJobRecord> {
    const payload = await this.request(`/render/jobs/${encodeURIComponent(jobId)}`, { method: 'GET' })
    if (payload?.ok !== true || payload?.type !== 'render-job') throw new Error('Invalid worker render status response')
    return parseRenderJob(payload.job)
  }

  async cancelRender(jobId: string): Promise<RenderJobRecord> {
    const payload = await this.request(`/render/jobs/${encodeURIComponent(jobId)}/cancel`, { method: 'POST' })
    if (payload?.ok !== true || payload?.type !== 'render-job') throw new Error('Invalid worker render cancellation response')
    return parseRenderJob(payload.job)
  }

  private async request(path: string, init: RequestInit): Promise<any> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${this.token}`,
        'content-type': 'application/json',
        ...(init.headers ?? {})
      }
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok) throw new Error(payload?.error?.message ?? `Worker request failed with HTTP ${response.status}`)
    return payload
  }
}
