import { useEffect, useRef, useState } from 'react'
import type { KinaouProject } from '../core/project'
import { LessonDeliverySession, forgetLessonDeliveryTicket, prepareLessonDelivery, readLessonDeliveryTicket, type DeliveryFeedback, type LessonDeliveryTicket } from '../core/courseLessonDelivery'
import { WorkerClient } from '../core/workerClient'
import type { CourseOutputWorkerProps } from './CourseOutputFileCheckPanel'
import { useUiLanguage } from './UiLanguageProvider'
import { reviewCourseDeliveryMaterials, useReviewedCourseDeliveryMaterials, type CourseDeliveryMaterialReview } from '../core/courseDeliveryMaterials'

export function CourseLessonDeliveryControl({ project, jobId, dirty, workerUrl = '', workerToken = '', workerConnected = false, workerCapabilities = [] }: CourseOutputWorkerProps & { project: KinaouProject; jobId: string; dirty: boolean }) {
  const { t } = useUiLanguage()
  const [storedTicket, setTicket] = useState<LessonDeliveryTicket | null>(null), [feedback, setFeedback] = useState<DeliveryFeedback | null>(null), [error, setError] = useState('')
  const [ack, setAck] = useState(false), [forgetAck, setForgetAck] = useState(false), [initializedId, setInitializedId] = useState(''), [feedbackScope, setFeedbackScope] = useState('')
  const [includeMaterials, setIncludeMaterials] = useState(false), [materialReview, setMaterialReview] = useState<CourseDeliveryMaterialReview | null>(null), [materialAck, setMaterialAck] = useState(false), [materialError, setMaterialError] = useState(''), [preparing, setPreparing] = useState(false)
  const reviewSequence = useRef(0), materialScope = useRef('')
  const ticket = storedTicket?.request.projectId === project.id ? storedTicket : null, initialized = initializedId === project.id
  const available = workerConnected && !!workerToken.trim() && workerCapabilities.includes('course-lesson-delivery')
  const supportsMaterials = workerCapabilities.includes('course-delivery-materials')
  const signature = JSON.stringify([project, jobId, dirty, workerUrl, workerToken, available, supportsMaterials]), current = useRef(signature), session = useRef<LessonDeliverySession | null>(null), mounted = useRef(true), currentProjectId = useRef(project.id)
  currentProjectId.current = project.id
  const currentMaterialReview = materialScope.current === signature ? materialReview : null
  if (current.current !== signature) { current.current = signature; session.current?.detach(); reviewSequence.current++ }
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; session.current?.detach() } }, [])
  useEffect(() => { setAck(false); setForgetAck(false); setFeedback(null); setMaterialReview(null); setMaterialAck(false); setMaterialError(''); setPreparing(false) }, [signature])
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
    if (!available || !initialized || dirty || !ack || !jobId || ticket || error || preparing || feedback?.phase === 'checking' || (includeMaterials && (!supportsMaterials || !currentMaterialReview || !materialAck))) return
    let request
    try {
      request = prepareLessonDelivery(project, jobId, ack)
      if (includeMaterials) request = useReviewedCourseDeliveryMaterials(project, currentMaterialReview!, request, materialAck)
    } catch (cause) { setMaterialError(String(cause)); return }
    try {
      const next = { schemaVersion: 1 as const, workerUrl, request }
      await createSession(next).start(); refreshTicket()
    } catch (cause) { setError(String(cause)); refreshTicket() }
  }
  async function check() {
    if (!ticket || !available || ticket.workerUrl !== workerUrl || feedback?.phase === 'checking' || (ticket.request.materials && !supportsMaterials)) return
    try { await createSession(ticket).check() } catch (cause) { setError(String(cause)) }
  }
  function forget() {
    if (!ticket || !forgetAck || feedback?.phase === 'checking') return
    try { forgetLessonDeliveryTicket(window.localStorage, ticket); session.current?.detach(); setTicket(null); setFeedback(null); setForgetAck(false); setAck(false); setError('') } catch (cause) { setError(String(cause)) }
  }
  async function prepareMaterials() {
    if (!includeMaterials || dirty || !jobId || preparing || ticket) return
    const sequence = ++reviewSequence.current, baseline = current.current
    setPreparing(true); setMaterialError(''); setMaterialReview(null); setMaterialAck(false)
    try {
      const review = await reviewCourseDeliveryMaterials(project, jobId)
      if (mounted.current && sequence === reviewSequence.current && baseline === current.current) { materialScope.current = baseline; setMaterialReview(review) }
    } catch (cause) { if (mounted.current && sequence === reviewSequence.current && baseline === current.current) setMaterialError(String(cause)) }
    finally { if (mounted.current && sequence === reviewSequence.current) setPreparing(false) }
  }
  const shown = feedbackScope === signature ? feedback : null, job = shown?.job, result = job?.result
  return <section className="stack">
    <h4>{t('course.delivery.heading')}</h4><p>{t('course.delivery.help')}</p><p>{t(includeMaterials || ticket?.request.materials ? 'course.delivery.materials.boundary' : 'course.delivery.boundary')}</p>
    {!available && <p>{t('course.delivery.unavailable')}</p>}
    {error && <div role="alert">{t('course.delivery.storageError')}<details><summary>{t('common.details')}</summary>{error}</details></div>}
    {!ticket && <>
      <label><input type="checkbox" checked={includeMaterials} disabled={dirty || !initialized || !!error || !supportsMaterials} onChange={event => { setIncludeMaterials(event.target.checked); reviewSequence.current++; setMaterialReview(null); setMaterialAck(false); setAck(false); setPreparing(false); setMaterialError('') }}/>{t('course.delivery.materials.include')}</label>
      {!supportsMaterials && <p>{t('course.delivery.materials.unavailable')}</p>}
      {includeMaterials && <div>
        <p>{t('course.delivery.materials.help')}</p><button disabled={dirty || !jobId || preparing} onClick={prepareMaterials}>{t(preparing ? 'course.delivery.materials.preparing' : 'course.delivery.materials.prepare')}</button>
        {materialError && <div role="alert">{t('course.delivery.materials.failed')}<details><summary>{t('common.details')}</summary>{materialError}</details></div>}
        {currentMaterialReview && <><p>{t('course.delivery.materials.revisions', { video: currentMaterialReview.exportRevision, text: currentMaterialReview.source.context.outlineRevision, count: currentMaterialReview.files.length, bytes: currentMaterialReview.bytes })}</p>
          {currentMaterialReview.files.map(file => <details key={file.path}><summary>{file.path} · {t(file.path.startsWith('learner/') ? 'course.delivery.materials.learner' : 'course.delivery.materials.instructor')}</summary><pre style={{ whiteSpace: 'pre-wrap', maxHeight: 240, overflow: 'auto' }}>{file.text}</pre></details>)}</>}
        <label><input type="checkbox" checked={!!currentMaterialReview && materialAck} disabled={!currentMaterialReview || dirty || preparing} onChange={event => setMaterialAck(event.target.checked)}/>{t('course.delivery.materials.ack')}</label>
      </div>}
      {!includeMaterials && materialError && <div role="alert">{materialError}</div>}
      <label><input type="checkbox" checked={ack} disabled={dirty || !initialized || !!error || preparing} onChange={event => setAck(event.target.checked)}/>{t('course.delivery.ack')}</label>
      <button disabled={!available || !initialized || dirty || !jobId || !ack || !!error || preparing || feedback?.phase === 'checking' || (includeMaterials && (!supportsMaterials || !currentMaterialReview || !materialAck))} onClick={start}>{t('course.delivery.start')}</button></>}
    {ticket && <div>
      <p>{t('course.delivery.retained', { lesson: ticket.request.export.courseLesson.lessonTitle, id: ticket.request.requestId })}</p><code>{ticket.request.export.outputRelativePath}</code>
      <p>{t('course.delivery.recovery')}</p>{ticket.workerUrl !== workerUrl && <p>{t('course.delivery.connection', { url: ticket.workerUrl })}</p>}
      {ticket.request.materials && !supportsMaterials && <p>{t('course.delivery.materials.unavailable')}</p>}
      <button disabled={!available || ticket.workerUrl !== workerUrl || feedback?.phase === 'checking' || (!!ticket.request.materials && !supportsMaterials)} onClick={check}>{t('course.delivery.check')}</button>
      <label><input type="checkbox" checked={forgetAck} disabled={feedback?.phase === 'checking'} onChange={event => setForgetAck(event.target.checked)}/>{t('course.delivery.forgetAck')}</label>
      <button disabled={!forgetAck || feedback?.phase === 'checking'} onClick={forget}>{t('course.delivery.forget')}</button>
    </div>}
    {shown && <div role={shown.phase === 'failed' || shown.phase === 'uncertain' || (job && ['failed','integrityFailed','interrupted','unknown'].includes(job.state)) ? 'alert' : 'status'}>
      {t(job ? `course.delivery.state.${job.state}` : `course.delivery.${shown.phase === 'job' ? 'uncertain' : shown.phase}`)}
      {(shown.detail || job?.error) && <details><summary>{t('common.details')}</summary>{shown.detail || job?.error}</details>}
    </div>}
    {job?.totalBytes !== undefined && <p>{t('course.delivery.progress', { copied: job.copiedBytes ?? 0, total: job.totalBytes })}</p>}
    {result && <div><p>{t('course.delivery.result')}</p><code>{result.directory}</code><p>SHA-256: <code>{result.sha256}</code></p><p>{t('course.delivery.checked', { time: result.integrityCheckedAt, size: result.sizeBytes })}</p>{result.files && <ul>{result.files.map(file => <li key={file.path}><code>{file.path}</code> · {file.sizeBytes} · SHA-256: <code>{file.sha256}</code></li>)}</ul>}</div>}
  </section>
}
