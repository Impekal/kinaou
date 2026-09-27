import { parseProject, type KinaouProject } from './project'
import { projectCourse } from './course'
import { projectContentProfile, type ContentLanguage } from './contentProfile'
import { sourceProjectInventory, validateSourceArchiveRequest, validateSourceArchiveQuery, validateSourceArchiveJob, type SourceArchiveInventory, type SourceArchiveQuery, type SourceArchiveRequest, type SourceArchiveJob } from '../../worker/project-source-protocol.mjs'
import type { DeliveryStorage } from './courseLessonDelivery'
export type { SourceArchiveRequest, SourceArchiveQuery, SourceArchiveJob }
export interface SourceArchiveReview extends SourceArchiveInventory { projectSha256: string; language: ContentLanguage }
const reviews = new WeakMap<SourceArchiveReview, { project: string; projectText: string; review: string }>()
/** Browser metadata review; does not claim source presence or file sizes. Worker checks those before copying. */
export async function reviewProjectSourceArchive(project: KinaouProject): Promise<SourceArchiveReview> {
  parseProject(project)
  const baseline = JSON.stringify(project), snapshot = JSON.parse(baseline) as KinaouProject, projectText = JSON.stringify(snapshot, null, 2)
  const inventory = sourceProjectInventory(projectText), language = projectCourse(snapshot)?.language ?? projectContentProfile(snapshot).outputLanguage
  const projectSha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(projectText))), byte => byte.toString(16).padStart(2, '0')).join('')
  const review = { ...inventory, language, projectSha256 }
  reviews.set(review, { project: baseline, projectText, review: JSON.stringify(review) }); return review
}
export function useProjectSourceArchiveReview(project: KinaouProject, review: SourceArchiveReview, acknowledged: boolean): SourceArchiveRequest {
  const source = reviews.get(review)
  if (!acknowledged || !source || source.project !== JSON.stringify(project) || source.review !== JSON.stringify(review)) throw Error('Review and acknowledge the unchanged project again')
  return validateSourceArchiveRequest({ schemaVersion: 1, requestId: crypto.randomUUID(), projectId: project.id, projectSha256: review.projectSha256, acknowledgePrivateArchive: true, language: review.language, projectText: source.projectText })
}
export interface SourceArchiveTicket { schemaVersion: 1; workerUrl: string; query: SourceArchiveQuery }
const key = (projectId: string) => `kinaou.project-source.pending.v1.${encodeURIComponent(projectId)}`
function ticket(value: unknown): SourceArchiveTicket {
  const input = value as SourceArchiveTicket
  if (input?.schemaVersion !== 1 || typeof input.workerUrl !== 'string' || !input.workerUrl.trim() || input.workerUrl.length > 500) throw Error('Invalid archive reminder')
  const url = new URL(input.workerUrl)
  if (!['http:','https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw Error('Invalid archive worker URL')
  return { schemaVersion: 1, workerUrl: input.workerUrl, query: validateSourceArchiveQuery(input.query) }
}
export function readSourceArchiveTicket(storage: DeliveryStorage, projectId: string): SourceArchiveTicket | null {
  const raw = storage.getItem(key(projectId)); if (raw === null) return null
  if (raw.length > 4096) throw Error('Oversized archive reminder')
  const result = ticket(JSON.parse(raw)); if (result.query.projectId !== projectId) throw Error('Archive reminder belongs to another project'); return result
}
export function retainSourceArchiveTicket(storage: DeliveryStorage, value: SourceArchiveTicket) {
  const input = ticket(value); if (readSourceArchiveTicket(storage, input.query.projectId)) throw Error('Resolve the previous archive reminder first')
  const raw = JSON.stringify(input); storage.setItem(key(input.query.projectId), raw)
  if (storage.getItem(key(input.query.projectId)) !== raw) throw Error('Archive reminder was not saved; nothing may start')
}
export function forgetSourceArchiveTicket(storage: DeliveryStorage, value: SourceArchiveTicket) {
  const input = ticket(value)
  if (JSON.stringify(readSourceArchiveTicket(storage, input.query.projectId)) !== JSON.stringify(input)) throw Error('Archive reminder changed')
  storage.removeItem(key(input.query.projectId)); if (storage.getItem(key(input.query.projectId)) !== null) throw Error('Archive reminder could not be removed')
}
export interface SourceArchiveFeedback { phase: 'checking' | 'job' | 'failed' | 'uncertain'; job?: SourceArchiveJob; detail?: string }
export class SourceArchiveSession {
  private active = true
  private busy = false
  private attempted = false
  private readonly ticket: SourceArchiveTicket
  constructor(value: SourceArchiveTicket, private readonly deps: { storage: DeliveryStorage; current: () => boolean; publish: (value: SourceArchiveFeedback) => void; client: { startProjectSourceArchive: (request: SourceArchiveRequest) => Promise<SourceArchiveJob>; projectSourceArchiveStatus: (query: SourceArchiveQuery) => Promise<SourceArchiveJob> } }) { this.ticket = ticket(structuredClone(value)) }
  detach() { this.active = false }
  private current() { if (!this.deps.current()) this.detach(); return this.active }
  async start(request: SourceArchiveRequest) { return this.run(request) }
  async check() { return this.run() }
  private async run(raw?: SourceArchiveRequest) {
    if (this.busy || !this.current() || (raw && this.attempted)) return
    this.busy = true; if (raw) this.attempted = true
    let submitted = false
    try {
      const request = raw ? validateSourceArchiveRequest(structuredClone(raw)) : undefined
      if (request) {
        if (JSON.stringify(validateSourceArchiveQuery(request)) !== JSON.stringify(this.ticket.query)) throw Error('Archive request differs from reminder')
        retainSourceArchiveTicket(this.deps.storage, this.ticket)
      } else if (JSON.stringify(readSourceArchiveTicket(this.deps.storage, this.ticket.query.projectId)) !== JSON.stringify(this.ticket)) throw Error('Archive reminder changed')
      if (!this.current()) return
      this.deps.publish({ phase: 'checking' }); submitted = true
      const job = await (request ? this.deps.client.startProjectSourceArchive(request) : this.deps.client.projectSourceArchiveStatus(structuredClone(this.ticket.query)))
      if (this.current()) this.deps.publish({ phase: 'job', job: validateSourceArchiveJob(job, this.ticket.query) })
    } catch (cause) { if (this.current()) this.deps.publish({ phase: submitted || !raw ? 'uncertain' : 'failed', detail: String(cause) }) }
    finally { this.busy = false }
  }
}
