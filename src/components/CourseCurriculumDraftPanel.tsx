import { useEffect, useRef, useState } from 'react'
import type { KinaouProject } from '../core/project'
import type { PersistentVersionHistory } from '../core/versioning'
import { projectCourse } from '../core/course'
import { AiEditorRequestScope } from '../core/aiEditorReview'
import { commitCourseCurriculum, courseCurriculumContext, courseCurriculumReviewIsCurrent, parseCourseCurriculumResult, projectCourseCurriculumRecord, reviewCourseCurriculum, type CourseCurriculumContext, type CourseCurriculumProposal, type CourseCurriculumResult, type CourseCurriculumReview } from '../core/courseCurriculumDraft'
import { WorkerClient } from '../core/workerClient'
import type { CourseOutputWorkerProps } from './CourseOutputFileCheckPanel'
import { useUiLanguage } from './UiLanguageProvider'

export function CourseCurriculumDraftPanel({ project, dirty, history, onProjectChange, onSaved, workerUrl = '', workerToken = '', workerConnected = false, workerCapabilities = [] }: CourseOutputWorkerProps & { project: KinaouProject; dirty: boolean; history: PersistentVersionHistory; onProjectChange: (project: KinaouProject) => void; onSaved: (project: KinaouProject) => void }) {
  const { t, language } = useUiLanguage(), [notes, setNotes] = useState(''), [model, setModel] = useState(''), [count, setCount] = useState(3), [start, setStart] = useState(''), [slot, setSlot] = useState('')
  const [models, setModels] = useState<{ connection: string; ids: string[] } | null>(null), [generated, setGenerated] = useState<{ context: CourseCurriculumContext; result: CourseCurriculumResult; current: () => boolean } | null>(null)
  const [draft, setDraft] = useState<CourseCurriculumProposal | null>(null), [review, setReview] = useState<CourseCurriculumReview | null>(null), [ack, setAck] = useState(false), [pending, setPending] = useState<{ current: () => boolean } | null>(null), [error, setError] = useState(''), [saved, setSaved] = useState(false)
  const available = workerConnected && !!workerToken.trim() && workerCapabilities.includes('course-curriculum'), connection = JSON.stringify([workerUrl, workerToken, available])
  const scope = useRef(new AiEditorRequestScope()), flight = useRef<(() => boolean) | null>(null)
  scope.current.update(JSON.stringify([project, dirty, connection, notes, model, count, language]))
  useEffect(() => { scope.current.attach(); return () => scope.current.detach() }, [])
  if (review) courseCurriculumReviewIsCurrent(project, review, dirty)
  const busy = !!pending?.current(), fresh = !!generated?.current(), currentReview = fresh && !!review && courseCurriculumReviewIsCurrent(project, review, dirty), installed = models?.connection === connection ? models.ids : []
  let course: ReturnType<typeof projectCourse> = null, stored: ReturnType<typeof projectCourseCurriculumRecord> = null, invalid = ''
  try { course = projectCourse(project); stored = projectCourseCurriculumRecord(project) } catch (cause) { invalid = String(cause) }
  function clearReview() { setReview(null); setAck(false); setError(''); setSaved(false) }
  async function request(kind: 'models' | 'draft') {
    if (!available || dirty || invalid || !course || busy || flight.current?.()) return
    if (kind === 'draft' && (!notes.trim() || !installed.includes(model))) return
    clearReview(); const current = scope.current.begin(); flight.current = current; setPending({ current })
    if (kind === 'draft') { setGenerated(null); setDraft(null) }
    try {
      const client = new WorkerClient({ baseUrl: workerUrl, token: workerToken })
      if (kind === 'models') { const items = await client.listLocalModels(); if (current()) { setModels({ connection, ids: items.map(item => item.id) }); setModel(items[0]?.id ?? '') } }
      else { const context = courseCurriculumContext(project, notes, count), result = parseCourseCurriculumResult(context, await client.generateCourseCurriculum(model, context), model); if (current()) { setGenerated({ context, result, current }); setDraft(structuredClone(result.proposal)) } }
    } catch (cause) { if (current()) setError(String(cause)) }
    finally { if (current()) setPending(null); if (flight.current === current) flight.current = null }
  }
  function inspect() { clearReview(); if (!fresh || !generated || !draft || dirty || !start.trim() || !slot.trim()) return; try { setReview(reviewCourseCurriculum(project, generated.context, generated.result, draft, { startMs: Math.round(Number(start) * 1000), slotMs: Math.round(Number(slot) * 1000) })) } catch (cause) { setError(String(cause)) } }
  function save() {
    if (!currentReview || !review || !ack) return
    try { const next = commitCourseCurriculum(project, review, ack, { snapshot: value => { history.snapshot(value, 'Before applying course curriculum draft', 'system') }, persist: onProjectChange }); onSaved(next); setReview(null); setAck(false); setGenerated(null); setDraft(null); setSaved(true); setError('') } catch (cause) { setError(String(cause)) }
  }
  function display(proposal: CourseCurriculumProposal) { return proposal.modules.map((module, m) => <section key={m}><h5>{module.title}</h5>{module.lessons.map((lesson, l) => <div key={l}><h6>{lesson.title}</h6><p>{lesson.objective}</p><blockquote>{lesson.sourceQuote}</blockquote></div>)}</section>) }
  return <details className="card stack courseDraft"><summary>{t('course.curriculum.heading')}</summary>
    <p>{t('course.curriculum.help')}</p><p className="note">{t('course.curriculum.boundary')}</p>
    {!available && <p>{t('course.scriptDraft.unavailable')}</p>}{(!course || dirty) && <p>{t('course.saveFirst')}</p>}{invalid && <p role="alert">{t('course.scriptDraft.invalid')}<code>{invalid}</code></p>}
    <label>{t('course.scriptDraft.notes')}<textarea rows={6} maxLength={12000} value={notes} onChange={event => { setNotes(event.target.value); clearReview() }} /></label>
    <label>{t('course.curriculum.count')}<select value={count} onChange={event => { setCount(Number(event.target.value)); clearReview() }}>{[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n}</option>)}</select></label>
    <button disabled={!available || dirty || !course || !!invalid || busy} onClick={() => request('models')}>{t('course.scriptDraft.discover')}</button>
    {models?.connection === connection && !installed.length && <p>{t('course.scriptDraft.none')}</p>}
    <label>{t('course.scriptDraft.model')}<select value={installed.includes(model) ? model : ''} disabled={busy} onChange={event => { setModel(event.target.value); clearReview() }}><option value="">{t('course.scriptDraft.choose')}</option>{installed.map(id => <option key={id}>{id}</option>)}</select></label>
    <button disabled={!available || dirty || !!invalid || !course || busy || !notes.trim() || !installed.includes(model)} onClick={() => request('draft')}>{t('course.curriculum.generate')}</button>
    {busy && <p role="status">{t('course.scriptDraft.busy')}</p>}{(generated && !fresh || pending && !busy) && <p role="status">{t('course.curriculum.stale')}</p>}
    {generated && draft && <section className="stack"><p>{t('course.scriptDraft.origin', { model: generated.result.modelId, language: generated.context.language })}</p><details><summary>{t('course.scriptDraft.generated')}</summary>{display(generated.result.proposal)}</details><h4>{t('course.scriptDraft.proposed')}</h4>
      {draft.modules.map((module, m) => <fieldset key={m} className="stack"><legend>{t('course.module')} {m + 1}</legend><label>{t('course.moduleTitle')}<input maxLength={120} disabled={!fresh || dirty} value={module.title} onChange={event => { clearReview(); setDraft({ modules: draft.modules.map((item, i) => i === m ? { ...item, title: event.target.value } : item) }) }} /></label>
        {module.lessons.map((lesson, l) => <fieldset key={l} className="stack"><legend>{t('course.lesson')} {m + 1}.{l + 1}</legend>{(['title', 'objective'] as const).map(key => <label key={key}>{t(key === 'title' ? 'course.lessonTitle' : 'course.objective')}<textarea rows={2} maxLength={key === 'title' ? 120 : 1000} disabled={!fresh || dirty} value={lesson[key]} onChange={event => { clearReview(); setDraft({ modules: draft.modules.map((item, i) => i === m ? { ...item, lessons: item.lessons.map((entry, j) => j === l ? { ...entry, [key]: event.target.value } : entry) } : item) }) }} /></label>)}<blockquote>{lesson.sourceQuote}</blockquote></fieldset>)}
      </fieldset>)}
      <p className="note">{t('course.curriculum.timing')}</p><div className="formRow"><label>{t('course.curriculum.start')}<input type="number" min="0" step="0.001" value={start} onChange={event => { setStart(event.target.value); clearReview() }} /></label><label>{t('course.curriculum.slot')}<input type="number" min="0.001" step="0.001" value={slot} onChange={event => { setSlot(event.target.value); clearReview() }} /></label></div>
      <button disabled={!fresh || dirty || !start.trim() || !slot.trim()} onClick={inspect}>{t('course.curriculum.review')}</button>
    </section>}
    {review && <section className="stack"><h4>{t('course.curriculum.final')}</h4>{display(review.record.accepted)}<ol>{review.record.modules.flatMap(module => module.lessons).map(lesson => <li key={lesson.id}>{lesson.title}: {lesson.range.inMs / 1000}–{lesson.range.outMs / 1000} s</li>)}</ol>{!currentReview && <p role="alert">{t('course.curriculum.stale')}</p>}<label><input type="checkbox" checked={ack && currentReview} disabled={!currentReview} onChange={event => setAck(event.target.checked)} />{t('course.curriculum.ack')}</label><button disabled={!currentReview || !ack} onClick={save}>{t('course.curriculum.save')}</button></section>}
    {error && <p role="alert">{t('course.scriptDraft.failed')}<code>{error}</code></p>}{saved && <p role="status">{t('course.curriculum.saved')}</p>}
    {stored && <details><summary>{t('course.curriculum.retained')}</summary><p>{stored.modelId} · {stored.savedAt} · {stored.context.language}</p><p>{t('course.curriculum.historical')}</p><p>{t(stored.edited ? 'course.scriptDraft.edited' : 'course.scriptDraft.unedited')}</p><h4>{t('course.scriptDraft.notes')}</h4><pre style={{ whiteSpace: 'pre-wrap' }}>{stored.context.sourceNotes}</pre><h4>{t('course.scriptDraft.generated')}</h4>{display(stored.generated)}<h4>{t('course.scriptDraft.accepted')}</h4>{display(stored.accepted)}<ol>{stored.modules.flatMap(module => module.lessons).map(lesson => <li key={lesson.id}>{lesson.title}: {lesson.range.inMs / 1000}–{lesson.range.outMs / 1000} s</li>)}</ol></details>}
  </details>
}
