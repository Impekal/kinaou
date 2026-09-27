import { useEffect, useRef, useState } from 'react'
import { projectCourse } from '../core/course'
import { clearCourseInstructorReviews, courseInstructorChecks, courseInstructorInputSchema, courseInstructorReviewState, courseInstructorSignature, CourseInstructorReviewSession, projectCourseInstructorReviews } from '../core/courseInstructorReview'
import type { KinaouProject } from '../core/project'
import type { PersistentVersionHistory } from '../core/versioning'
import { useUiLanguage } from './UiLanguageProvider'

export function CourseInstructorReviewPanel({ project, dirty, history, onProjectChange }: {
  project: KinaouProject; dirty: boolean; history: PersistentVersionHistory; onProjectChange: (next: KinaouProject) => void
}) {
  const { t } = useUiLanguage()
  const [lessonId, setLessonId] = useState('')
  const [reviewer, setReviewer] = useState('')
  const [notes, setNotes] = useState('')
  const [checks, setChecks] = useState({ accuracy: false, demonstrations: false, exercises: false })
  const [busy, setBusy] = useState(false)
  const [withdrawalProject, setWithdrawalProject] = useState<KinaouProject | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState<'course.review.saved' | 'course.review.cleared' | 'course.review.changed' | null>(null)
  const [snapshot, setSnapshot] = useState<{ project: KinaouProject; signature?: string; error?: string } | null>(null)
  const session = useRef(new CourseInstructorReviewSession())
  const mounted = useRef(true)
  if (dirty) session.current.detach()
  else session.current.bind(project)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; session.current.detach() } }, [])
  useEffect(() => { setChecks({ accuracy: false, demonstrations: false, exercises: false }); setWithdrawalProject(null) }, [project, dirty])
  let course: ReturnType<typeof projectCourse> = null
  let records: ReturnType<typeof projectCourseInstructorReviews> = []
  let loadError = ''
  try { course = projectCourse(project); records = projectCourseInstructorReviews(project) } catch (cause) { loadError = String(cause) }
  useEffect(() => {
    let active = true
    if (!course || loadError) return
    courseInstructorSignature(project).then(signature => { if (active) setSnapshot({ project, signature }) }, cause => { if (active) setSnapshot({ project, error: String(cause) }) })
    return () => { active = false }
  }, [project, Boolean(course), loadError])
  const choices = course?.modules.flatMap(module => module.lessons.map(lesson => ({ id: lesson.id, label: module.title + ' / ' + lesson.title }))) ?? []
  const selected = choices.some(lesson => lesson.id === lessonId)
  const signature = snapshot?.project === project ? snapshot.signature : undefined
  const snapshotError = snapshot?.project === project ? snapshot.error : undefined
  const record = records.find(entry => entry.courseId === course?.id && entry.lessonId === lessonId)
  const state = selected && signature && !loadError ? courseInstructorReviewState(project, lessonId, signature) : null
  const input = courseInstructorInputSchema.safeParse({ reviewer, notes, checks })
  function persist(next: KinaouProject) {
    history.snapshot(project, 'Before changing course instructor review', 'system')
    onProjectChange(next)
  }
  async function save() {
    if (dirty || busy || !selected || !input.success || !signature || loadError) return
    setBusy(true); setError(''); setMessage(null); setWithdrawalProject(null)
    try {
      const applied = await session.current.record(project, lessonId, input.data, persist)
      if (mounted.current) {
        setMessage(applied ? 'course.review.saved' : 'course.review.changed')
        if (applied) { setChecks({ accuracy: false, demonstrations: false, exercises: false }); setNotes('') }
      }
    } catch (cause) { if (mounted.current) setError(String(cause)) }
    finally { if (mounted.current) setBusy(false) }
  }
  function clear() {
    if (dirty || busy || loadError || withdrawalProject !== project) return
    setError(''); setMessage(null); setWithdrawalProject(null)
    try { session.current.detach(); const next = clearCourseInstructorReviews(project); if (next !== project) persist(next); setMessage('course.review.cleared') }
    catch (cause) { setError(String(cause)) }
  }
  return <section className="card stack">
    <h3>{t('course.review.heading')}</h3><p>{t('course.review.help')}</p>
    {dirty && <p>{t('course.review.draft')}</p>}
    <label>{t('course.review.lesson')}<select value={selected ? lessonId : ''} disabled={busy || dirty || Boolean(loadError)} onChange={event => { setLessonId(event.target.value); setChecks({ accuracy: false, demonstrations: false, exercises: false }); setNotes(''); setMessage(null) }}>
      <option value="">{t('course.review.choose')}</option>{choices.map(lesson => <option key={lesson.id} value={lesson.id}>{lesson.label}</option>)}
    </select></label>
    {selected && !loadError && !snapshotError && <p role="status">{t(state ? `course.review.${state}` : 'course.review.checking')}</p>}
    {record && <small>{record.reviewer} · {record.reviewedAt}<br />{record.notes}</small>}
    <label>{t('course.review.reviewer')}<input disabled={busy} maxLength={120} value={reviewer} onChange={event => setReviewer(event.target.value)} /></label>
    <label>{t('course.review.notes')}<textarea disabled={busy} maxLength={4000} value={notes} onChange={event => setNotes(event.target.value)} /></label>
    {courseInstructorChecks.map(check => <label key={check}><input type="checkbox" disabled={busy} checked={checks[check]} onChange={event => setChecks({ ...checks, [check]: event.target.checked })} />{t(`course.review.${check}`)}</label>)}
    <div className="directorActions">
      <button disabled={dirty || busy || !selected || !input.success || !signature || Boolean(loadError)} onClick={() => void save()}>{t('course.review.record')}</button>
      <button className="secondaryButton" disabled={dirty || busy || !records.length || Boolean(loadError)} onClick={() => setWithdrawalProject(project)}>{t('course.review.clear')}</button>
    </div>
    {withdrawalProject === project && !dirty && <div role="alertdialog" aria-label={t('course.review.clearConfirm')} className="stack">
      <p>{t('course.review.clearConfirm')}</p>
      <div className="directorActions"><button disabled={busy} onClick={clear}>{t('course.review.confirmWithdrawal')}</button><button disabled={busy} onClick={() => setWithdrawalProject(null)}>{t('course.review.cancel')}</button></div>
    </div>}
    {(loadError || snapshotError || error) && <div className="errorBox" role="alert">{t('course.review.failed')}<details><summary>{t('common.details')}</summary>{loadError || snapshotError || error}</details></div>}
    {message && <p role="status">{t(message)}</p>}
  </section>
}
