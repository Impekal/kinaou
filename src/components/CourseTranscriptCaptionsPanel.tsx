import { useEffect, useState } from 'react'
import type { KinaouProject } from '../core/project'
import type { PersistentVersionHistory } from '../core/versioning'
import { isCourseTranscript } from '../core/transcripts'
import { applyCourseTranscriptCaptions, courseCaptionReviewIsCurrent, CourseCaptionError, reviewCourseTranscriptCaptions, type CourseCaptionReview } from '../core/courseTranscriptCaptions'
import { useUiLanguage } from './UiLanguageProvider'

export function CourseTranscriptCaptionsPanel({ project, history, onProjectChange }: {
  project: KinaouProject; history: PersistentVersionHistory; onProjectChange: (next: KinaouProject) => void
}) {
  const { t, language } = useUiLanguage()
  const transcripts = project.assets.filter(asset => isCourseTranscript(project, asset))
  const [selected, setSelected] = useState(''), [review, setReview] = useState<CourseCaptionReview | null>(null)
  const [ack, setAck] = useState(false), [page, setPage] = useState(0)
  const [feedback, setFeedback] = useState<{ project: KinaouProject; code: 'saved' | 'failed' | CourseCaptionError['code']; detail?: string } | null>(null)
  const current = !!review && selected === review.transcriptId && courseCaptionReviewIsCurrent(project, review)
  useEffect(() => { setAck(false); setPage(0) }, [project, selected])
  function report(cause: unknown) { setFeedback({ project, code: cause instanceof CourseCaptionError ? cause.code : 'failed', detail: cause instanceof CourseCaptionError ? undefined : String(cause) }) }
  function inspect() {
    setReview(null); setAck(false); setPage(0); setFeedback(null)
    try { setReview(reviewCourseTranscriptCaptions(project, selected)) } catch (cause) { report(cause) }
  }
  function apply() {
    if (!current || !review || !ack) return
    try {
      const next = applyCourseTranscriptCaptions(project, review)
      history.snapshot(project, 'Before lesson transcript captions', 'system')
      onProjectChange(next); setReview(null); setAck(false); setFeedback({ project: next, code: 'saved' })
    } catch (cause) { report(cause) }
  }
  const seconds = (value: number) => (value / 1000).toLocaleString(language, { maximumFractionDigits: 3 })
  const shown = feedback?.project === project ? feedback : null
  return <details className="stack">
    <summary>{t('course.captions.heading')}</summary><p>{t('course.captions.help')}</p><p>{t('course.captions.boundary')}</p>
    {!transcripts.length && <p>{t('course.captions.empty')}</p>}
    <label>{t('course.captions.select')}<select value={transcripts.some(asset => asset.id === selected) ? selected : ''} onChange={event => { setSelected(event.target.value); setReview(null); setAck(false); setFeedback(null) }}>
      <option value="">{t('course.captions.choose')}</option>{transcripts.map(asset => <option key={asset.id} value={asset.id}>{String(asset.metadata.name ?? asset.id)}</option>)}
    </select></label>
    <button disabled={!transcripts.some(asset => asset.id === selected)} onClick={inspect}>{t('course.captions.review')}</button>
    {review && <><p>{t('course.captions.summary', { lesson: review.lessonTitle, language: review.language, count: review.segments.length })}</p>
      <ol start={page * 25 + 1}>{review.segments.slice(page * 25, (page + 1) * 25).map(segment => <li key={segment.index}><strong>{seconds(segment.startMs)}–{seconds(segment.startMs + segment.durationMs)} s</strong> {segment.text}</li>)}</ol>
      {review.segments.length > 25 && <div><button disabled={page === 0} onClick={() => setPage(page - 1)}>{t('course.outputs.previous')}</button><button disabled={(page + 1) * 25 >= review.segments.length} onClick={() => setPage(page + 1)}>{t('course.outputs.next')}</button></div>}
      {!current && <p role="alert">{t('course.captions.stale')}</p>}
      <label><input type="checkbox" checked={ack && current} disabled={!current} onChange={event => setAck(event.target.checked)} />{t('course.captions.ack')}</label>
    </>}
    <button disabled={!current || !ack} onClick={apply}>{t('course.captions.apply')}</button>
    {shown && <div role={shown.code === 'saved' ? 'status' : 'alert'}>{t(`course.captions.${shown.code}`)}{shown.detail && <details><summary>{t('common.details')}</summary>{shown.detail}</details>}</div>}
  </details>
}
