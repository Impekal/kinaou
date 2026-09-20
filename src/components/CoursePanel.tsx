import { useState } from 'react'
import { courseOutlineSchema, newCourseOutline, projectCourse, saveCourseOutline, type CourseOutline } from '../core/course'
import { contentLanguageLabels, type ContentLanguage } from '../core/contentProfile'
import type { KinaouProject } from '../core/project'
import type { PersistentVersionHistory } from '../core/versioning'

interface Props { project: KinaouProject; history: PersistentVersionHistory; onProjectChange: (project: KinaouProject) => void; onOpenStudio: () => void }

export function CoursePanel({ project, history, onProjectChange, onOpenStudio }: Props) {
  let saved: CourseOutline | null = null
  let loadError = ''
  try { saved = projectCourse(project) } catch (cause) { loadError = (cause as Error).message }
  const [draft, setDraft] = useState(() => saved ?? newCourseOutline(project))
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const dirty = JSON.stringify(saved) !== JSON.stringify(draft)
  const count = draft.modules.reduce((sum, module) => sum + module.lessons.length, 0)
  function change(next: CourseOutline) { setDraft(next); setMessage('') }
  function save() {
    setError(''); setMessage('')
    const parsed = courseOutlineSchema.safeParse(draft)
    if (!parsed.success) { setError(parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join(' · ')); return }
    try {
      const next = saveCourseOutline(project, parsed.data)
      if (next !== project) { history.snapshot(project, 'Before saving course outline', 'system'); onProjectChange(next) }
      setDraft(projectCourse(next)!)
      setMessage('Course outline saved. In Studio → Render, choose one saved lesson and explicitly start its export. No files have been generated or deleted by saving this outline.')
    } catch (cause) { setError((cause as Error).message) }
  }
  if (loadError) return <section className="card"><div className="errorBox" role="alert">{loadError}</div><button onClick={onOpenStudio}>Open Studio / Version History</button></section>
  return <section className="stack">
    <div className="sectionLead"><div><div className="eyebrow">COURSE PRODUCTION · OUTLINE</div><h2>Build your course, one lesson at a time</h2><p>Organize this project's timeline into modules and named lessons. Save your outline, then export each lesson independently in Studio.</p></div><span className="status">{dirty ? 'UNSAVED DRAFT' : `SAVED · REVISION ${saved?.revision}`}</span></div>
    <div className="card stack">
      <label>Course title<input maxLength={120} value={draft.title} onChange={(event) => change({ ...draft, title: event.target.value })} /></label>
      <label>Course language<select value={draft.language} onChange={(event) => change({ ...draft, language: event.target.value as ContentLanguage })}>{Object.entries(contentLanguageLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      <p>Language describes this course; it does not translate existing scripts or recordings.</p>
      <label>Intended learners<textarea maxLength={2000} value={draft.audience} onChange={(event) => change({ ...draft, audience: event.target.value })} /></label>
      <label>Prerequisites<textarea maxLength={4000} value={draft.prerequisites} onChange={(event) => change({ ...draft, prerequisites: event.target.value })} /></label>
      <label>Learning outcomes<textarea maxLength={8000} value={draft.learningOutcomes} onChange={(event) => change({ ...draft, learningOutcomes: event.target.value })} /></label>
    </div>
    <div className="card stack">
      <p>Lesson In/Out values are absolute timeline seconds, not automatic scene links. After timeline edits, review them again. Overlaps are allowed for shared introductions. Empty modules and ranges beyond the current timeline may be saved for planning, but invalid export ranges are blocked.</p>
      {draft.modules.map((module, moduleIndex) => <fieldset key={module.id} className="stack">
        <legend>Module {moduleIndex + 1}</legend>
        <label>Module title<input maxLength={120} value={module.title} onChange={(event) => change({ ...draft, modules: draft.modules.map((entry) => entry.id === module.id ? { ...entry, title: event.target.value } : entry) })} /></label>
        {module.lessons.map((lesson, lessonIndex) => <div key={lesson.id} className="card stack">
          <strong>Lesson {moduleIndex + 1}.{lessonIndex + 1}</strong>
          <label>Lesson title<input maxLength={120} value={lesson.title} onChange={(event) => change({ ...draft, modules: draft.modules.map((entry) => entry.id === module.id ? { ...entry, lessons: entry.lessons.map((item) => item.id === lesson.id ? { ...item, title: event.target.value } : item) } : entry) })} /></label>
          <label>Lesson objective<textarea maxLength={2000} value={lesson.objective} onChange={(event) => change({ ...draft, modules: draft.modules.map((entry) => entry.id === module.id ? { ...entry, lessons: entry.lessons.map((item) => item.id === lesson.id ? { ...item, objective: event.target.value } : item) } : entry) })} /></label>
          <div className="formRow">{(['inMs', 'outMs'] as const).map((edge) => <label key={edge}>{edge === 'inMs' ? 'In (seconds)' : 'Out (seconds)'}<input type="number" min="0" step="0.001" value={Number.isFinite(lesson.range[edge]) ? lesson.range[edge] / 1000 : ''} onChange={(event) => change({ ...draft, modules: draft.modules.map((entry) => entry.id === module.id ? { ...entry, lessons: entry.lessons.map((item) => item.id === lesson.id ? { ...item, range: { ...item.range, [edge]: event.target.value === '' ? NaN : Math.round(Number(event.target.value) * 1000) } } : item) } : entry) })} /></label>)}</div>
          <button className="secondaryButton" onClick={() => change({ ...draft, modules: draft.modules.map((entry) => entry.id === module.id ? { ...entry, lessons: entry.lessons.filter((item) => item.id !== lesson.id) } : entry) })}>Remove lesson from draft (keep media)</button>
        </div>)}
        <div className="directorActions"><button disabled={count >= 200 || module.lessons.length >= 100} onClick={() => change({ ...draft, modules: draft.modules.map((entry) => entry.id === module.id ? { ...entry, lessons: [...entry.lessons, { id: crypto.randomUUID(), title: `Lesson ${entry.lessons.length + 1}`, objective: '', range: { inMs: entry.lessons.at(-1)?.range.outMs ?? 0, outMs: (entry.lessons.at(-1)?.range.outMs ?? 0) + 60000 } }] } : entry) })}>Add lesson</button><button className="secondaryButton" onClick={() => change({ ...draft, modules: draft.modules.filter((entry) => entry.id !== module.id) })}>Remove module from draft (keep media)</button></div>
      </fieldset>)}
      <button disabled={draft.modules.length >= 50} onClick={() => change({ ...draft, modules: [...draft.modules, { id: crypto.randomUUID(), title: `Module ${draft.modules.length + 1}`, lessons: [] }] })}>Add module</button>
      <div className="directorActions"><button className="primary" disabled={!dirty} onClick={save}>Save course outline</button><button disabled={!dirty} onClick={() => { setDraft(saved ?? newCourseOutline(project)); setError(''); setMessage('Draft changes discarded; saved course and media unchanged.') }}>Discard draft edits</button><button disabled={dirty} onClick={onOpenStudio}>Open Studio to export lessons</button></div>
      {dirty && <small>Save before navigating away.</small>}
      <small>Version History can restore a previous saved outline; removing a lesson never deletes its media or exported videos.</small>
      {error && <div className="errorBox" role="alert">{error}</div>}{message && <div className="successBox" role="status">{message}</div>}
    </div>
    <div className="card note">This is the outline and individual-video-export foundation, not a complete course generator or platform approval check. Scripts, demonstrations, exercises, solutions and materials still need preparation and expert review. Meaningful instructor involvement and AI-use disclosure remain required for Udemy preparation; nothing is published here.</div>
  </section>
}
