import type { KinaouProject } from '../core/project'
import { createCourseLessonPreview } from '../core/courseLessonPreview'
import { formatReframingRequiresWorker, type TargetFormat } from '../core/render'
import type { AudioDuckingSettings } from '../core/audioDucking'
import type { LoudnessNormalizationSettings } from '../core/audioLoudness'
import { RangePreviewPlayback } from './ShortPreviewPanel'
import { useUiLanguage } from './UiLanguageProvider'

export function CourseLessonPreviewPanel(props: {
  project: KinaouProject; lessonId: string; format: TargetFormat; audioDucking: AudioDuckingSettings; loudnessNormalization: LoudnessNormalizationSettings
  workerUrl: string; workerToken: string; workerConnected: boolean; workerCapabilities: string[]; disabled: boolean; onBusyChange: (busy: boolean) => void
}) {
  const { t, language } = useUiLanguage()
  let prepared: ReturnType<typeof createCourseLessonPreview> | null = null, error = ''
  try { prepared = createCourseLessonPreview(props.project, props.lessonId, props.format, { audioDucking: props.audioDucking, loudnessNormalization: props.loudnessNormalization }) }
  catch (cause) { error = String(cause) }
  const blocked = formatReframingRequiresWorker(props.project, props.format) && !props.workerCapabilities.includes('format-reframing')
  const scope = JSON.stringify([props.project, prepared, props.workerUrl, props.workerToken, props.workerConnected, blocked, props.disabled])
  return <section className="renderJob stack">
    <h3>{t('course.preview.heading')}</h3><p>{t('course.preview.help')}</p><p className="note">{t('preview.scopeHelp')}</p>
    {prepared && <><strong>{prepared.label}</strong><p>{t('course.preview.range', { start: (prepared.range.inMs / 1000).toLocaleString(language), end: (prepared.range.outMs / 1000).toLocaleString(language), format: t(`export.${props.format}`) })}</p></>}
    {error && <div role="alert" className="errorBox">{t('preview.planFailed')}<details><summary>{t('common.details')}</summary>{error}</details></div>}
    {blocked && <p className="warning">{t('preview.restart')}</p>}
    <RangePreviewPlayback key={scope} plan={prepared?.plan ?? null} disabled={props.disabled || blocked} workerUrl={props.workerUrl} workerToken={props.workerToken} workerConnected={props.workerConnected} onBusyChange={props.onBusyChange} />
  </section>
}
