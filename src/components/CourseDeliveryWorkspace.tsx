import { useEffect, useRef, useState } from 'react'
import type { KinaouProject } from '../core/project'
import type { LessonDeliveryJob } from '../core/courseLessonDelivery'
import { CollectionSession, forgetCollectionTicket, readCollectionTicket, reviewCourseCollection, useCollectionReview, type CollectionReview, type CollectionTicket, type CollectionFeedback } from '../core/courseDeliveryCollection'
import { WorkerClient } from '../core/workerClient'
import { CourseDeliveryLibraryPanel } from './CourseDeliveryLibraryPanel'
import { CourseCollectionLibraryPanel } from './CourseCollectionLibraryPanel'
import type { CourseOutputWorkerProps } from './CourseOutputFileCheckPanel'
import { useUiLanguage } from './UiLanguageProvider'

export function CourseDeliveryWorkspace(props: CourseOutputWorkerProps & { project: KinaouProject; dirty: boolean }) {
  const { t } = useUiLanguage(), { project, dirty, workerUrl = '', workerToken = '', workerConnected = false, workerCapabilities = [] } = props
  const [selected, setSelected] = useState<LessonDeliveryJob[]>([]), [selectionScope, setSelectionScope] = useState('')
  const workerScope = JSON.stringify([project.id, workerUrl, workerToken]), jobs = selectionScope === workerScope ? selected : []
  const available = workerConnected && !!workerToken.trim() && workerCapabilities.includes('course-delivery-collection')
  const scope = JSON.stringify([project, dirty, workerScope, available, jobs]), current = useRef(scope), generation = useRef(0), mounted = useRef(true), session = useRef<CollectionSession | null>(null)
  const [review, setReview] = useState<CollectionReview | null>(null), [reviewScope, setReviewScope] = useState(''), [ack, setAck] = useState(false)
  const [pending, setPending] = useState<CollectionTicket | null>(null), [ticketError, setTicketError] = useState(''), [forgetAck, setForgetAck] = useState(false)
  const [feedback, setFeedback] = useState<CollectionFeedback | null>(null), [feedbackScope, setFeedbackScope] = useState(''), [reviewing, setReviewing] = useState(false)
  if (current.current !== scope) { current.current = scope; generation.current++; session.current?.detach() }
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; session.current?.detach() } }, [])
  useEffect(() => { setReview(null); setAck(false); setFeedback(null); setReviewing(false); setForgetAck(false); loadTicket() }, [scope])
  function loadTicket() { try { setPending(readCollectionTicket(window.localStorage, project.id)); setTicketError('') } catch (cause) { setPending(null); setTicketError(String(cause)) } }
  const shown = feedbackScope === scope ? feedback : null, visibleReview = reviewScope === scope ? review : null
  const ticket = pending?.request.projectId === project.id ? pending : null, busy = reviewing || shown?.phase === 'checking'
  function publish(value: CollectionFeedback, baseline = scope) { if (mounted.current && current.current === baseline) { setFeedbackScope(baseline); setFeedback(value) } }
  async function prepare() {
    if (!available || dirty || busy || ticket || ticketError) return
    const baseline = scope, revision = generation.current; setReviewing(true); setReview(null); setAck(false); setFeedback(null)
    try { const next = await reviewCourseCollection(project, jobs); if (mounted.current && current.current === baseline && generation.current === revision) { setReview(next); setReviewScope(baseline) } }
    catch (cause) { if (generation.current === revision) publish({ phase: 'failed', detail: String(cause) }, baseline) }
    finally { if (mounted.current && current.current === baseline && generation.current === revision) setReviewing(false) }
  }
  function task(value: CollectionTicket) {
    session.current?.detach(); const baseline = scope
    const next = new CollectionSession(value, { storage: window.localStorage, client: new WorkerClient({ baseUrl: workerUrl, token: workerToken }), current: () => mounted.current && current.current === baseline && session.current === next,
      publish: value => { publish(value, baseline); if (mounted.current && current.current === baseline) loadTicket() } })
    session.current = next; return next
  }
  async function start() {
    if (!available || dirty || busy || ticket || ticketError || !visibleReview || !ack) return
    try { const request = useCollectionReview(visibleReview, project, jobs, ack); await task({ schemaVersion: 1, workerUrl, request }).start() }
    catch (cause) { publish({ phase: 'failed', detail: String(cause) }) }
  }
  async function check() { if (available && !dirty && !busy && ticket?.workerUrl === workerUrl) await task(ticket).check() }
  function forget() {
    if (!ticket || !forgetAck || busy) return
    try { forgetCollectionTicket(window.localStorage, ticket); session.current?.detach(); setFeedback(null); setForgetAck(false); loadTicket() }
    catch (cause) { publish({ phase: 'failed', detail: String(cause) }) }
  }
  function select(job: LessonDeliveryJob) { if (jobs.length >= 20 || jobs.some(item => item.request.requestId === job.request.requestId)) return; setSelectionScope(workerScope); setSelected([...jobs, structuredClone(job)]) }
  return <>
    <CourseDeliveryLibraryPanel {...props} onSelectVerified={select} canSelectVerified={!busy && !ticket && !ticketError && jobs.length < 20} />
    <section className="card stack">
      <h3>{t('course.collection.heading')}</h3><p>{t('course.collection.help')}</p>
      {!available && <p>{t('course.collection.unavailable')}</p>}{dirty && <p>{t('course.saveFirst')}</p>}
      <ol>{jobs.map(job => <li key={job.request.requestId}>{job.request.export.courseLesson.lessonTitle} · <code>{job.request.requestId}</code> <button disabled={busy} onClick={() => { setSelectionScope(workerScope); setSelected(jobs.filter(item => item.request.requestId !== job.request.requestId)) }}>{t('course.collection.remove')}</button></li>)}</ol>
      <button disabled={!available || dirty || busy || !jobs.length || !!ticket || !!ticketError} onClick={prepare}>{t('course.collection.review')}</button>
      {visibleReview && <div><p>{t('course.collection.summary', { selected: visibleReview.lessons.length, total: visibleReview.course.lessonCount, bytes: visibleReview.totalMediaBytes, revision: visibleReview.course.outlineRevision, language: visibleReview.course.language })}</p>
        <ol>{visibleReview.lessons.map((lesson, index) => <li key={lesson.lessonId}>{lesson.moduleTitle} / {lesson.lessonTitle}<p>{t('course.collection.historical', visibleReview.historical[index])}</p><code>{lesson.sourceRequestId}</code></li>)}</ol>
        <label><input type="checkbox" checked={ack} disabled={busy || !!ticket} onChange={event => setAck(event.target.checked)} />{t('course.collection.ack')}</label>
        <button disabled={!available || dirty || busy || !ack || !!ticket || !!ticketError} onClick={start}>{t('course.collection.start')}</button>
      </div>}
      {ticketError && <div role="alert">{t('course.collection.failed')}<details><summary>{t('common.details')}</summary>{ticketError}</details></div>}
      {ticket && <div><p>{t('course.collection.pending', { id: ticket.request.requestId })}</p><code>{ticket.workerUrl}</code><p>{ticket.request.course.title} · {ticket.request.course.language} · {ticket.request.lessons.length} / {ticket.request.course.lessonCount}</p>
        <button disabled={!available || dirty || busy || ticket.workerUrl !== workerUrl} onClick={check}>{t('course.collection.check')}</button>
        <label><input type="checkbox" checked={forgetAck} disabled={busy} onChange={event => setForgetAck(event.target.checked)} />{t('course.collection.forgetAck')}</label><button disabled={busy || !forgetAck} onClick={forget}>{t('course.collection.forget')}</button>
      </div>}
      {reviewing && <p role="status">{t('course.collection.busy')}</p>}
      {shown && <div role={shown.phase === 'failed' || shown.phase === 'uncertain' || ['failed','interrupted','integrityFailed'].includes(shown.job?.state ?? '') ? 'alert' : 'status'}>
        {shown.job ? t(`course.collection.state.${shown.job.state}`) : t(shown.phase === 'checking' ? 'course.collection.busy' : shown.phase === 'uncertain' ? 'course.collection.uncertain' : 'course.collection.failed')}
        {shown.job?.completedLessons !== undefined && <p>{shown.job.completedLessons} / {shown.job.request.lessons.length}</p>}
        {(shown.detail || shown.job?.error) && <details><summary>{t('common.details')}</summary>{shown.detail || shown.job?.error}</details>}
        {shown.job?.result && <div><code>{shown.job.result.directory}</code><p>{shown.job.result.integrityCheckedAt} · {shown.job.result.totalMediaBytes}</p><ul>{shown.job.result.lessons.map(lesson => <li key={lesson.sourceRequestId}><code>{lesson.mediaPath}</code> · SHA-256: <code>{lesson.sha256}</code></li>)}</ul></div>}
      </div>}
    </section>
    <CourseCollectionLibraryPanel {...props} />
  </>
}
