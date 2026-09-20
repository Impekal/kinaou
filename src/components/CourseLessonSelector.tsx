import type { courseLessonChoices } from '../core/course'
import { useUiLanguage } from './UiLanguageProvider'

interface Props { lessons: ReturnType<typeof courseLessonChoices>; selectedId: string; stale?: boolean; disabled: boolean; onSelect: (id: string) => void }
export function CourseLessonSelector({ lessons, selectedId, stale = false, disabled, onSelect }: Props) {
  const { language, t } = useUiLanguage()
  if (!lessons.length && !selectedId) return null
  const selected = lessons.find(lesson => lesson.id === selectedId)
  return <div className="renderJob">
    <div className="renderJobHead"><strong>{t('lessonExport.heading')}</strong><span>{t('lessonExport.count', { count: lessons.length })}</span></div>
    <p>{t('lessonExport.help')}</p>
    <label>{t('lessonExport.select')}<select value={selectedId} disabled={disabled} onChange={(event) => onSelect(event.target.value)}>
      <option value="">{t('lessonExport.none')}</option>
      {selectedId && !selected && <option value={selectedId} disabled>{t('lessonExport.unavailable')}</option>}
      {lessons.map((lesson) => <option key={lesson.id} value={lesson.id} disabled={!lesson.check.valid}>{lesson.label} · {(lesson.range.inMs / 1000).toLocaleString(language)}–{(lesson.range.outMs / 1000).toLocaleString(language)} s{!lesson.check.valid ? ` · ${lesson.check.code ? t(`range.${lesson.check.code}`) : lesson.check.reason}` : ''}</option>)}
    </select></label>
    {stale && <div className="warning" role="alert">{t('lessonExport.stale')}<div className="renderActions">
      {selected?.check.valid && <button disabled={disabled} onClick={() => onSelect(selectedId)}>{t('lessonExport.review')}</button>}
      <button disabled={disabled} onClick={() => onSelect('')}>{t('lessonExport.clear')}</button>
    </div></div>}
    {selectedId && <small>{t('lessonExport.receipt')}</small>}
  </div>
}
