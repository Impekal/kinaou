import { useEffect, useState } from 'react'
import { clearCourseOutputIndex, forgetCourseOutputReference, projectCourseOutputIndex, projectExportHistory, retainRecentCourseOutputs, type ExportReceipt } from '../core/exportHistory'
import { courseOutputState } from '../core/courseOutputState'
import type { KinaouProject } from '../core/project'
import type { PersistentVersionHistory } from '../core/versioning'
import { useUiLanguage } from './UiLanguageProvider'

export function CourseOutputIndexPanel({ project, dirty, history, onProjectChange }: {
  project: KinaouProject; dirty: boolean; history: PersistentVersionHistory; onProjectChange: (next: KinaouProject) => void
}) {
  const { t, language } = useUiLanguage()
  const [confirm, setConfirm] = useState(false), [page, setPage] = useState(0)
  const [feedback, setFeedback] = useState<{ project: KinaouProject; kind: 'saved' | 'unchanged' | 'failed'; error?: string } | null>(null)
  useEffect(() => { setConfirm(false); setPage(0) }, [project, dirty])
  let receipts: ExportReceipt[] = [], invalid = ''
  try { receipts = projectCourseOutputIndex(project) } catch (cause) { invalid = String(cause) }
  const recent = projectExportHistory(project).filter(receipt => receipt.courseLesson)
  function commit(action: (value: KinaouProject) => KinaouProject) {
    if (dirty) return
    try {
      const next = action(project)
      if (next === project) { setFeedback({ project, kind: 'unchanged' }); return }
      history.snapshot(project, 'Before changing retained lesson outputs', 'system')
      onProjectChange(next)
      setFeedback({ project: next, kind: 'saved' }); setConfirm(false)
    } catch (cause) { setFeedback({ project, kind: 'failed', error: String(cause) }) }
  }
  const shown = feedback?.project === project ? feedback : null
  return <section className="card stack">
    <h3>{t('course.outputs.heading')}</h3><p>{t('course.outputs.help')}</p>
    {dirty && <small>{t('course.saveFirst')}</small>}
    {invalid ? <div role="alert" className="errorBox">{t('course.outputs.invalid')}<details><summary>{t('common.details')}</summary>{invalid}</details></div>
      : <p>{t('course.outputs.count', { count: receipts.length })}</p>}
    <p>{t('course.outputs.importHelp')}</p>
    <button disabled={dirty || !!invalid || !recent.length} onClick={() => commit(retainRecentCourseOutputs)}>{t('course.outputs.import')}</button>
    {!invalid && !receipts.length && <p>{t('course.outputs.empty')}</p>}
    {receipts.slice(page * 25, (page + 1) * 25).map(receipt => <details key={receipt.jobId}>
      <summary>{receipt.courseLesson!.courseTitle} / {receipt.courseLesson!.moduleTitle} / {receipt.courseLesson!.lessonTitle} · {t(`export.${receipt.format}`)} · {new Date(receipt.completedAt).toLocaleString(language)}</summary>
      <p>{t(`course.outputs.state.${courseOutputState(project, receipt)}`)}</p>
      <code>{receipt.outputRelativePath}</code>
      <p>{(receipt.range.inMs / 1000).toLocaleString(language)}–{(receipt.range.outMs / 1000).toLocaleString(language)} s · {t('exports.course', { course: receipt.courseLesson!.courseTitle, module: receipt.courseLesson!.moduleTitle, lesson: receipt.courseLesson!.lessonTitle, revision: receipt.courseLesson!.outlineRevision, language: receipt.courseLesson!.language })}</p>
      <button disabled={dirty} onClick={() => commit(value => forgetCourseOutputReference(value, receipt.jobId))}>{t('course.outputs.forget')}</button>
    </details>)}
    {receipts.length > 25 && <div className="directorActions"><button disabled={page === 0} onClick={() => setPage(page - 1)}>{t('course.outputs.previous')}</button><button disabled={(page + 1) * 25 >= receipts.length} onClick={() => setPage(page + 1)}>{t('course.outputs.next')}</button></div>}
    <button disabled={dirty || project.metadata.courseOutputIndex === undefined} onClick={() => setConfirm(true)}>{t('course.outputs.clear')}</button>
    {confirm && <div role="alert"><p>{t('course.outputs.confirm')}</p><button disabled={dirty} onClick={() => commit(clearCourseOutputIndex)}>{t('course.outputs.confirmButton')}</button><button onClick={() => setConfirm(false)}>{t('course.outputs.cancel')}</button></div>}
    {shown && <div role={shown.kind === 'failed' ? 'alert' : 'status'}>{t(`course.outputs.${shown.kind}`)}{shown.error && <details><summary>{t('common.details')}</summary>{shown.error}</details>}</div>}
  </section>
}
