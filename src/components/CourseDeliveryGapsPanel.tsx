import { useEffect, useMemo, useState } from 'react'
import { lessonDeliveryStatus, summarizeCourseDelivery, type CourseReviewState } from '../core/courseDeliveryGaps'
import { courseInstructorReviewState, courseInstructorSignature } from '../core/courseInstructorReview'
import { courseProductionOverview } from '../core/courseProductionOverview'
import type { KinaouProject } from '../core/project'
import { useUiLanguage } from './UiLanguageProvider'

interface Props { project: KinaouProject; dirty: boolean; onEditLesson: (moduleId: string, lessonId: string) => void }

/** Read-only. It lists what is countably open and starts nothing. */
export function CourseDeliveryGapsPanel({ project, dirty, onEditLesson }: Props) {
  const { t } = useUiLanguage()
  const [page, setPage] = useState(0)
  const [signature, setSignature] = useState<{ project: KinaouProject; value: string } | null>(null)
  const overview = useMemo(() => { try { return { rows: courseProductionOverview(project), failed: false } } catch { return { rows: [], failed: true } } }, [project])
  useEffect(() => {
    let active = true
    setSignature(null)
    if (overview.rows.length) courseInstructorSignature(project).then(value => { if (active) setSignature({ project, value }) }, () => { /* stays unknown, which counts as open */ })
    return () => { active = false }
  }, [project, overview.rows.length])
  useEffect(() => setPage(0), [project])

  const statuses = useMemo(() => overview.rows.map(row => {
    let review: CourseReviewState = 'unknown'
    if (signature?.project === project) { try { review = courseInstructorReviewState(project, row.lessonId, signature.value) } catch { review = 'unknown' } }
    return lessonDeliveryStatus(row, review)
  }), [overview.rows, signature, project])
  const summary = summarizeCourseDelivery(statuses)
  const last = Math.max(0, Math.ceil(statuses.length / 10) - 1), current = Math.min(page, last)

  return <section className="card stack courseDeliveryGaps">
    <h3>{t('course.gaps.heading')}</h3><p>{t('course.gaps.help')}</p><p className="note">{t('course.gaps.boundary')}</p>
    {dirty && <p role="status">{t('course.gaps.dirty')}</p>}
    {overview.failed && <div className="errorBox" role="alert">{t('course.gaps.error')}</div>}
    {!overview.failed && !statuses.length && <p>{t('course.gaps.empty')}</p>}
    {statuses.length > 0 && <>
      <p role="status"><strong>{t('course.gaps.summary', { clear: summary.clear, lessons: summary.lessons, open: summary.open })}</strong></p>
      {summary.byItem.length > 0 && <ul>{summary.byItem.map(entry => <li key={entry.item}>{t('course.gaps.byItem', { item: t(`course.gaps.item.${entry.item}`), lessons: entry.lessons })}</li>)}</ul>}
      {statuses.slice(current * 10, current * 10 + 10).map(status => <div className="assetRow" key={status.lessonId}>
        <div>
          <strong>{status.label}</strong>
          {status.next ? <small>{t('course.gaps.next', { item: t(`course.gaps.item.${status.next}`) })}</small> : <small>{t('course.gaps.clear')}</small>}
          {status.gaps.length > 0 && <ul>{status.gaps.map(gap => <li key={gap.item}>{t(`course.gaps.detail.${gap.item}`, { count: gap.count })}</li>)}</ul>}
          <div className="directorActions"><button className="secondaryButton" disabled={dirty} onClick={() => onEditLesson(status.moduleId, status.lessonId)}>{t('course.gaps.edit')}</button></div>
        </div>
        <span className={status.gaps.length ? 'badge offline' : 'badge'}>{status.gaps.length ? t('course.gaps.badge.open', { count: status.gaps.length }) : t('course.gaps.badge.clear')}</span>
      </div>)}
      {last > 0 && <div className="directorActions"><button className="secondaryButton" disabled={!current} onClick={() => setPage(current - 1)}>{t('course.gaps.previous')}</button><span>{current * 10 + 1}–{Math.min((current + 1) * 10, statuses.length)} / {statuses.length}</span><button className="secondaryButton" disabled={current >= last} onClick={() => setPage(current + 1)}>{t('course.gaps.following')}</button></div>}
    </>}
  </section>
}
