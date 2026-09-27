import { useState } from 'react'
import type { KinaouProject } from '../core/project'
import { courseProductionChoices, createCourseProductionHandoff, type CourseProductionHandoff, type CourseProductionTarget } from '../core/courseProductionHandoff'
import { useUiLanguage } from './UiLanguageProvider'

export function CourseProductionLauncher({ project, dirty, onOpen }: { project: KinaouProject; dirty: boolean; onOpen: (handoff: CourseProductionHandoff) => void }) {
  const { t } = useUiLanguage()
  const [id, setId] = useState(''), [error, setError] = useState('')
  let choices: ReturnType<typeof courseProductionChoices> = [], invalid = ''
  try { choices = courseProductionChoices(project) } catch (cause) { invalid = String(cause) }
  const selected = choices.find(lesson => lesson.id === id)
  function open(target: CourseProductionTarget) {
    if (dirty) return
    setError('')
    try { onOpen(createCourseProductionHandoff(project, id, target)) } catch (cause) { setError(String(cause)) }
  }
  return <div className="card stack">
    <h3>{t('course.handoff.heading')}</h3><p>{t('course.handoff.help')}</p>
    <label>{t('course.handoff.lesson')}<select disabled={dirty || Boolean(invalid)} value={selected?.id ?? ''} onChange={event => { setId(event.target.value); setError('') }}>
      <option value="">{t('course.narration.choose')}</option>{choices.map(lesson => <option key={lesson.id} value={lesson.id}>{lesson.label}</option>)}
    </select></label>
    <div className="directorActions"><button disabled={dirty || !selected?.script?.trim()} onClick={() => open('narration')}>{t('course.handoff.narration')}</button><button disabled={dirty || !selected?.check.valid} onClick={() => open('export')}>{t('course.handoff.export')}</button></div>
    {selected && !selected.script?.trim() && <small>{t('course.handoff.noScript')}</small>}
    {selected && !selected.check.valid && <small>{t('course.handoff.invalidRange')}</small>}
    {(invalid || error) && <div className="errorBox" role="alert">{t('course.handoff.failed')}<details><summary>{t('common.details')}</summary>{invalid || error}</details></div>}
  </div>
}
