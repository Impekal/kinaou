import type { CourseLesson } from '../core/course'
import { canExportCourseExercises, courseExerciseLimits, type CourseExercise, type CourseExerciseDocument } from '../core/courseExercises'
import { useUiLanguage } from './UiLanguageProvider'

export function CourseLessonExercisesEditor({ lesson, dirty, onChange, onDownload }: {
  lesson: CourseLesson; dirty: boolean; onChange: (lesson: CourseLesson) => void; onDownload: (kind: CourseExerciseDocument) => void
}) {
  const { t } = useUiLanguage()
  const exercises = lesson.exercises ?? []
  function change(next: CourseExercise) { onChange({ ...lesson, exercises: exercises.map(item => item.id === next.id ? next : item) }) }
  return <details className="stack">
    <summary>{t('course.exercises.heading')} · {exercises.length}</summary>
    <p>{t('course.exercises.help')}</p>
    {exercises.map((exercise, index) => <fieldset className="stack" key={exercise.id}>
      <legend>{t('course.exercises.item')} {index + 1}</legend>
      <label>{t('course.exercises.title')}<input maxLength={120} value={exercise.title} onChange={event => change({ ...exercise, title: event.target.value })} /></label>
      {(['prompt', 'hint', 'solution', 'criteria'] as const).map(field => <label key={field}>{t(`course.exercises.${field}`)}<textarea rows={field === 'prompt' || field === 'solution' ? 5 : 2} maxLength={courseExerciseLimits.field} value={exercise[field]} onChange={event => change({ ...exercise, [field]: event.target.value })} /></label>)}
      <button className="secondaryButton" onClick={() => onChange({ ...lesson, exercises: exercises.filter(item => item.id !== exercise.id) })}>{t('course.exercises.remove')}</button>
    </fieldset>)}
    <button disabled={exercises.length >= courseExerciseLimits.perLesson} onClick={() => onChange({ ...lesson, exercises: [...exercises, { id: crypto.randomUUID(), title: '', prompt: '', hint: '', solution: '', criteria: '' }] })}>{t('course.exercises.add')}</button>
    <div className="directorActions">
      <button disabled={dirty || !canExportCourseExercises(exercises, 'worksheet')} onClick={() => onDownload('worksheet')}>{t('course.exercises.worksheet')}</button>
      <button disabled={dirty || !canExportCourseExercises(exercises, 'answer-key')} onClick={() => onDownload('answer-key')}>{t('course.exercises.answers')}</button>
    </div>
    <small>{t('course.exercises.downloadHelp')}</small>
  </details>
}
