import { useEffect, useRef, useState } from 'react'
import type { KinaouProject } from '../core/project'
import type { PersistentVersionHistory } from '../core/versioning'
import { projectCourse } from '../core/course'
import { AiEditorRequestScope } from '../core/aiEditorReview'
import { commitCourseScript, courseScriptContext, courseScriptReviewIsCurrent, courseScriptText, parseCourseScriptResult, projectCourseScriptRecords, reviewCourseScript, type CourseScriptContext, type CourseScriptProposal, type CourseScriptResult, type CourseScriptReview } from '../core/courseScriptDraft'
import { WorkerClient } from '../core/workerClient'
import type { CourseOutputWorkerProps } from './CourseOutputFileCheckPanel'
import { useUiLanguage } from './UiLanguageProvider'

export function CourseScriptDraftPanel({ project, lessonId, dirty, history, onProjectChange, onSaved, workerUrl = '', workerToken = '', workerConnected = false, workerCapabilities = [] }: CourseOutputWorkerProps & { project: KinaouProject; lessonId: string; dirty: boolean; history: PersistentVersionHistory; onProjectChange: (project: KinaouProject) => void; onSaved: (project: KinaouProject) => void }) {
  const { t, language } = useUiLanguage(), [notes, setNotes] = useState(''), [model, setModel] = useState('')
  const [models, setModels] = useState<{ connection: string; ids: string[] } | null>(null)
  const [generated, setGenerated] = useState<{ context: CourseScriptContext; result: CourseScriptResult; current: () => boolean } | null>(null)
  const [draft, setDraft] = useState<CourseScriptProposal | null>(null), [review, setReview] = useState<CourseScriptReview | null>(null), [ack, setAck] = useState(false)
  const [pending, setPending] = useState<{ current: () => boolean } | null>(null), [feedback, setFeedback] = useState<'saved' | 'models' | 'none' | 'failed' | null>(null), [error, setError] = useState('')
  const available = workerConnected && !!workerToken.trim() && workerCapabilities.includes('course-script'), connection = JSON.stringify([workerUrl, workerToken, available])
  const scope = useRef(new AiEditorRequestScope()), flight = useRef<(() => boolean) | null>(null)
  scope.current.update(JSON.stringify([project, lessonId, dirty, connection, notes, model, language]))
  useEffect(() => { scope.current.attach(); return () => scope.current.detach() }, [])
  if (review) courseScriptReviewIsCurrent(project, review, dirty)
  const busy = !!pending?.current(), fresh = !!generated?.current(), currentReview = fresh && !!review && courseScriptReviewIsCurrent(project, review, dirty)
  const installed = models?.connection === connection ? models.ids : []
  let course: ReturnType<typeof projectCourse> = null, stored: ReturnType<typeof projectCourseScriptRecords>[number] | undefined, invalid = ''
  try { course = projectCourse(project); stored = projectCourseScriptRecords(project).find(item => item.context.courseId === course?.id && item.context.lessonId === lessonId) } catch (cause) { invalid = String(cause) }
  const lesson = course?.modules.flatMap(module => module.lessons).find(item => item.id === lessonId)
  function clearReview() { setReview(null); setAck(false); setFeedback(null); setError('') }
  async function request(kind: 'models' | 'draft') {
    if (!available || dirty || invalid || !lesson || busy || flight.current?.()) return
    if (kind === 'draft' && (!notes.trim() || !installed.includes(model))) return
    clearReview(); const current = scope.current.begin(); flight.current = current; setPending({ current })
    if (kind === 'draft') { setGenerated(null); setDraft(null) }
    try {
      const client = new WorkerClient({ baseUrl: workerUrl, token: workerToken })
      if (kind === 'models') { const items = await client.listLocalModels(); if (current()) { setModels({ connection, ids: items.map(item => item.id) }); setModel(items[0]?.id ?? ''); setFeedback(items.length ? 'models' : 'none') } }
      else { const context = courseScriptContext(project, lessonId, notes), result = parseCourseScriptResult(context, await client.generateCourseScript(model, context), model); if (current()) { setGenerated({ context, result, current }); setDraft(structuredClone(result.proposal)) } }
    } catch (cause) { if (current()) { setFeedback('failed'); setError(String(cause)) } }
    finally { if (current()) setPending(null); if (flight.current === current) flight.current = null }
  }
  function inspect() { clearReview(); if (!fresh || !generated || !draft || dirty) return; try { setReview(reviewCourseScript(project, generated.context, generated.result, draft)) } catch (cause) { setFeedback('failed'); setError(String(cause)) } }
  function save() {
    if (!currentReview || !review || !ack) return
    try { const next = commitCourseScript(project, review, ack, { snapshot: value => { history.snapshot(value, 'Before applying lesson script draft', 'system') }, persist: onProjectChange }); onSaved(next); setReview(null); setAck(false); setGenerated(null); setDraft(null); setFeedback('saved'); setError('') }
    catch (cause) { setFeedback('failed'); setError(String(cause)) }
  }
  return <details className="card stack courseDraft"><summary>{t('course.scriptDraft.heading')}</summary>
    <p>{t('course.scriptDraft.help')}</p><p className="note">{t('course.scriptDraft.boundary')}</p>
    {!available && <p>{t('course.scriptDraft.unavailable')}</p>}{dirty && <p>{t('course.saveFirst')}</p>}{invalid && <p role="alert">{t('course.scriptDraft.invalid')}<code>{invalid}</code></p>}
    <label>{t('course.scriptDraft.notes')}<textarea rows={6} maxLength={12000} value={notes} onChange={event => { setNotes(event.target.value); clearReview() }} /></label>
    <button disabled={!available || dirty || !lesson || !!invalid || busy} onClick={() => request('models')}>{t('course.scriptDraft.discover')}</button>
    <label>{t('course.scriptDraft.model')}<select value={installed.includes(model) ? model : ''} disabled={busy} onChange={event => { setModel(event.target.value); clearReview() }}><option value="">{t('course.scriptDraft.choose')}</option>{installed.map(id => <option key={id} value={id}>{id}</option>)}</select></label>
    <button disabled={!available || dirty || !!invalid || !lesson || busy || !notes.trim() || !installed.includes(model)} onClick={() => request('draft')}>{t('course.scriptDraft.generate')}</button>
    {busy && <p role="status">{t('course.scriptDraft.busy')}</p>}{(generated && !fresh || pending && !busy) && <p role="status">{t('course.scriptDraft.stale')}</p>}
    {generated && draft && <section className="stack"><p>{t('course.scriptDraft.origin', { model: generated.result.modelId, language: generated.context.language })}</p><h4>{t('course.scriptDraft.previous')}</h4><pre style={{ whiteSpace: 'pre-wrap' }}>{lesson?.script || t('course.scriptDraft.empty')}</pre><h4>{t('course.scriptDraft.proposed')}</h4>
      {draft.paragraphs.map((paragraph, index) => <div key={index} className="stack"><label>{t('course.scriptDraft.paragraph', { number: index + 1 })}<textarea rows={4} maxLength={1500} value={paragraph.text} disabled={!fresh || dirty} onChange={event => { clearReview(); setDraft({ paragraphs: draft.paragraphs.map((item, at) => at === index ? { ...item, text: event.target.value } : item) }) }} /></label><blockquote>{paragraph.sourceQuote}</blockquote></div>)}
      <p>{t('course.scriptDraft.quotes')}</p><button disabled={!fresh || dirty} onClick={inspect}>{t('course.scriptDraft.review')}</button>
    </section>}
    {review && <section className="stack"><h4>{t('course.scriptDraft.final')}</h4><pre style={{ whiteSpace: 'pre-wrap' }}>{review.script}</pre>{!currentReview && <p role="alert">{t('course.scriptDraft.stale')}</p>}<label><input type="checkbox" checked={ack && currentReview} disabled={!currentReview} onChange={event => setAck(event.target.checked)} />{t('course.scriptDraft.ack')}</label><button disabled={!currentReview || !ack} onClick={save}>{t('course.scriptDraft.save')}</button></section>}
    {feedback && <p role={feedback === 'failed' ? 'alert' : 'status'}>{t(`course.scriptDraft.${feedback}`)}{error && <code>{error}</code>}</p>}
    {stored && <details><summary>{t('course.scriptDraft.retained')}</summary><p>{stored.modelId} · {stored.adapterId} · {stored.savedAt} · {stored.context.language}</p><p>{t(stored.edited ? 'course.scriptDraft.edited' : 'course.scriptDraft.unedited')}</p><p>{t('course.scriptDraft.historical')}</p><h4>{t('course.scriptDraft.notes')}</h4><pre style={{ whiteSpace: 'pre-wrap' }}>{stored.context.sourceNotes}</pre><h4>{t('course.scriptDraft.previous')}</h4><pre style={{ whiteSpace: 'pre-wrap' }}>{stored.previousScript}</pre><h4>{t('course.scriptDraft.generated')}</h4>{stored.generated.paragraphs.map((paragraph, index) => <div key={index}><p style={{ whiteSpace: 'pre-wrap' }}>{paragraph.text}</p><blockquote>{paragraph.sourceQuote}</blockquote></div>)}<h4>{t('course.scriptDraft.accepted')}</h4><pre style={{ whiteSpace: 'pre-wrap' }}>{courseScriptText(stored.accepted)}</pre></details>}
  </details>
}
