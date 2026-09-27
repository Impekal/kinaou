import { z } from 'zod'
import { courseExportContextSchema } from './course'
import { lessonDeliveryRequestSchema, parseLessonDeliveryJob, type LessonDeliveryJob } from './courseLessonDelivery'
const uuid = z.string().regex(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/)
const identity = z.string().min(1).max(200).refine(value => value === value.trim() && !/[\x00-\x1f\x7f]/.test(value))
export const deliveryLibraryQuerySchema = z.object({ projectId: identity, after: uuid.optional() }).strict()
export const deliveryLibraryLookupSchema = z.object({ projectId: identity, requestId: uuid }).strict()
export type DeliveryLibraryQuery = z.infer<typeof deliveryLibraryQuerySchema>
export type DeliveryLibraryLookup = z.infer<typeof deliveryLibraryLookupSchema>
const entrySchema = z.object({ requestId: uuid, projectId: identity, courseLesson: courseExportContextSchema,
  sourcePath: z.string().min(1).max(1000), requestVersion: z.union([z.literal(1), z.literal(2), z.literal(3)]), materialFiles: z.number().int().min(0).max(15), hasSubtitles: z.boolean(), hasCompletionRecord: z.boolean() }).strict()
const pageSchema = z.object({ schemaVersion: z.literal(1), projectId: identity, after: uuid.optional(), entries: z.array(entrySchema).max(20), scanned: z.number().int().min(0).max(20), skipped: z.number().int().min(0).max(20), nextCursor: uuid.optional() }).strict()
export type DeliveryLibraryPage = z.infer<typeof pageSchema>
export function parseDeliveryLibraryPage(value: unknown, query: DeliveryLibraryQuery) {
  const page = pageSchema.parse(value), expected = deliveryLibraryQuerySchema.parse(query)
  if (page.projectId !== expected.projectId || page.after !== expected.after || page.entries.length + page.skipped > page.scanned || (page.nextCursor && (page.scanned !== 20 || page.nextCursor <= (page.after ?? '')))) throw Error('Invalid delivery library page scope/count/cursor')
  let previous = page.after ?? ''
  for (const entry of page.entries) {
    if (entry.projectId !== expected.projectId || entry.requestId <= previous || (page.nextCursor && entry.requestId > page.nextCursor)
      || (entry.requestVersion === 1 ? entry.materialFiles !== 0 : entry.materialFiles === 0)
      || entry.hasSubtitles !== (entry.requestVersion === 3) || (entry.requestVersion === 2 && entry.materialFiles > 14)) throw Error('Invalid delivery library entry')
    previous = entry.requestId
  }
  return page
}
export function parseDeliveryLibraryInspection(value: unknown, lookup: DeliveryLibraryLookup) {
  const expected = deliveryLibraryLookupSchema.parse(lookup), request = lessonDeliveryRequestSchema.parse((value as { request?: unknown } | null)?.request)
  if (request.projectId !== expected.projectId || request.requestId !== expected.requestId) throw Error('Delivery inspection belongs to another project or ID')
  return parseLessonDeliveryJob(value, request)
}
export interface DeliveryLibraryFeedback { phase: 'listing' | 'checking' | 'page' | 'job' | 'failed'; page?: DeliveryLibraryPage; job?: LessonDeliveryJob; detail?: string }
/** Explicit reads only, with permanent detachment on scope changes. No recovery-ticket writes. */
export class DeliveryLibrarySession {
  private active = true
  private busy = false
  constructor(private readonly projectId: string, private readonly deps: { current: () => boolean; client: {
    listLessonDeliveries: (query: DeliveryLibraryQuery) => Promise<DeliveryLibraryPage>
    inspectLessonDelivery: (lookup: DeliveryLibraryLookup) => Promise<LessonDeliveryJob>
  }; publish: (value: DeliveryLibraryFeedback) => void }) {}
  detach() { this.active = false }
  private current() { if (!this.deps.current()) this.detach(); return this.active }
  async list(after?: string) {
    if (this.busy || !this.current()) return
    this.busy = true
    try {
      const query = deliveryLibraryQuerySchema.parse({ projectId: this.projectId, ...(after ? { after } : {}) })
      this.deps.publish({ phase: 'listing' })
      const page = parseDeliveryLibraryPage(await this.deps.client.listLessonDeliveries(query), query)
      if (this.current()) this.deps.publish({ phase: 'page', page })
    } catch (cause) { if (this.current()) this.deps.publish({ phase: 'failed', detail: String(cause) }) }
    finally { this.busy = false }
  }
  async inspect(requestId: string) {
    if (this.busy || !this.current()) return
    this.busy = true
    try {
      const lookup = deliveryLibraryLookupSchema.parse({ projectId: this.projectId, requestId })
      this.deps.publish({ phase: 'checking' })
      const job = parseDeliveryLibraryInspection(await this.deps.client.inspectLessonDelivery(lookup), lookup)
      if (this.current()) this.deps.publish({ phase: 'job', job })
    } catch (cause) { if (this.current()) this.deps.publish({ phase: 'failed', detail: String(cause) }) }
    finally { this.busy = false }
  }
}
