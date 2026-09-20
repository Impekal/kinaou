import { useState } from 'react'
import { courseOutlineSchema, newCourseOutline, projectCourse, saveCourseOutline, type CourseOutline } from '../core/course'
import { contentLanguageLabels, type ContentLanguage } from '../core/contentProfile'
import type { KinaouProject } from '../core/project'
import type { PersistentVersionHistory } from '../core/versioning'
import { useUiLanguage } from './UiLanguageProvider'

interface Props { project: KinaouProject; history: PersistentVersionHistory; onProjectChange: (project: KinaouProject) => void; onOpenStudio: () => void }

export function CoursePanel({ project, history, onProjectChange, onOpenStudio }: Props) {
  const { t } = useUiLanguage()
  let saved: CourseOutline | null = null
  let loadError = ''
  try { saved = projectCourse(project) } catch (cause) { loadError = (cause as Error).message }
  const [draft, setDraft] = useState(() => saved ?? newCourseOutline(project))
  const [error, setError] = useState('')
  const [errorKind, setErrorKind] = useState<'course.invalid' | 'course.failed'>('course.failed')
  const [message, setMessage] = useState<'course.saved' | 'course.discarded' | null>(null)
  const dirty = JSON.stringify(saved) !== JSON.stringify(draft)
  const count = draft.modules.reduce((sum, module) => sum + module.lessons.length, 0)
  function change(next: CourseOutline) { setDraft(next); setMessage(null) }
  function save() {
    setError(''); setMessage(null)
    const parsed = courseOutlineSchema.safeParse(draft)
    if (!parsed.success) { setErrorKind('course.invalid'); setError(parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join(' · ')); return }
    try {
      const next = saveCourseOutline(project, parsed.data)
      if (next !== project) { history.snapshot(project, 'Before saving course outline', 'system'); onProjectChange(next) }
      setDraft(projectCourse(next)!)
      setMessage('course.saved')
    } catch (cause) { setErrorKind('course.failed'); setError((cause as Error).message) }
  }
  if (loadError) return <section className="card"><div className="errorBox" role="alert">{t('course.corrupt')}<details><summary>{t('common.details')}</summary>{loadError}</details></div><button onClick={onOpenStudio}>{t('course.history')}</button></section>
  return <section className="stack">
    <div className="sectionLead"><div><div className="eyebrow">{t('course.eyebrow')}</div><h2>{t('course.heading')}</h2><p>{t('course.help')}</p></div><span className="status">{dirty ? t('course.unsaved') : t('course.revision', { revision: saved?.revision ?? 0 })}</span></div>
    <div className="card stack">
      <label>{t('course.title')}<input maxLength={120} value={draft.title} onChange={(event) => change({ ...draft, title: event.target.value })} /></label>
      <label>{t('course.language')}<select value={draft.language} onChange={(event) => change({ ...draft, language: event.target.value as ContentLanguage })}>{Object.entries(contentLanguageLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      <p>{t('course.languageHelp')}</p>
      <label>{t('course.audience')}<textarea maxLength={2000} value={draft.audience} onChange={(event) => change({ ...draft, audience: event.target.value })} /></label>
      <label>{t('course.prerequisites')}<textarea maxLength={4000} value={draft.prerequisites} onChange={(event) => change({ ...draft, prerequisites: event.target.value })} /></label>
      <label>{t('course.outcomes')}<textarea maxLength={8000} value={draft.learningOutcomes} onChange={(event) => change({ ...draft, learningOutcomes: event.target.value })} /></label>
    </div>
    <div className="card stack">
      <p>{t('course.rangeHelp')}</p>
      {draft.modules.map((module, moduleIndex) => <fieldset key={module.id} className="stack">
        <legend>{t('course.module')} {moduleIndex + 1}</legend>
        <label>{t('course.moduleTitle')}<input maxLength={120} value={module.title} onChange={(event) => change({ ...draft, modules: draft.modules.map((entry) => entry.id === module.id ? { ...entry, title: event.target.value } : entry) })} /></label>
        {module.lessons.map((lesson, lessonIndex) => <div key={lesson.id} className="card stack">
          <strong>{t('course.lesson')} {moduleIndex + 1}.{lessonIndex + 1}</strong>
          <label>{t('course.lessonTitle')}<input maxLength={120} value={lesson.title} onChange={(event) => change({ ...draft, modules: draft.modules.map((entry) => entry.id === module.id ? { ...entry, lessons: entry.lessons.map((item) => item.id === lesson.id ? { ...item, title: event.target.value } : item) } : entry) })} /></label>
          <label>{t('course.objective')}<textarea maxLength={2000} value={lesson.objective} onChange={(event) => change({ ...draft, modules: draft.modules.map((entry) => entry.id === module.id ? { ...entry, lessons: entry.lessons.map((item) => item.id === lesson.id ? { ...item, objective: event.target.value } : item) } : entry) })} /></label>
          <div className="formRow">{(['inMs', 'outMs'] as const).map((edge) => <label key={edge}>{t(edge === 'inMs' ? 'course.in' : 'course.out')}<input type="number" min="0" step="0.001" value={Number.isFinite(lesson.range[edge]) ? lesson.range[edge] / 1000 : ''} onChange={(event) => change({ ...draft, modules: draft.modules.map((entry) => entry.id === module.id ? { ...entry, lessons: entry.lessons.map((item) => item.id === lesson.id ? { ...item, range: { ...item.range, [edge]: event.target.value === '' ? NaN : Math.round(Number(event.target.value) * 1000) } } : item) } : entry) })} /></label>)}</div>
          <button className="secondaryButton" onClick={() => change({ ...draft, modules: draft.modules.map((entry) => entry.id === module.id ? { ...entry, lessons: entry.lessons.filter((item) => item.id !== lesson.id) } : entry) })}>{t('course.removeLesson')}</button>
        </div>)}
        <div className="directorActions"><button disabled={count >= 200 || module.lessons.length >= 100} onClick={() => change({ ...draft, modules: draft.modules.map((entry) => entry.id === module.id ? { ...entry, lessons: [...entry.lessons, { id: crypto.randomUUID(), title: `${t('course.lesson')} ${entry.lessons.length + 1}`, objective: '', range: { inMs: entry.lessons.at(-1)?.range.outMs ?? 0, outMs: (entry.lessons.at(-1)?.range.outMs ?? 0) + 60000 } }] } : entry) })}>{t('course.addLesson')}</button><button className="secondaryButton" onClick={() => change({ ...draft, modules: draft.modules.filter((entry) => entry.id !== module.id) })}>{t('course.removeModule')}</button></div>
      </fieldset>)}
      <button disabled={draft.modules.length >= 50} onClick={() => change({ ...draft, modules: [...draft.modules, { id: crypto.randomUUID(), title: `${t('course.module')} ${draft.modules.length + 1}`, lessons: [] }] })}>{t('course.addModule')}</button>
      <div className="directorActions"><button className="primary" disabled={!dirty} onClick={save}>{t('course.save')}</button><button disabled={!dirty} onClick={() => { setDraft(saved ?? newCourseOutline(project)); setError(''); setMessage('course.discarded') }}>{t('course.discard')}</button><button disabled={dirty} onClick={onOpenStudio}>{t('course.studio')}</button></div>
      {dirty && <small>{t('course.saveFirst')}</small>}
      <small>{t('course.restoreHelp')}</small>
      {error && <div className="errorBox" role="alert">{t(errorKind)}<details><summary>{t('common.details')}</summary>{error}</details></div>}{message && <div className="successBox" role="status">{t(message)}</div>}
    </div>
    <div className="card note">{t('course.boundary')}</div>
  </section>
}
