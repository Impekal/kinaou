import { workerHandshakeSchema, type MediaProbeResult, type RenderExecutionResult, type WorkerHandshake } from './workerProtocol'
import type { RenderPlan } from './render'

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

  async probe(path: string): Promise<MediaProbeResult> {
    const payload = await this.request('/probe', {
      method: 'POST',
      body: JSON.stringify({ path })
    })
    if (payload?.ok !== true || payload?.type !== 'probe-media') throw new Error('Invalid worker probe response')
    return payload.result as MediaProbeResult
  }

  async render(plan: RenderPlan): Promise<RenderExecutionResult> {
    const payload = await this.request('/render', {
      method: 'POST',
      body: JSON.stringify({ plan })
    })
    if (payload?.ok !== true || payload?.type !== 'render') throw new Error('Invalid worker render response')
    return payload.result as RenderExecutionResult
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
    if (!response.ok) {
      const message = payload?.error?.message ?? `Worker request failed with HTTP ${response.status}`
      throw new Error(message)
    }
    return payload
  }
}
