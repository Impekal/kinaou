import { useEffect, useRef, useState } from 'react'
import { CollectionLibrarySession, type CollectionLibraryFeedback, type CollectionLibraryPage } from '../core/courseCollectionLibrary'
import { WorkerClient } from '../core/workerClient'
import type { KinaouProject } from '../core/project'
import type { CourseOutputWorkerProps } from './CourseOutputFileCheckPanel'
import { useUiLanguage } from './UiLanguageProvider'
export function CourseCollectionLibraryPanel({ project, dirty, workerUrl = '', workerToken = '', workerConnected = false, workerCapabilities = [] }: CourseOutputWorkerProps & { project: KinaouProject; dirty: boolean }) {
  const { t } = useUiLanguage(), available = workerConnected && !!workerToken.trim() && workerCapabilities.includes('course-collection-library')
  const scope = JSON.stringify([project, dirty, workerUrl, workerToken, available]), current = useRef(scope), mounted = useRef(true), session = useRef<CollectionLibrarySession | null>(null)
  const [page, setPage] = useState<CollectionLibraryPage | null>(null), [pageScope, setPageScope] = useState(''), [selected, setSelected] = useState('')
  const [feedback, setFeedback] = useState<CollectionLibraryFeedback | null>(null), [feedbackScope, setFeedbackScope] = useState('')
  if (current.current !== scope) { current.current = scope; session.current?.detach() }
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; session.current?.detach() } }, [])
  useEffect(() => { setPage(null); setSelected(''); setFeedback(null) }, [scope])
  const visiblePage = pageScope === scope ? page : null, shown = feedbackScope === scope ? feedback : null
  const busy = shown?.phase === 'listing' || shown?.phase === 'checking', entry = visiblePage?.entries.find(item => item.requestId === selected), result = shown?.job?.result
  function task() {
    session.current?.detach(); const baseline = scope
    const next = new CollectionLibrarySession(project.id, { client: new WorkerClient({ baseUrl: workerUrl, token: workerToken }), current: () => mounted.current && current.current === baseline && session.current === next,
      publish: value => { if (!mounted.current || current.current !== baseline || session.current !== next) return; setFeedbackScope(baseline); setFeedback(value); if (value.page) { setPageScope(baseline); setPage(value.page) } } })
    session.current = next; return next
  }
  async function list(after?: string) { if (!available || dirty || busy) return; setPage(null); setSelected(''); await task().list(after) }
  async function inspect() { if (available && !dirty && !busy && entry) await task().inspect(entry.requestId) }
  return <section className="card stack">
    <h3>{t('course.collections.heading')}</h3><p>{t('course.collections.help')}</p><p>{t('course.collections.boundary')}</p>
    {!available && <p>{t('course.collections.unavailable')}</p>}{dirty && <p>{t('course.saveFirst')}</p>}
    <button disabled={!available || dirty || busy} onClick={() => list()}>{t('course.collections.load')}</button>
    {visiblePage && <>
      <p>{t('course.library.page', { count: visiblePage.entries.length, scanned: visiblePage.scanned, skipped: visiblePage.skipped })}</p>
      {!visiblePage.entries.length && <p>{t('course.collections.empty')}</p>}
      <label>{t('course.collections.select')}<select value={entry ? selected : ''} disabled={busy || dirty} onChange={event => { session.current?.detach(); setSelected(event.target.value); setFeedback(null) }}>
        <option value="">{t('course.collections.choose')}</option>{visiblePage.entries.map(item => <option key={item.requestId} value={item.requestId}>{item.course.title} · {item.requestId}</option>)}
      </select></label>
      {entry && <><p>{t(entry.hasCompletionRecord ? 'course.library.recorded' : 'course.library.incomplete')}</p><p>{t('course.collections.context', { revision: entry.course.outlineRevision, language: entry.course.language, selected: entry.selectedLessons, total: entry.course.lessonCount })}</p></>}
      <button disabled={!available || dirty || busy || !entry} onClick={inspect}>{t('course.collections.inspect')}</button>
      {visiblePage.nextCursor && <button disabled={!available || dirty || busy} onClick={() => list(visiblePage.nextCursor)}>{t('course.library.next')}</button>}
    </>}
    {shown && shown.phase !== 'page' && <div role={shown.phase === 'failed' || ['failed','integrityFailed','interrupted','unknown'].includes(shown.job?.state ?? '') ? 'alert' : 'status'}>
      {shown.job ? t(shown.job.state === 'ready' ? 'course.collections.verified' : `course.collection.state.${shown.job.state}`) : t(shown.phase === 'failed' ? 'course.collection.failed' : 'course.collection.busy')}
      {(shown.detail || shown.job?.error) && <details><summary>{t('common.details')}</summary>{shown.detail || shown.job?.error}</details>}
      {shown.job?.completedLessons !== undefined && <p>{shown.job.completedLessons} / {shown.job.request.lessons.length}</p>}
    </div>}
    {result && <div><code>{result.directory}</code><p>{result.integrityCheckedAt} · {result.totalMediaBytes}</p><ol>{result.lessons.map((lesson, index) => <li key={lesson.sourceRequestId}>{shown!.job!.request.lessons[index].moduleTitle} / {shown!.job!.request.lessons[index].lessonTitle}<p><code>{lesson.mediaPath}</code></p><p>SHA-256: <code>{lesson.sha256}</code></p></li>)}</ol></div>}
  </section>
}
