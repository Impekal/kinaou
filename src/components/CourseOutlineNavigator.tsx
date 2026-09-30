import type { CourseOutline } from '../core/course'
import { resolveCourseOutlineFocus, type CourseOutlineFocus } from '../core/courseOutlineFocus'
import { useUiLanguage } from './UiLanguageProvider'

export function CourseOutlineNavigator({ draft, selected, onSelect }: { draft: CourseOutline; selected: CourseOutlineFocus; onSelect: (value: CourseOutlineFocus) => void }) {
  const { t } = useUiLanguage(), focus = resolveCourseOutlineFocus(draft, selected)
  const module = draft.modules.find(item => item.id === focus.moduleId)
  const lessons = draft.modules.flatMap(item => item.lessons.map(lesson => ({ moduleId: item.id, lessonId: lesson.id })))
  const index = lessons.findIndex(item => item.lessonId === focus.lessonId)
  return <nav className="courseOutlineNavigator stack" aria-label={t('course.focus.navigation')}>
    <h3>{t('course.focus.heading')}</h3><p>{t('course.focus.help')}</p>
    <div className="formRow">
      <label>{t('course.focus.module')}<select disabled={!draft.modules.length} value={focus.moduleId} onChange={event => onSelect(resolveCourseOutlineFocus(draft, { moduleId: event.target.value, lessonId: '' }))}>
        {!draft.modules.length && <option value="">{t('course.focus.noModules')}</option>}
        {draft.modules.map((item, n) => <option key={item.id} value={item.id}>{n + 1}. {item.title || t('course.module')} · {item.lessons.length}</option>)}
      </select></label>
      <label>{t('course.focus.lesson')}<select disabled={!module?.lessons.length} value={focus.lessonId} onChange={event => onSelect({ moduleId: focus.moduleId, lessonId: event.target.value })}>
        {!module?.lessons.length && <option value="">{t('course.focus.noLessons')}</option>}
        {module?.lessons.map((item, n) => <option key={item.id} value={item.id}>{n + 1}. {item.title || t('course.lesson')}</option>)}
      </select></label>
    </div>
    <div className="directorActions">
      <button type="button" className="secondaryButton" disabled={index <= 0} onClick={() => { if (index > 0) onSelect(lessons[index - 1]) }}>{t('course.focus.previous')}</button>
      <span role="status">{index < 0 ? t('course.focus.noLessons') : t('course.focus.position', { current: index + 1, total: lessons.length })}</span>
      <button type="button" className="secondaryButton" disabled={index < 0 || index >= lessons.length - 1} onClick={() => { if (index >= 0 && index < lessons.length - 1) onSelect(lessons[index + 1]) }}>{t('course.focus.next')}</button>
    </div>
  </nav>
}
