import { useRef, useState } from 'react'
import type { KinaouAsset, KinaouProject } from '../core/project'
import type { PersistentVersionHistory } from '../core/versioning'
import { commitCourseNarrationPlacement, courseNarrationPlacementIsCurrent, CourseNarrationPlacementError, invalidateCourseNarrationPlacement, reviewCourseNarrationPlacement, type CourseNarrationPlacementReview } from '../core/courseNarrationPlacement'
import { CourseNarrationRangeControl } from './CourseNarrationRangeControl'
import { displayTrackName } from '../core/uiSystemLabels'
import { useUiLanguage } from './UiLanguageProvider'

export function CourseNarrationPlacementControl({ project, asset, history, onProjectChange, disabled = false }: {
  project: KinaouProject; asset: KinaouAsset; history: PersistentVersionHistory
  onProjectChange: (next: KinaouProject) => void; disabled?: boolean
}) {
  const { t, language } = useUiLanguage()
  const tracks = project.tracks.filter(track => ['voice', 'dialog'].includes(track.type) && !track.locked && !track.muted)
  const [target, setTarget] = useState(() => tracks[0]?.id ?? '')
  const [review, setReview] = useState<CourseNarrationPlacementReview | null>(null)
  const [feedback, setFeedback] = useState<{ project: KinaouProject; code: 'saved' | 'failed' | CourseNarrationPlacementError['code']; detail?: string } | null>(null)
  const scope = JSON.stringify([asset.id, target, language, disabled]), previous = useRef(scope)
  if (previous.current !== scope) { if (review) invalidateCourseNarrationPlacement(review); previous.current = scope }
  const current = !!review && courseNarrationPlacementIsCurrent(project, review)
  const shown = feedback?.project === project ? feedback : null
  function report(cause: unknown) { setFeedback({ project, code: cause instanceof CourseNarrationPlacementError ? cause.code : 'failed', detail: cause instanceof CourseNarrationPlacementError ? undefined : String(cause) }) }
  function inspect() {
    if (disabled) return
    setFeedback(null); setReview(null)
    try { setReview(reviewCourseNarrationPlacement(project, asset.id, target || null)) } catch (cause) { report(cause) }
  }
  function apply() {
    if (disabled || !review || !current) return
    try {
      const next = commitCourseNarrationPlacement(project, review, { snapshot: value => { history.snapshot(value, 'Before placing lesson narration', 'system') }, persist: onProjectChange })
      setReview(null); setFeedback({ project: next, code: 'saved' })
    } catch (cause) { report(cause) }
  }
  const seconds = (value: number) => (value / 1000).toLocaleString(language, { maximumFractionDigits: 3 })
  return <details className="stack courseNarrationControl">
    <summary>{t('course.voicePlace.heading')}</summary>
    <p>{t('course.voicePlace.help')}</p>
    <CourseNarrationRangeControl project={project} asset={asset} history={history} onProjectChange={onProjectChange} disabled={disabled} />
    <label>{t('course.voicePlace.track')}<select value={target} disabled={disabled} onChange={event => { setTarget(event.target.value); setReview(null); setFeedback(null) }}>
      <option value="">{t('course.voicePlace.newTrack')}</option>
      {target && !tracks.some(track => track.id === target) && <option value={target} disabled>{t('course.voicePlace.trackError')}</option>}
      {tracks.map(track => <option key={track.id} value={track.id}>{displayTrackName(track, t)}</option>)}
    </select></label>
    <button className="secondaryButton" disabled={disabled} onClick={inspect}>{t('course.voicePlace.review')}</button>
    {review && <p>{t('course.voicePlace.summary', { lesson: review.lessonTitle, start: seconds(review.startMs), end: seconds(review.endMs), duration: seconds(review.durationMs), remaining: seconds(review.remainingMs), source: review.sourceRevision, current: review.currentRevision })}</p>}
    {review && !current && <p role="alert">{t('course.voicePlace.stale')}</p>}
    <button className="secondaryButton" disabled={disabled || !current} onClick={apply}>{t('course.voicePlace.apply')}</button>
    {shown && <div role={shown.code === 'saved' ? 'status' : 'alert'}>{t(`course.voicePlace.${shown.code === 'track' ? 'trackError' : shown.code}`)}{shown.detail && <details><summary>{t('common.details')}</summary>{shown.detail}</details>}</div>}
  </details>
}
