import { useEffect, useState } from 'react'
import { projectCourse } from '../core/course'
import type { KinaouProject } from '../core/project'
import { CourseSubtitleError, courseSubtitleReviewIsCurrent, downloadReviewedCourseSubtitles, reviewCourseSubtitleExport, type CourseSubtitleReview } from '../core/courseSubtitleExport'
import { useUiLanguage } from './UiLanguageProvider'

export function CourseSubtitleExportPanel({ project, dirty }: { project: KinaouProject; dirty: boolean }) {
  const { t, language } = useUiLanguage()
  let lessons: Array<{ id: string; label: string }> = []
  try { lessons = projectCourse(project)?.modules.flatMap(module => module.lessons.map(lesson => ({ id: lesson.id, label: `${module.title} / ${lesson.title}` }))) ?? [] } catch { /* Review reports corrupt saved data without replacing it. */ }
  const [selected, setSelected] = useState(''), [review, setReview] = useState<CourseSubtitleReview | null>(null)
  const [ack, setAck] = useState(false), [page, setPage] = useState(0)
  const [feedback, setFeedback] = useState<{ project: KinaouProject; code: 'started' | 'failed' | CourseSubtitleError['code']; detail?: string } | null>(null)
  const current = !dirty && !!review && review.lessonId === selected && courseSubtitleReviewIsCurrent(project, review)
  useEffect(() => { setAck(false); setPage(0); setFeedback(null); if (dirty) setReview(null) }, [project, dirty, selected])
  function report(cause: unknown) { setFeedback({ project, code: cause instanceof CourseSubtitleError ? cause.code : 'failed', detail: cause instanceof CourseSubtitleError ? undefined : String(cause) }) }
  function inspect() {
    if (dirty) return
    setReview(null); setAck(false); setPage(0); setFeedback(null)
    try { setReview(reviewCourseSubtitleExport(project, selected)) } catch (cause) { report(cause) }
  }
  function download() {
    if (!current || !review || !ack) return
    try {
      const file = downloadReviewedCourseSubtitles(project, review)
      const url = URL.createObjectURL(new Blob([file.text], { type: file.mimeType })), link = document.createElement('a')
      try { link.href = url; link.download = file.filename; document.body.appendChild(link); link.click() }
      finally { link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000) }
      setFeedback({ project, code: 'started' })
    } catch (cause) { report(cause) }
  }
  const shown = feedback?.project === project && !dirty ? feedback : null
  const seconds = (value: number) => (value / 1000).toLocaleString(language, { maximumFractionDigits: 3 })
  return <section className="card stack">
    <h3>{t('course.subtitles.heading')}</h3><p>{t('course.subtitles.help')}</p><p>{t('course.subtitles.boundary')}</p>
    {dirty && <p>{t('course.saveFirst')}</p>}
    <label>{t('lessonExport.select')}<select value={lessons.some(lesson => lesson.id === selected) ? selected : ''} disabled={dirty} onChange={event => { setSelected(event.target.value); setReview(null); setAck(false); setFeedback(null) }}>
      <option value="">{t('lessonExport.none')}</option>{lessons.map(lesson => <option key={lesson.id} value={lesson.id}>{lesson.label}</option>)}
    </select></label>
    <button disabled={dirty || !lessons.some(lesson => lesson.id === selected)} onClick={inspect}>{t('course.subtitles.review')}</button>
    {review && <><p>{t('course.subtitles.summary', { lesson: review.lessonTitle, language: review.language, revision: review.revision, count: review.cues.length, duration: seconds(review.durationMs), clipped: review.clippedCues })}</p>
      <code>{review.filename}</code><ol start={page * 25 + 1}>{review.cues.slice(page * 25, (page + 1) * 25).map((cue, index) => <li key={page * 25 + index}><strong>{seconds(cue.startMs)}–{seconds(cue.endMs)} s</strong> <span style={{ whiteSpace: 'pre-wrap' }}>{cue.text}</span></li>)}</ol>
      {review.cues.length > 25 && <div><button disabled={page === 0} onClick={() => setPage(page - 1)}>{t('course.outputs.previous')}</button><button disabled={(page + 1) * 25 >= review.cues.length} onClick={() => setPage(page + 1)}>{t('course.outputs.next')}</button></div>}
      {!current && <p role="alert">{t('course.subtitles.stale')}</p>}
      <label><input type="checkbox" checked={ack && current} disabled={!current} onChange={event => setAck(event.target.checked)} />{t('course.subtitles.ack')}</label>
    </>}
    <button disabled={!current || !ack} onClick={download}>{t('course.subtitles.download')}</button>
    {shown && <div role={shown.code === 'started' ? 'status' : 'alert'}>{t(`course.subtitles.${shown.code}`)}{shown.detail && <details><summary>{t('common.details')}</summary>{shown.detail}</details>}</div>}
  </section>
}
