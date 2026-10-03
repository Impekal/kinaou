import { useState } from 'react'
import { courseLessonExercisesExport, courseLessonScriptExport, courseOutlineSchema, courseScriptLimits, newCourseOutline, projectCourse, saveCourseOutline, type CourseOutline } from '../core/course'
import { contentLanguageLabels, type ContentLanguage } from '../core/contentProfile'
import type { KinaouProject } from '../core/project'
import type { PersistentVersionHistory } from '../core/versioning'
import { useUiLanguage } from './UiLanguageProvider'
import { CourseLessonEvidenceEditor } from './CourseLessonEvidenceEditor'
import { CourseLessonExercisesEditor } from './CourseLessonExercisesEditor'
import { CourseInstructorReviewPanel } from './CourseInstructorReviewPanel'
import { CourseLessonMaterialsEditor } from './CourseLessonMaterialsEditor'
import { CourseMaterialPackagePanel } from './CourseMaterialPackagePanel'
import type { CourseOutputWorkerProps } from './CourseOutputFileCheckPanel'
import { CourseDeliveryWorkspace } from './CourseDeliveryWorkspace'
import type { CourseExerciseDocument } from '../core/courseExercises'
import { moveCourseLesson, reorderCourseModule } from '../core/courseOrdering'
import { CourseModuleOrderControls, CourseLessonOrderControls } from './CourseOrderControls'
import { CourseWorkspaceNavigation, type CourseWorkspaceStage } from './CourseWorkspaceNavigation'
import { CourseProductionWorkspace } from './CourseProductionWorkspace'
import { CourseScriptDraftPanel } from './CourseScriptDraftPanel'
import { CourseExerciseDraftPanel } from './CourseExerciseDraftPanel'
import {courseGapPlacementIsCurrent,type CourseGapPlacement} from '../core/courseGapPlacement'
import {courseOutputNavigationIsCurrent,type CourseOutputNavigation} from '../core/courseOutputNavigation'
import { ProjectSourceArchivePanel } from './ProjectSourceArchivePanel'
import type { CourseProductionHandoff } from '../core/courseProductionHandoff'
import { CourseOutlineNavigator } from './CourseOutlineNavigator'
import { courseOutlineIssueFocus, resolveCourseOutlineFocus, type CourseOutlineFocus } from '../core/courseOutlineFocus'

interface Props extends CourseOutputWorkerProps { project: KinaouProject; history: PersistentVersionHistory; onProjectChange: (project: KinaouProject) => void; onOpenStudio: () => void; onOpenAudio?: () => void; onOpenProduction?: (handoff: CourseProductionHandoff) => void }

