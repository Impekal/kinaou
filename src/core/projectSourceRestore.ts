import { sourceRestoreEvidence, validateSourceRestoreRequest, validateSourceRestoreQuery, validateSourceRestoreJob, type SourceRestoreRequest, type SourceRestoreJob } from '../../worker/project-source-restore-protocol.mjs'
import type { SourceArchiveJob } from '../../worker/project-source-protocol.mjs'
import type { DeliveryStorage } from './courseLessonDelivery'
export type { SourceRestoreRequest, SourceRestoreJob }
export async function prepareSourceRestore(job: SourceArchiveJob, language: 'de' | 'en' | 'fr', acknowledged: boolean): Promise<SourceRestoreRequest> {
  if (!acknowledged) throw Error('Acknowledge the private isolated copy first')
  const evidence = sourceRestoreEvidence(job), source = structuredClone(job.query)
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(evidence))
  const evidenceSha256 = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
  return validateSourceRestoreRequest({ schemaVersion: 1, restoreId: crypto.randomUUID(), source, evidenceSha256, language, acknowledgeIsolatedCopy: true })
}
export function sourceRestoreScope(workerUrl: string, roots: string[]) {
  const url = new URL(workerUrl)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || workerUrl.length > 500 || roots.length !== 1 || !roots[0] || roots[0].length > 4096) throw Error('One explicit connected restoration root is required')
  return JSON.stringify([workerUrl, roots])
}
const key = (scope: string) => {
  if (typeof scope !== 'string' || !scope || scope.length > 5000) throw Error('Invalid restoration scope')
  return 'kinaou.source-restore.pending.v1.' + encodeURIComponent(scope)
}
export function readSourceRestoreTicket(storage: DeliveryStorage, scope: string): SourceRestoreRequest | null {
  const raw = storage.getItem(key(scope)); if (raw === null) return null
  if (raw.length > 4096) throw Error('Oversized restoration reminder')
  return validateSourceRestoreRequest(JSON.parse(raw))
}
export function retainSourceRestoreTicket(storage: DeliveryStorage, scope: string, request: SourceRestoreRequest) {
  if (readSourceRestoreTicket(storage, scope)) throw Error('Resolve the existing restoration reminder first')
  const raw = JSON.stringify(validateSourceRestoreRequest(request)); storage.setItem(key(scope), raw)
  if (storage.getItem(key(scope)) !== raw) throw Error('Restoration reminder was not saved; nothing may start')
}
export function forgetSourceRestoreTicket(storage: DeliveryStorage, scope: string, request: SourceRestoreRequest) {
  if (JSON.stringify(readSourceRestoreTicket(storage, scope)) !== JSON.stringify(validateSourceRestoreRequest(request))) throw Error('Restoration reminder changed')
  storage.removeItem(key(scope)); if (storage.getItem(key(scope)) !== null) throw Error('Restoration reminder could not be removed')
}
export interface SourceRestoreFeedback { phase: 'checking' | 'job' | 'uncertain'; job?: SourceRestoreJob; detail?: string }
/** Every operation uses a durable, scope-bound ID. Reload/check never resubmits. */
export class SourceRestoreSession {
  private active = true
  private busy = false
  private readonly request: SourceRestoreRequest
  constructor(request: SourceRestoreRequest, private readonly deps: { scope: string; storage: DeliveryStorage; current: () => boolean; publish: (feedback: SourceRestoreFeedback) => void; client: {
    startProjectSourceRestore: (request: SourceRestoreRequest) => Promise<SourceRestoreJob>
    projectSourceRestoreStatus: (query: ReturnType<typeof validateSourceRestoreQuery>) => Promise<SourceRestoreJob>
  } }) { this.request = validateSourceRestoreRequest(structuredClone(request)) }
  detach() { this.active = false }
  private current() { if (!this.deps.current()) this.detach(); return this.active }
  async run(start = false) {
    if (this.busy || !this.current()) return
    this.busy = true
    try {
      if (JSON.stringify(readSourceRestoreTicket(this.deps.storage, this.deps.scope)) !== JSON.stringify(this.request)) throw Error('Restoration reminder changed')
      this.deps.publish({ phase: 'checking' })
      const query = validateSourceRestoreQuery(this.request)
      const raw = await (start ? this.deps.client.startProjectSourceRestore(structuredClone(this.request)) : this.deps.client.projectSourceRestoreStatus(query))
      const job = validateSourceRestoreJob(raw, query)
      if (this.current()) this.deps.publish({ phase: 'job', job })
    } catch (cause) { if (this.current()) this.deps.publish({ phase: 'uncertain', detail: String(cause) }) }
    finally { this.busy = false }
  }
}
