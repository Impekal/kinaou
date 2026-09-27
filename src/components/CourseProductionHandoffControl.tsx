import { useEffect, useRef, useState } from 'react'
import type { KinaouProject } from '../core/project'
import { resolveCourseProductionHandoff, type CourseProductionHandoff, type CourseProductionTarget } from '../core/courseProductionHandoff'
import { useUiLanguage } from './UiLanguageProvider'

export function CourseProductionHandoffControl({ project, handoff, target, disabled, onApply }: { project: KinaouProject; handoff: CourseProductionHandoff; target: CourseProductionTarget; disabled: boolean; onApply: (lessonId: string) => void }) {
  const { t } = useUiLanguage()
  const [applied, setApplied] = useState<CourseProductionHandoff | null>(null), [error, setError] = useState('')
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => { root.current?.focus(); setError('') }, [handoff])
  let stale = false
  try { resolveCourseProductionHandoff(project, handoff, target) } catch { stale = true }
  function apply() {
    if (disabled || applied === handoff) return
    setError('')
    try { const lesson = resolveCourseProductionHandoff(project, handoff, target); onApply(lesson.id); setApplied(handoff) }
    catch (cause) { setError(String(cause)) }
  }
  return <div className="card note stack" ref={root} tabIndex={-1} aria-label={t('course.handoff.received')}>
    <h3>{t('course.handoff.received')}</h3><strong>{handoff.label}</strong>
    <p>{t('course.handoff.context', { revision: handoff.revision, language: handoff.language })}</p>
    {stale ? <p role="alert">{t('course.handoff.stale')}</p> : applied === handoff ? <p role="status">{t('course.handoff.applied')}</p> : <><p>{t(target === 'narration' ? 'course.handoff.narrationReview' : 'course.handoff.exportReview')}</p><button disabled={disabled} onClick={apply}>{t(target === 'narration' ? 'course.handoff.applyNarration' : 'course.handoff.applyExport')}</button></>}
    {error && <div role="alert">{t('course.handoff.failed')}<details><summary>{t('common.details')}</summary>{error}</details></div>}
  </div>
}