export function CoursePanel({ project, history, onProjectChange, onOpenStudio, onOpenAudio, onOpenProduction, ...worker }: Props) {
  const { t, language } = useUiLanguage()
  let saved: CourseOutline | null = null
  let loadError = ''
  try { saved = projectCourse(project) } catch (cause) { loadError = (cause as Error).message }
  const [draft, setDraft] = useState(() => saved ?? newCourseOutline(project))
  const [error, setError] = useState('')
  const [errorKind, setErrorKind] = useState<'course.invalid' | 'course.failed' | 'course.scriptDownloadFailed' | 'course.exercises.downloadFailed' | 'course.order.failed'>('course.failed')
  const [message, setMessage] = useState<'course.saved' | 'course.discarded' | null>(null)
  const [stage, setStage] = useState<CourseWorkspaceStage>('outline')
  const [selection, setSelection] = useState<CourseOutlineFocus>({ moduleId: '', lessonId: '' })
  const focus = resolveCourseOutlineFocus(draft, selection)
  const dirty = JSON.stringify(saved) !== JSON.stringify(draft)
  const [gap,setGap]=useState<CourseGapPlacement|null>(null)
  if(gap)courseGapPlacementIsCurrent(project,gap,language,dirty) // Observe invalidation even outside Production.
  const [outputNavigation,setOutputNavigation]=useState<CourseOutputNavigation|null>(null)
  if(outputNavigation)courseOutputNavigationIsCurrent(project,outputNavigation,dirty)
  const count = draft.modules.reduce((sum, module) => sum + module.lessons.length, 0)
  function change(next: CourseOutline, preferred = focus) { setDraft(next); setSelection(resolveCourseOutlineFocus(next, preferred)); setMessage(null) }
  function addModule() {
    if (draft.modules.length >= 50) return
    const id = crypto.randomUUID()
    change({ ...draft, modules: [...draft.modules, { id, title: `${t('course.module')} ${draft.modules.length + 1}`, lessons: [] }] }, { moduleId: id, lessonId: '' })
  }
  function addLesson(moduleId: string) {
    const module = draft.modules.find(item => item.id === moduleId)
    if (!module || count >= 200 || module.lessons.length >= 100) return
    const id = crypto.randomUUID(), start = module.lessons.at(-1)?.range.outMs ?? 0
    change({ ...draft, modules: draft.modules.map(item => item.id === moduleId ? { ...item, lessons: [...item.lessons, { id, title: `${t('course.lesson')} ${item.lessons.length + 1}`, objective: '', range: { inMs: start, outMs: start + 60000 } }] } : item) }, { moduleId, lessonId: id })
  }
  function reorder(action: () => CourseOutline) {
    setError('')
    try { change(action()) } catch (cause) { setErrorKind('course.order.failed'); setError(String(cause)) }
  }
  function downloadLesson(lessonId: string, kind: 'script' | CourseExerciseDocument) {
    if (dirty) return
    setError(''); setMessage(null)
    try {
      const script = kind === 'script' ? courseLessonScriptExport(project, lessonId) : courseLessonExercisesExport(project, lessonId, kind)
      const url = URL.createObjectURL(new Blob([script.text], { type: script.mimeType }))
      const link = document.createElement('a')
      try {
        link.href = url; link.download = script.filename
        document.body.appendChild(link); link.click()
      } finally {
        link.remove()
        window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      }
    } catch (cause) { setErrorKind(kind === 'script' ? 'course.scriptDownloadFailed' : 'course.exercises.downloadFailed'); setError(cause instanceof Error ? cause.message : String(cause)) }
  }
  function save() {
    setError(''); setMessage(null)
    const parsed = courseOutlineSchema.safeParse(draft)
    if (!parsed.success) {
      const invalidFocus = parsed.error.issues.map(issue => courseOutlineIssueFocus(draft, issue.path)).find(Boolean)
      if (invalidFocus) setSelection(invalidFocus)
      setErrorKind('course.invalid'); setError(parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join(' · ')); return
    }
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
    <CourseWorkspaceNavigation stage={stage} onSelect={setStage} />
    <div className="courseWorkspaceIntro"><div><h3 id="course-workspace-title">{t(`course.workspace.${stage}.title`)}</h3><p>{t(`course.workspace.${stage}.help`)}</p></div><span className="status">{t('course.workspace.counts', { modules: draft.modules.length, lessons: count })}</span></div>
    {dirty && stage !== 'outline' && <div className="card note courseWorkspaceDraft" role="status"><p>{t('course.workspace.draft')}</p><button className="secondaryButton" onClick={() => setStage('outline')}>{t('course.workspace.return')}</button></div>}
    <div id="course-workspace-content" className="stack" role="region" aria-labelledby="course-workspace-title">
    {stage === 'outline' && <>
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
      <p>{t('course.order.help')}</p>
      <CourseOutlineNavigator draft={draft} selected={focus} onSelect={setSelection} />
      {draft.modules.map((module, moduleIndex) => module.id === focus.moduleId ? <fieldset key={module.id} className="stack">
        <legend>{t('course.module')} {moduleIndex + 1}</legend>
        <CourseModuleOrderControls index={moduleIndex} count={draft.modules.length} onMove={index => reorder(() => reorderCourseModule(draft, module.id, index))} />
        <label>{t('course.moduleTitle')}<input maxLength={120} value={module.title} onChange={(event) => change({ ...draft, modules: draft.modules.map((entry) => entry.id === module.id ? { ...entry, title: event.target.value } : entry) })} /></label>
        {module.lessons.map((lesson, lessonIndex) => lesson.id === focus.lessonId ? <fieldset key={lesson.id} className="card stack">
          <legend>{t('course.lesson')} {moduleIndex + 1}.{lessonIndex + 1} · {lesson.title}</legend>
          <CourseLessonOrderControls draft={draft} moduleId={module.id} lessonId={lesson.id} onMove={(target, index) => reorder(() => moveCourseLesson(draft, module.id, lesson.id, target, index))} />
          <label>{t('course.lessonTitle')}<input maxLength={120} value={lesson.title} onChange={(event) => change({ ...draft, modules: draft.modules.map((entry) => entry.id === module.id ? { ...entry, lessons: entry.lessons.map((item) => item.id === lesson.id ? { ...item, title: event.target.value } : item) } : entry) })} /></label>
          <label>{t('course.objective')}<textarea maxLength={2000} value={lesson.objective} onChange={(event) => change({ ...draft, modules: draft.modules.map((entry) => entry.id === module.id ? { ...entry, lessons: entry.lessons.map((item) => item.id === lesson.id ? { ...item, objective: event.target.value } : item) } : entry) })} /></label>
          <label>{t('course.script')}<textarea maxLength={courseScriptLimits.lesson} rows={8} value={lesson.script ?? ''} onChange={(event) => change({ ...draft, modules: draft.modules.map((entry) => entry.id === module.id ? { ...entry, lessons: entry.lessons.map((item) => item.id === lesson.id ? { ...item, script: event.target.value } : item) } : entry) })} /></label>
          <small>{t('course.scriptHelp', { lessonLimit: courseScriptLimits.lesson, courseLimit: courseScriptLimits.course })}</small>
          <button className="secondaryButton" disabled={dirty || !lesson.script?.trim()} onClick={() => downloadLesson(lesson.id, 'script')}>{t('course.scriptDownload')}</button>
          <CourseScriptDraftPanel key={`script-draft-${project.id}-${lesson.id}`} project={project} lessonId={lesson.id} dirty={dirty} history={history} onProjectChange={onProjectChange} onSaved={next=>change(projectCourse(next)!)} {...worker} />
          <CourseLessonEvidenceEditor project={project} lesson={lesson} onChange={next => change({ ...draft, modules: draft.modules.map(entry => entry.id === module.id ? { ...entry, lessons: entry.lessons.map(item => item.id === lesson.id ? next : item) } : entry) })} />
          <CourseExerciseDraftPanel key={`exercise-draft-${project.id}-${lesson.id}`} project={project} lessonId={lesson.id} dirty={dirty} history={history} onProjectChange={onProjectChange} onSaved={next=>change(projectCourse(next)!)} {...worker} />
          <CourseLessonExercisesEditor lesson={lesson} dirty={dirty} onDownload={kind => downloadLesson(lesson.id, kind)} onChange={next => change({ ...draft, modules: draft.modules.map(entry => entry.id === module.id ? { ...entry, lessons: entry.lessons.map(item => item.id === lesson.id ? next : item) } : entry) })} />
          <CourseLessonMaterialsEditor lesson={lesson} onChange={next => change({ ...draft, modules: draft.modules.map(entry => entry.id === module.id ? { ...entry, lessons: entry.lessons.map(item => item.id === lesson.id ? next : item) } : entry) })} />
          <div className="formRow">{(['inMs', 'outMs'] as const).map((edge) => <label key={edge}>{t(edge === 'inMs' ? 'course.in' : 'course.out')}<input type="number" min="0" step="0.001" value={Number.isFinite(lesson.range[edge]) ? lesson.range[edge] / 1000 : ''} onChange={(event) => change({ ...draft, modules: draft.modules.map((entry) => entry.id === module.id ? { ...entry, lessons: entry.lessons.map((item) => item.id === lesson.id ? { ...item, range: { ...item.range, [edge]: event.target.value === '' ? NaN : Math.round(Number(event.target.value) * 1000) } } : item) } : entry) })} /></label>)}</div>
          <button className="secondaryButton" onClick={() => change({ ...draft, modules: draft.modules.map((entry) => entry.id === module.id ? { ...entry, lessons: entry.lessons.filter((item) => item.id !== lesson.id) } : entry) })}>{t('course.removeLesson')}</button>
        </fieldset> : null)}
        <div className="directorActions"><button disabled={count >= 200 || module.lessons.length >= 100} onClick={() => addLesson(module.id)}>{t('course.addLesson')}</button><button className="secondaryButton" onClick={() => change({ ...draft, modules: draft.modules.filter((entry) => entry.id !== module.id) })}>{t('course.removeModule')}</button></div>
      </fieldset> : null)}
      <button disabled={draft.modules.length >= 50} onClick={addModule}>{t('course.addModule')}</button>
      <div className="directorActions"><button className="primary" disabled={!dirty} onClick={save}>{t('course.save')}</button><button disabled={!dirty} onClick={() => { change(saved ?? newCourseOutline(project)); setError(''); setMessage('course.discarded') }}>{t('course.discard')}</button><button disabled={dirty} onClick={onOpenStudio}>{t('course.studio')}</button></div>
      {dirty && <small>{t('course.saveFirst')}</small>}
      <small>{t('course.restoreHelp')}</small>
      {error && <div className="errorBox" role="alert">{t(errorKind)}<details><summary>{t('common.details')}</summary>{error}</details></div>}{message && <div className="successBox" role="status">{t(message)}</div>}
    </div>
    </>}
    {stage === 'production' && <CourseProductionWorkspace key={project.id} project={project} dirty={dirty} history={history} onProjectChange={onProjectChange} {...worker} onOpenStudio={onOpenStudio} onOpenAudio={onOpenAudio} onOpenProduction={onOpenProduction} onEditLesson={(moduleId,lessonId)=>{if(dirty)return;setSelection({moduleId,lessonId});setStage('outline')}} pendingGap={gap} onPrepareGap={setGap} onClearGap={()=>setGap(null)} navigation={outputNavigation} onOpenOutputs={setOutputNavigation} onClearNavigation={()=>setOutputNavigation(null)} />}
    {stage === 'review' && <CourseInstructorReviewPanel key={project.id} project={project} dirty={dirty} history={history} onProjectChange={onProjectChange} />}
    {stage === 'delivery' && <>
    <CourseMaterialPackagePanel key={`materials-${project.id}`} project={project} dirty={dirty} />
    <CourseDeliveryWorkspace key={`delivery-library-${project.id}`} project={project} dirty={dirty} {...worker} />
    <ProjectSourceArchivePanel key={`source-archive-${project.id}`} project={project} dirty={dirty} {...worker} />
    </>}
    </div>
    <details className="card note courseWorkspaceLimits"><summary>{t('course.workspace.boundaries')}</summary><p>{t('course.workspace.detach')}</p><p>{t('course.boundary')}</p></details>
  </section>
}
