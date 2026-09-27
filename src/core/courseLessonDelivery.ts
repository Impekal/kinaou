import { z } from 'zod'
import { exportReceiptSchema, projectCourseOutputIndex } from './exportHistory'
import { courseExportContextSchema } from './course'
import type { KinaouProject } from './project'
import { courseDeliveryMaterialLimits, lessonDeliveryMaterialsSchema } from './courseDeliveryMaterialSchema'

export const maxLessonDeliveryBytes = 8 * 1024 ** 3
const identity = z.string().min(1).max(200).refine(value => value === value.trim() && !/[\x00-\x1f\x7f]/.test(value))
export const lessonDeliveryRequestSchema = z.object({
  schemaVersion: z.union([z.literal(1), z.literal(2), z.literal(3)]), requestId: z.string().regex(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/),
  projectId: identity, acknowledgePrivateMetadata: z.literal(true), export: exportReceiptSchema.extend({ courseLesson: courseExportContextSchema }).strict(),
  materials: lessonDeliveryMaterialsSchema.optional()
}).strict().superRefine((value, ctx) => {
  const { materials, ...base } = value, encoder = new TextEncoder()
  if (encoder.encode(JSON.stringify(base)).length > 48 * 1024 || encoder.encode(JSON.stringify(value)).length > courseDeliveryMaterialLimits.requestBytes) ctx.addIssue({ code: 'custom', message: 'Delivery request size limit exceeded' })
  if ((value.schemaVersion !== 1) !== !!materials || (value.schemaVersion === 3) !== !!materials?.subtitles) ctx.addIssue({ code: 'custom', message: 'Version 1 is video-only; version 2 requires texts; version 3 requires reviewed subtitles' })
  if (materials) {
    const source = materials.source, original = value.export.courseLesson
    if (['courseId','moduleId','lessonId','language'].some(key => source.context[key as keyof typeof original] !== original[key as keyof typeof original]) || source.range.inMs !== value.export.range.inMs || source.range.outMs !== value.export.range.outMs) ctx.addIssue({ code: 'custom', message: 'Material context does not match selected video identity/language/range' })
  }
})
export type LessonDeliveryRequest = z.infer<typeof lessonDeliveryRequestSchema>
const resultSchema = z.object({ directory: z.string(), manifestPath: z.string(), mediaPath: z.string(), sourcePath: z.string(), sizeBytes: z.number().int().positive().max(maxLessonDeliveryBytes), sha256: z.string().regex(/^[a-f0-9]{64}$/), createdAt: z.string().datetime(), integrityCheckedAt: z.string().datetime(), files: z.array(z.object({ path: z.string(), sha256: z.string().regex(/^[a-f0-9]{64}$/), sizeBytes: z.number().int().positive().max(courseDeliveryMaterialLimits.bytes) }).strict()).max(courseDeliveryMaterialLimits.files).optional() }).strict()
const jobSchema = z.object({
  schemaVersion: z.literal(1), request: lessonDeliveryRequestSchema,
  state: z.enum(['unknown','queued','copying','verifying','ready','failed','interrupted','integrityFailed']),
  copiedBytes: z.number().int().nonnegative().max(maxLessonDeliveryBytes).optional(), totalBytes: z.number().int().positive().max(maxLessonDeliveryBytes).optional(),
  result: resultSchema.optional(), error: z.string().min(1).max(4000).optional()
}).strict()
export type LessonDeliveryJob = z.infer<typeof jobSchema>
export function parseLessonDeliveryJob(value: unknown, request: LessonDeliveryRequest) {
  const job = jobSchema.parse(value), expected = lessonDeliveryRequestSchema.parse(request), base = `KINAOU/Renders/CourseDeliveries/${expected.requestId}`
  if (JSON.stringify(job.request) !== JSON.stringify(expected)) throw Error('Delivery reply belongs to a different request')
  if (job.state === 'ready') {
    const result = job.result
    if (!result || result.directory !== base || result.mediaPath !== `${base}/lesson.mp4` || result.manifestPath !== `${base}/manifest.json` || result.sourcePath !== expected.export.outputRelativePath
      || (expected.export.sizeBytes !== undefined && result.sizeBytes !== expected.export.sizeBytes)) throw Error('Delivery result does not match requested files')
    if (expected.materials) {
      if (!result.files || result.files.length !== expected.materials.files.length) throw Error('Missing delivery material results')
      const paths = new Set<string>()
      for (const file of result.files) {
        const source = expected.materials.files.find(entry => `${base}/${entry.path}` === file.path)
        if (!source || paths.has(file.path) || file.sha256 !== source.sha256 || file.sizeBytes !== new TextEncoder().encode(source.text).length) throw Error('Delivery material result differs from reviewed bytes')
        paths.add(file.path)
      }
    } else if (result.files) throw Error('Unexpected materials on video-only delivery')
  } else if (job.result) throw Error('Unfinished delivery cannot expose a completed result')
  if (!['copying','verifying'].includes(job.state) && (job.copiedBytes !== undefined || job.totalBytes !== undefined)) throw Error('Unexpected delivery progress')
  if (!['failed','interrupted','integrityFailed'].includes(job.state) && job.error) throw Error('Unexpected delivery error')
  if (['copying','verifying'].includes(job.state) && (job.totalBytes === undefined || job.copiedBytes === undefined || job.copiedBytes > job.totalBytes)) throw Error('Invalid delivery progress')
  if (['failed','interrupted','integrityFailed'].includes(job.state) && !job.error) throw Error('Missing delivery failure details')
  return job
}
export function prepareLessonDelivery(project: KinaouProject, jobId: string, acknowledged: boolean, requestId = crypto.randomUUID()): LessonDeliveryRequest {
  if (!acknowledged) throw Error('Private delivery metadata must be acknowledged')
  const receipt = projectCourseOutputIndex(project).find(entry => entry.jobId === jobId)
  if (!receipt) throw Error('Select a retained lesson video')
  return lessonDeliveryRequestSchema.parse({ schemaVersion: 1, requestId, projectId: project.id, acknowledgePrivateMetadata: true, export: receipt })
}
const ticketSchema = z.object({ schemaVersion: z.literal(1), workerUrl: z.string().min(1).max(500), request: lessonDeliveryRequestSchema }).strict()
export type LessonDeliveryTicket = z.infer<typeof ticketSchema>
export type DeliveryStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
const key = (id: string) => `kinaou.course-delivery.pending.v1.${encodeURIComponent(id)}`
export function readLessonDeliveryTicket(storage: DeliveryStorage, projectId: string): LessonDeliveryTicket | null {
  const raw = storage.getItem(key(projectId)); if (raw === null) return null
  if (raw.length > 2 * 1024 * 1024) throw Error('Oversized delivery recovery record')
  const ticket = ticketSchema.parse(JSON.parse(raw))
  if (ticket.request.projectId !== projectId) throw Error('Delivery recovery belongs to another project')
  return ticket
}
export function retainLessonDeliveryTicket(storage: DeliveryStorage, ticket: LessonDeliveryTicket) {
  const value = ticketSchema.parse(ticket), previous = readLessonDeliveryTicket(storage, value.request.projectId)
  if (previous) throw Error('Resolve the retained delivery operation before starting another')
  const raw = JSON.stringify(value)
  storage.setItem(key(value.request.projectId), raw)
  if (storage.getItem(key(value.request.projectId)) !== raw) throw Error('Delivery recovery record was not stored; nothing may start')
}
export function forgetLessonDeliveryTicket(storage: DeliveryStorage, ticket: LessonDeliveryTicket) {
  if (JSON.stringify(readLessonDeliveryTicket(storage, ticket.request.projectId)) !== JSON.stringify(ticketSchema.parse(ticket))) throw Error('Delivery recovery changed; do not clear a different operation')
  storage.removeItem(key(ticket.request.projectId))
  if (storage.getItem(key(ticket.request.projectId)) !== null) throw Error('Delivery recovery record could not be cleared')
}

