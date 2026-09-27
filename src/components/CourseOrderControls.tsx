import { useState } from 'react'
import type { CourseOutline } from '../core/course'
import { useUiLanguage } from './UiLanguageProvider'

export function CourseModuleOrderControls({ index, count, onMove }: { index: number; count: number; onMove: (index: number) => void }) {
  const { t } = useUiLanguage()
  return <div className="directorActions"><button className="secondaryButton" disabled={index <= 0} onClick={() => onMove(index - 1)}>{t('course.order.moduleUp')}</button><button className="secondaryButton" disabled={index >= count - 1} onClick={() => onMove(index + 1)}>{t('course.order.moduleDown')}</button></div>
}
export function CourseLessonOrderControls({ draft, moduleId, lessonId, onMove }: { draft: CourseOutline; moduleId: string; lessonId: string; onMove: (moduleId: string, index: number) => void }) {
  const { t } = useUiLanguage(), [targetId, setTargetId] = useState('')
  const module = draft.modules.find(item => item.id === moduleId), index = module?.lessons.findIndex(lesson => lesson.id === lessonId) ?? -1
  const targets = draft.modules.filter(item => item.id !== moduleId), target = targets.find(item => item.id === targetId)
  const canTransfer = !!target && target.lessons.length < 100
  if (!module || index < 0) return null
  return <div className="stack">
    <div className="directorActions"><button className="secondaryButton" disabled={index === 0} onClick={() => onMove(moduleId, index - 1)}>{t('course.order.lessonUp')}</button><button className="secondaryButton" disabled={index === module.lessons.length - 1} onClick={() => onMove(moduleId, index + 1)}>{t('course.order.lessonDown')}</button></div>
    {!!targets.length && <div className="formRow"><label>{t('course.order.destination')}<select value={target?.id ?? ''} onChange={event => setTargetId(event.target.value)}><option value="">{t('course.order.choose')}</option>{targets.map(item => <option key={item.id} value={item.id} disabled={item.lessons.length >= 100}>{item.title || item.id} · {item.lessons.length}/100</option>)}</select></label>
      <button className="secondaryButton" disabled={!canTransfer} onClick={() => { if (canTransfer && target) onMove(target.id, target.lessons.length) }}>{t('course.order.transfer')}</button>
    </div>}
  </div>
}
