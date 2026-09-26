import type { CourseLesson } from '../core/course'
import type { KinaouProject } from '../core/project'
import { attachCourseDemoEvidence, courseDemoEvidenceState, courseEvidenceAssetChoices, courseEvidenceLimits, type CourseDemonstration } from '../core/courseEvidence'
import { useUiLanguage } from './UiLanguageProvider'

export function CourseLessonEvidenceEditor({ project, lesson, onChange }: {
  project: KinaouProject; lesson: CourseLesson; onChange: (lesson: CourseLesson) => void
}) {
  const { t } = useUiLanguage()
  const sources = lesson.sources ?? []
  const demos = lesson.demonstrations ?? []
  const assets = courseEvidenceAssetChoices(project)
  const statusKeys = {
    none: 'course.evidence.none', missing: 'course.evidence.missing', changed: 'course.evidence.changed',
    offline: 'course.evidence.offline', linked: 'course.evidence.linked'
  } as const
  function changeDemo(next: CourseDemonstration) {
    onChange({ ...lesson, demonstrations: demos.map(entry => entry.id === next.id ? next : entry) })
  }
  return <details className="stack">
    <summary>{t('course.evidence.heading')} · {sources.length} / {demos.length}</summary>
    <p>{t('course.evidence.help')}</p>
    <div className="stack">
      <h4>{t('course.evidence.sources')}</h4>
      {sources.map((source, index) => <fieldset className="stack" key={source.id}>
        <legend>{t('course.evidence.source')} {index + 1}</legend>
        <label>{t('course.evidence.title')}<input maxLength={120} value={source.title} onChange={event => onChange({ ...lesson, sources: sources.map(entry => entry.id === source.id ? { ...entry, title: event.target.value } : entry) })} /></label>
        <label>{t('course.evidence.url')}<input type="url" maxLength={2048} value={source.url} onChange={event => onChange({ ...lesson, sources: sources.map(entry => entry.id === source.id ? { ...entry, url: event.target.value } : entry) })} /></label>
        <label>{t('course.evidence.accessed')}<input type="date" value={source.accessedOn ?? ''} onChange={event => onChange({ ...lesson, sources: sources.map(entry => entry.id === source.id ? { ...entry, accessedOn: event.target.value || undefined } : entry) })} /></label>
        <label>{t('course.evidence.notes')}<textarea maxLength={4000} value={source.notes} onChange={event => onChange({ ...lesson, sources: sources.map(entry => entry.id === source.id ? { ...entry, notes: event.target.value } : entry) })} /></label>
        <button className="secondaryButton" onClick={() => onChange({ ...lesson, sources: sources.filter(entry => entry.id !== source.id) })}>{t('course.evidence.removeSource')}</button>
      </fieldset>)}
      <button disabled={sources.length >= courseEvidenceLimits.sourcesPerLesson} onClick={() => onChange({ ...lesson, sources: [...sources, { id: crypto.randomUUID(), title: '', url: '', notes: '' }] })}>{t('course.evidence.addSource')}</button>
      <h4>{t('course.evidence.demos')}</h4>
      {demos.map((demo, index) => <fieldset className="stack" key={demo.id}>
        <legend>{t('course.evidence.demo')} {index + 1}</legend>
        <label>{t('course.evidence.title')}<input maxLength={120} value={demo.title} onChange={event => changeDemo({ ...demo, title: event.target.value })} /></label>
        <label>{t('course.evidence.steps')}<textarea maxLength={4000} value={demo.steps} onChange={event => changeDemo({ ...demo, steps: event.target.value })} /></label>
        <label>{t('course.evidence.expected')}<textarea maxLength={4000} value={demo.expected} onChange={event => changeDemo({ ...demo, expected: event.target.value })} /></label>
        <label>{t('course.evidence.observed')}<textarea maxLength={4000} value={demo.observed} onChange={event => changeDemo({ ...demo, observed: event.target.value })} /></label>
        <label>{t('course.evidence.performed')}<input type="date" value={demo.performedOn ?? ''} onChange={event => changeDemo({ ...demo, performedOn: event.target.value || undefined })} /></label>
        <label>{t('course.evidence.asset')}<select value={demo.evidence?.assetId ?? ''} onChange={event => {
          if (!event.target.value) { const { evidence: _evidence, ...rest } = demo; changeDemo(rest); return }
          changeDemo(attachCourseDemoEvidence(project, demo, event.target.value))
        }}>
          <option value="">{t('course.evidence.none')}</option>
          {demo.evidence && !assets.some(asset => asset.id === demo.evidence!.assetId) && <option value={demo.evidence.assetId} disabled>{demo.evidence.uri}</option>}
          {assets.map(asset => <option key={asset.id} value={asset.id}>{asset.uri}</option>)}
        </select></label>
        <small>{t(statusKeys[courseDemoEvidenceState(project, demo)])}</small>
        {demo.evidence && <code style={{ overflowWrap: 'anywhere' }}>{demo.evidence.uri}</code>}
        <button className="secondaryButton" onClick={() => onChange({ ...lesson, demonstrations: demos.filter(entry => entry.id !== demo.id) })}>{t('course.evidence.removeDemo')}</button>
      </fieldset>)}
      <button disabled={demos.length >= courseEvidenceLimits.demosPerLesson} onClick={() => onChange({ ...lesson, demonstrations: [...demos, { id: crypto.randomUUID(), title: '', steps: '', expected: '', observed: '' }] })}>{t('course.evidence.addDemo')}</button>
    </div>
  </details>
}
