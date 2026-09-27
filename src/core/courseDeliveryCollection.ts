import { projectCourse } from './course'
import type { KinaouProject } from './project'
import { parseLessonDeliveryJob, type LessonDeliveryJob, type DeliveryStorage } from './courseLessonDelivery'
import { collectionSourceText, courseCollectionLimits, validateCourseCollectionRequest, validateCourseCollectionJob, type CourseCollectionRequest, type CourseCollectionJob } from '../../worker/course-collection-protocol.mjs'
export type { CourseCollectionRequest, CourseCollectionJob }
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length
const hash = async (text: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))), byte => byte.toString(16).padStart(2, '0')).join('')
export interface CollectionReview { course: CourseCollectionRequest['course']; lessons: CourseCollectionRequest['lessons']; totalMediaBytes: number; historical: Array<{ title: string; revision: number }> }
const reviews = new WeakMap<CollectionReview, { project: string; jobs: string; value: string }>()
/** Review recorded packages, never silently substitute current texts or another render. */
export async function reviewCourseCollection(project: KinaouProject, selected: LessonDeliveryJob[]): Promise<CollectionReview> {
  const baseline = JSON.stringify(project), jobsBaseline = JSON.stringify(selected), snapshot = structuredClone(project)
  const course = projectCourse(snapshot)
  if (!course || !selected.length || selected.length > courseCollectionLimits.lessons) throw Error('Select 1–20 verified packages from the saved course')
  const jobs = structuredClone(selected).map(job => parseLessonDeliveryJob(job, job.request))
  const outline = course.modules.flatMap(module => module.lessons.map(lesson => ({ module, lesson })))
  let totalMediaBytes = 0, metadataBytes = 0
  for (const job of jobs) {
    const context = job.request.export.courseLesson, match = outline.find(item => item.module.id === context.moduleId && item.lesson.id === context.lessonId)
    if (job.state !== 'ready' || !job.result || job.request.projectId !== snapshot.id || context.courseId !== course.id || context.language !== course.language || !match
      || match.lesson.range.inMs !== job.request.export.range.inMs || match.lesson.range.outMs !== job.request.export.range.outMs) throw Error('A selected package no longer matches this saved course, language or lesson range')
    totalMediaBytes += job.result.sizeBytes; metadataBytes += bytes(job.request)
  }
  if (totalMediaBytes > courseCollectionLimits.videoBytes || metadataBytes > courseCollectionLimits.sourceMetadataBytes) throw Error('Collection exceeds 32 GiB video / 8 MiB metadata limits')
  jobs.sort((a, b) => outline.findIndex(item => item.lesson.id === a.request.export.courseLesson.lessonId) - outline.findIndex(item => item.lesson.id === b.request.export.courseLesson.lessonId))
  const lessons = await Promise.all(jobs.map(async job => {
    const context = job.request.export.courseLesson, match = outline.find(item => item.lesson.id === context.lessonId)!
    return { sourceRequestId: job.request.requestId, sourceFingerprint: await hash(collectionSourceText(job)), moduleId: match.module.id, lessonId: match.lesson.id, moduleTitle: match.module.title, lessonTitle: match.lesson.title, range: { ...match.lesson.range } }
  }))
  const courseInfo = { courseId: course.id, title: course.title, language: course.language, outlineRevision: course.revision, lessonCount: outline.length }
  validateCourseCollectionRequest({ schemaVersion: 1, requestId: '00000000-0000-0000-0000-000000000000', projectId: snapshot.id, acknowledgePrivateMetadata: true, course: courseInfo, lessons })
  const review = { course: courseInfo, lessons, totalMediaBytes, historical: jobs.map(job => ({ title: job.request.export.courseLesson.lessonTitle, revision: job.request.export.courseLesson.outlineRevision })) }
  reviews.set(review, { project: baseline, jobs: jobsBaseline, value: JSON.stringify(review) }); return review
}
export function useCollectionReview(review: CollectionReview, project: KinaouProject, jobs: LessonDeliveryJob[], acknowledged: boolean): CourseCollectionRequest {
  const baseline = reviews.get(review)
  if (!acknowledged || !baseline || baseline.project !== JSON.stringify(project) || baseline.jobs !== JSON.stringify(jobs) || baseline.value !== JSON.stringify(review)) throw Error('Review and acknowledge the unchanged selection again')
  return validateCourseCollectionRequest({ schemaVersion: 1, requestId: crypto.randomUUID(), projectId: project.id, acknowledgePrivateMetadata: true, course: review.course, lessons: review.lessons })
}
export interface CollectionTicket { schemaVersion: 1; workerUrl: string; request: CourseCollectionRequest }
const key = (id: string) => `kinaou.course-collection.pending.v1.${encodeURIComponent(id)}`
function ticket(value: unknown): CollectionTicket {
  const input = value as CollectionTicket
  if (input?.schemaVersion !== 1 || typeof input.workerUrl !== 'string' || !input.workerUrl.trim() || input.workerUrl.length > 500) throw Error('Invalid collection recovery record')
  const url = new URL(input.workerUrl)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw Error('Invalid recovery worker URL')
  return { schemaVersion: 1, workerUrl: input.workerUrl, request: validateCourseCollectionRequest(input.request) }
}
export function readCollectionTicket(storage: DeliveryStorage, projectId: string): CollectionTicket | null {
  const raw = storage.getItem(key(projectId)); if (raw === null) return null
  if (raw.length > 128 * 1024) throw Error('Oversized collection recovery record')
  const value = ticket(JSON.parse(raw)); if (value.request.projectId !== projectId) throw Error('Collection belongs to another project'); return value
}
export function retainCollectionTicket(storage: DeliveryStorage, value: CollectionTicket) {
  const input = ticket(value); if (readCollectionTicket(storage, input.request.projectId)) throw Error('Resolve existing collection reminder first')
  const raw = JSON.stringify(input); storage.setItem(key(input.request.projectId), raw)
  if (storage.getItem(key(input.request.projectId)) !== raw) throw Error('Collection reminder was not stored; nothing may start')
}
export function forgetCollectionTicket(storage: DeliveryStorage, value: CollectionTicket) {
  const input = ticket(value)
  if (JSON.stringify(readCollectionTicket(storage, input.request.projectId)) !== JSON.stringify(input)) throw Error('Collection reminder changed')
  storage.removeItem(key(input.request.projectId)); if (storage.getItem(key(input.request.projectId)) !== null) throw Error('Collection reminder could not be removed')
}
export interface CollectionFeedback { phase: 'checking' | 'job' | 'uncertain' | 'failed'; job?: CourseCollectionJob; detail?: string }
export class CollectionSession {
  private active = true
  private busy = false
  private attempted = false
  private readonly ticket: CollectionTicket
  constructor(value: CollectionTicket, private readonly deps: { storage: DeliveryStorage; current: () => boolean; client: {
    startCourseCollection: (request: CourseCollectionRequest) => Promise<CourseCollectionJob>; courseCollectionStatus: (request: CourseCollectionRequest) => Promise<CourseCollectionJob>
  }; publish: (feedback: CollectionFeedback) => void }) { this.ticket = ticket(structuredClone(value)) }
  detach() { this.active = false }
  private current() { if (!this.deps.current()) this.detach(); return this.active }
  async start() { return this.run(true) }
  async check() { return this.run(false) }
  private async run(start: boolean) {
    if (this.busy || !this.current() || (start && this.attempted)) return
    this.busy = true; if (start) this.attempted = true
    let submitted = false
    try {
      if (start) retainCollectionTicket(this.deps.storage, this.ticket)
      else if (JSON.stringify(readCollectionTicket(this.deps.storage, this.ticket.request.projectId)) !== JSON.stringify(this.ticket)) throw Error('Collection reminder changed')
      if (!this.current()) return
      this.deps.publish({ phase: 'checking' }); submitted = true
      const job = await (start ? this.deps.client.startCourseCollection(structuredClone(this.ticket.request)) : this.deps.client.courseCollectionStatus(structuredClone(this.ticket.request)))
      if (this.current()) this.deps.publish({ phase: 'job', job: validateCourseCollectionJob(job, this.ticket.request) })
    } catch (cause) { if (this.current()) this.deps.publish({ phase: submitted || !start ? 'uncertain' : 'failed', detail: String(cause) }) }
    finally { this.busy = false }
  }
}