export interface DeliveryFeedback { phase: 'checking' | 'job' | 'uncertain' | 'failed' | 'detached'; job?: LessonDeliveryJob; detail?: string }
/** Start exactly once only after durable ticket storage. Recovery only reads the same ID. */
export class LessonDeliverySession {
  private active = true
  private busy = false
  private attempted = false
  constructor(private readonly ticket: LessonDeliveryTicket, private deps: {
    storage: DeliveryStorage; current: () => boolean
    client: { startLessonDelivery: (input: LessonDeliveryRequest) => Promise<LessonDeliveryJob>; lessonDeliveryStatus: (input: LessonDeliveryRequest) => Promise<LessonDeliveryJob> }
    publish: (value: DeliveryFeedback) => void
  }) { this.ticket = ticketSchema.parse(structuredClone(ticket)) }
  detach() { this.active = false }
  private current() { if (!this.deps.current()) this.detach(); return this.active }
  async start() {
    if (this.busy || this.attempted || !this.current()) return
    this.busy = true; this.attempted = true
    let submitted = false
    try {
      retainLessonDeliveryTicket(this.deps.storage, this.ticket)
      if (!this.current()) return
      this.deps.publish({ phase: 'checking' }); submitted = true
      const value = await this.deps.client.startLessonDelivery(structuredClone(this.ticket.request))
      if (this.current()) this.deps.publish({ phase: 'job', job: parseLessonDeliveryJob(value, this.ticket.request) })
    } catch (cause) { if (this.current()) this.deps.publish({ phase: submitted ? 'uncertain' : 'failed', detail: String(cause) }) }
    finally { this.busy = false }
  }
  async check() {
    if (this.busy || !this.current()) return
    this.busy = true
    try {
      if (JSON.stringify(readLessonDeliveryTicket(this.deps.storage, this.ticket.request.projectId)) !== JSON.stringify(ticketSchema.parse(this.ticket))) throw Error('Delivery recovery changed')
      this.deps.publish({ phase: 'checking' })
      const value = await this.deps.client.lessonDeliveryStatus(structuredClone(this.ticket.request))
      if (this.current()) this.deps.publish({ phase: 'job', job: parseLessonDeliveryJob(value, this.ticket.request) })
    } catch (cause) { if (this.current()) this.deps.publish({ phase: 'uncertain', detail: String(cause) }) }
    finally { this.busy = false }
  }
}
