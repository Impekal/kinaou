import { useEffect, useRef, useState } from 'react'
import type { KinaouProject } from '../core/project'
import { LessonDeliverySession, forgetLessonDeliveryTicket, prepareLessonDelivery, readLessonDeliveryTicket, type DeliveryFeedback, type LessonDeliveryTicket } from '../core/courseLessonDelivery'
import { WorkerClient } from '../core/workerClient'
import type { CourseOutputWorkerProps } from './CourseOutputFileCheckPanel'
import { useUiLanguage } from './UiLanguageProvider'

export function CourseLessonDeliveryControl({ project, jobId, dirty, workerUrl = '', workerToken = '', workerConnected = false, workerCapabilities = [] }: CourseOutputWorkerProps & { project: KinaouProject; jobId: string; dirty: boolean }) {
  const { t } = useUiLanguage()
  const [storedTicket, setTicket] = useState<LessonDeliveryTicket | null>(null), [feedback, setFeedback] = useState<DeliveryFeedback | null>(null), [error, setError] = useState('')
  const [ack, setAck] = useState(false), [forgetAck, setForgetAck] = useState(false), [initializedId, setInitializedId] = useState(''), [feedbackScope, setFeedbackScope] = useState('')
  const ticket = storedTicket?.request.projectId === project.id ? storedTicket : null, initialized = initializedId === project.id
  const available = workerConnected && !!workerToken.trim() && workerCapabilities.includes('course-lesson-delivery')
  const signature = JSON.stringify([project, jobId, dirty, workerUrl, workerToken, available]), current = useRef(signature), session = useRef<LessonDeliverySession | null>(null), mounted = useRef(true), currentProjectId = useRef(project.id)
  currentProjectId.current = project.id
  if (current.current !== signature) { current.current = signature; session.current?.detach() }
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; session.current?.detach() } }, [])
  useEffect(() => { setAck(false); setForgetAck(false); setFeedback(null) }, [signature])
  useEffect(() => {
    try { setTicket(readLessonDeliveryTicket(window.localStorage, project.id)); setError('') } catch (cause) { setError(String(cause)) }
    setInitializedId(project.id)
  }, [project.id])
  function refreshTicket() { if (!mounted.current || currentProjectId.current !== project.id) return; try { setTicket(readLessonDeliveryTicket(window.localStorage, project.id)) } catch (cause) { setError(String(cause)) } }
  function createSession(value: LessonDeliveryTicket) {
    session.current?.detach()
    const baseline = current.current
    const task = new LessonDeliverySession(value, { storage: window.localStorage,
      current: () => mounted.current && current.current === baseline && session.current === task,
      client: new WorkerClient({ baseUrl: workerUrl, token: workerToken }),
      publish: next => { if (mounted.current && session.current === task) { setFeedbackScope(baseline); setFeedback(next); refreshTicket() } }
    }); session.current = task; return task
  }
  async function start() {
    if (!available || !initialized || dirty || !ack || !jobId || ticket || error || feedback?.phase === 'checking') return
    try {
      const request = prepareLessonDelivery(project, jobId, ack), next = { schemaVersion: 1 as const, workerUrl, request }
      await createSession(next).start(); refreshTicket()
    } catch (cause) { setError(String(cause)); refreshTicket() }
  }
  async function check() {
    if (!ticket || !available || ticket.workerUrl !== workerUrl || feedback?.phase === 'checking') return
    try { await createSession(ticket).check() } catch (cause) { setError(String(cause)) }
  }
  function forget() {
    if (!ticket || !forgetAck || feedback?.phase === 'checking') return
    try { forgetLessonDeliveryTicket(window.localStorage, ticket); session.current?.detach(); setTicket(null); setFeedback(null); setForgetAck(false); setAck(false); setError('') } catch (cause) { setError(String(cause)) }
  }
  const shown = feedbackScope === signature ? feedback : null, job = shown?.job, result = job?.result
  return <section className="stack">
    <h4>{t('course.delivery.heading')}</h4><p>{t('course.delivery.help')}</p><p>{t('course.delivery.boundary')}</p>
    {!available && <p>{t('course.delivery.unavailable')}</p>}
    {error && <div role="alert">{t('course.delivery.storageError')}<details><summary>{t('common.details')}</summary>{error}</details></div>}
    {!ticket && <><label><input type="checkbox" checked={ack} disabled={dirty || !initialized || !!error} onChange={event => setAck(event.target.checked)}/>{t('course.delivery.ack')}</label>
      <button disabled={!available || !initialized || dirty || !jobId || !ack || !!error || feedback?.phase === 'checking'} onClick={start}>{t('course.delivery.start')}</button></>}
    {ticket && <div>
      <p>{t('course.delivery.retained', { lesson: ticket.request.export.courseLesson.lessonTitle, id: ticket.request.requestId })}</p><code>{ticket.request.export.outputRelativePath}</code>
      <p>{t('course.delivery.recovery')}</p>{ticket.workerUrl !== workerUrl && <p>{t('course.delivery.connection', { url: ticket.workerUrl })}</p>}
      <button disabled={!available || ticket.workerUrl !== workerUrl || feedback?.phase === 'checking'} onClick={check}>{t('course.delivery.check')}</button>
      <label><input type="checkbox" checked={forgetAck} disabled={feedback?.phase === 'checking'} onChange={event => setForgetAck(event.target.checked)}/>{t('course.delivery.forgetAck')}</label>
      <button disabled={!forgetAck || feedback?.phase === 'checking'} onClick={forget}>{t('course.delivery.forget')}</button>
    </div>}
    {shown && <div role={shown.phase === 'failed' || shown.phase === 'uncertain' || (job && ['failed','integrityFailed','interrupted','unknown'].includes(job.state)) ? 'alert' : 'status'}>
      {t(job ? `course.delivery.state.${job.state}` : `course.delivery.${shown.phase === 'job' ? 'uncertain' : shown.phase}`)}
      {(shown.detail || job?.error) && <details><summary>{t('common.details')}</summary>{shown.detail || job?.error}</details>}
    </div>}
    {job?.totalBytes !== undefined && <p>{t('course.delivery.progress', { copied: job.copiedBytes ?? 0, total: job.totalBytes })}</p>}
    {result && <div><p>{t('course.delivery.result')}</p><code>{result.directory}</code><p>SHA-256: <code>{result.sha256}</code></p><p>{t('course.delivery.checked', { time: result.integrityCheckedAt, size: result.sizeBytes })}</p></div>}
  </section>
}
