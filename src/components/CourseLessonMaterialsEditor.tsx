import type { CourseLesson } from '../core/course'
import { courseMaterialLimits, type CourseMaterial } from '../core/courseMaterials'
import { useUiLanguage } from './UiLanguageProvider'
export function CourseLessonMaterialsEditor({ lesson, onChange }: { lesson: CourseLesson; onChange: (lesson: CourseLesson) => void }) {
  const { t } = useUiLanguage(), materials = lesson.materials ?? []
  function change(next: CourseMaterial) { onChange({ ...lesson, materials: materials.map(item => item.id === next.id ? next : item) }) }
  return <details className="stack">
    <summary>{t('course.materials.heading')} · {materials.length}</summary><p>{t('course.materials.help')}</p>
    {materials.map((material, index) => <fieldset key={material.id} className="stack">
      <legend>{t('course.materials.item')} {index + 1}</legend>
      <label>{t('course.materials.title')}<input maxLength={120} value={material.title} onChange={event => change({ ...material, title: event.target.value })} /></label>
      <label>{t('course.materials.audience')}<select value={material.audience} onChange={event => change({ ...material, audience: event.target.value as CourseMaterial['audience'] })}>
        <option value="learner">{t('course.materials.learner')}</option><option value="instructor">{t('course.materials.instructor')}</option>
      </select></label>
      <label>{t('course.materials.body')}<textarea rows={6} maxLength={courseMaterialLimits.body} value={material.body} onChange={event => change({ ...material, body: event.target.value })} /></label>
      <button className="secondaryButton" onClick={() => onChange({ ...lesson, materials: materials.filter(item => item.id !== material.id) })}>{t('course.materials.remove')}</button>
    </fieldset>)}
    <button disabled={materials.length >= courseMaterialLimits.perLesson} onClick={() => onChange({ ...lesson, materials: [...materials, { id: crypto.randomUUID(), title: '', audience: 'instructor', body: '' }] })}>{t('course.materials.add')}</button>
  </details>
}
