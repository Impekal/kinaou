import { courseExerciseAnswerOverlap, courseScriptMissingQuotedNumbers, courseScriptAddedQuotedNumbers } from '../core/courseDraftQuality'
import { useUiLanguage } from './UiLanguageProvider'

export function CourseExerciseQualityHints({ exercise }: { exercise: { title: string; prompt: string; hint: string; solution: string } }) {
  const { t } = useUiLanguage(), fields = courseExerciseAnswerOverlap(exercise)
  return fields.length ? <aside className="courseDraftConcern" role="status"><strong>{t('course.quality.heading')}</strong><p>{t('course.quality.answer', { fields: fields.map(field => t(`course.exerciseDraft.${field}`)).join(', ') })}</p><small>{t('course.quality.boundary')}</small></aside> : null
}
export function CourseScriptQualityHints({ paragraph, number }: { paragraph: { text: string; sourceQuote: string }; number?: number }) {
  const { t } = useUiLanguage(), numbers = courseScriptMissingQuotedNumbers(paragraph), added = courseScriptAddedQuotedNumbers(paragraph)
  return numbers.length || added.length ? <aside className="courseDraftConcern" role="status"><strong>{number ? t('course.scriptDraft.paragraph', { number }) + ': ' : ''}{t('course.quality.heading')}</strong>{numbers.length > 0 && <p>{t('course.quality.numbers', { numbers: numbers.join(', ') })}</p>}{added.length > 0 && <p>{t('course.quality.addedNumbers', { numbers: added.join(', ') })}</p>}<small>{t('course.quality.boundary')}</small></aside> : null
}
