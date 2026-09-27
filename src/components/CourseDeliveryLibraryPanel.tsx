import { useEffect, useRef, useState } from 'react'
import { DeliveryLibrarySession, type DeliveryLibraryFeedback, type DeliveryLibraryPage } from '../core/courseDeliveryLibrary'
import { WorkerClient } from '../core/workerClient'
import type { KinaouProject } from '../core/project'
import type { CourseOutputWorkerProps } from './CourseOutputFileCheckPanel'
import { useUiLanguage } from './UiLanguageProvider'

export function CourseDeliveryLibraryPanel({ project, dirty, workerUrl = '', workerToken = '', workerConnected = false, workerCapabilities = [] }: CourseOutputWorkerProps & { project: KinaouProject; dirty: boolean }) {
  const { t } = useUiLanguage()
  const available = workerConnected && !!workerToken.trim() && workerCapabilities.includes('course-delivery-library')
  const scope = JSON.stringify([project, dirty, workerUrl, workerToken, available]), current = useRef(scope), mounted = useRef(true), session = useRef<DeliveryLibrarySession | null>(null)
  const [page, setPage] = useState<DeliveryLibraryPage | null>(null), [pageScope, setPageScope] = useState(''), [selected, setSelected] = useState('')
  const [feedback, setFeedback] = useState<DeliveryLibraryFeedback | null>(null), [feedbackScope, setFeedbackScope] = useState('')
  if (current.current !== scope) { current.current = scope; session.current?.detach() }
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; session.current?.detach() } }, [])
  useEffect(() => { setPage(null); setSelected(''); setFeedback(null) }, [scope])
  const visiblePage = pageScope === scope ? page : null, shown = feedbackScope === scope ? feedback : null
  const busy = shown?.phase === 'listing' || shown?.phase === 'checking', entry = visiblePage?.entries.find(entry => entry.requestId === selected), result = shown?.job?.result
  function task() {
    session.current?.detach(); const baseline = current.current
    const next = new DeliveryLibrarySession(project.id, {
      client: new WorkerClient({ baseUrl: workerUrl, token: workerToken }), current: () => mounted.current && current.current === baseline && session.current === next,
      publish: value => {
        if (!mounted.current || session.current !== next || current.current !== baseline) return
        setFeedbackScope(baseline); setFeedback(value)
        if (value.page) { setPageScope(baseline); setPage(value.page) }
      }
    }); session.current = next; return next
  }
  async function list(after?: string) {
    if (!available || dirty || busy) return
    setPage(null); setSelected(''); await task().list(after)
  }
  async function inspect() { if (available && !dirty && !busy && entry) await task().inspect(entry.requestId) }
  return <section className="card stack">
    <h3>{t('course.library.heading')}</h3><p>{t('course.library.help')}</p><p>{t('course.library.boundary')}</p>
    {!available && <p>{t('course.library.unavailable')}</p>}{dirty && <p>{t('course.saveFirst')}</p>}
    <button disabled={!available || dirty || busy} onClick={() => list()}>{t('course.library.load')}</button>
    {visiblePage && <>
      <p>{t('course.library.page', { count: visiblePage.entries.length, scanned: visiblePage.scanned, skipped: visiblePage.skipped })}</p>
      {!visiblePage.entries.length && <p>{t('course.library.empty')}</p>}
      <label>{t('course.library.select')}<select value={entry ? selected : ''} disabled={busy || dirty} onChange={event => { session.current?.detach(); setSelected(event.target.value); setFeedback(null) }}>
        <option value="">{t('course.library.choose')}</option>{visiblePage.entries.map(item => <option key={item.requestId} value={item.requestId}>{item.courseLesson.courseTitle} / {item.courseLesson.moduleTitle} / {item.courseLesson.lessonTitle} · {item.requestId}</option>)}
      </select></label>
      {entry && <><p>{t(entry.hasCompletionRecord ? 'course.library.recorded' : 'course.library.incomplete')}</p><code>{entry.sourcePath}</code><p>{t('course.library.context', { revision: entry.courseLesson.outlineRevision, language: entry.courseLesson.language, files: entry.materialFiles })}</p>{entry.hasSubtitles && <p>{t('course.library.subtitles')}</p>}</>}
      <button disabled={!available || dirty || busy || !entry} onClick={inspect}>{t('course.library.inspect')}</button>
      {visiblePage.nextCursor && <button disabled={!available || dirty || busy} onClick={() => list(visiblePage.nextCursor)}>{t('course.library.next')}</button>}
    </>}
    {shown && shown.phase !== 'page' && <div role={shown.phase === 'failed' || ['failed','integrityFailed','unknown','interrupted'].includes(shown.job?.state ?? '') ? 'alert' : 'status'}>
      {shown.job ? t(shown.job.state === 'ready' ? 'course.library.verified' : `course.delivery.state.${shown.job.state}`) : t(shown.phase === 'failed' ? 'course.library.failed' : 'course.library.busy')}
      {(shown.detail || shown.job?.error) && <details><summary>{t('common.details')}</summary>{shown.detail || shown.job?.error}</details>}
    </div>}
    {result && <div><p>{t('course.delivery.result')}</p><code>{result.directory}</code><p>SHA-256: <code>{result.sha256}</code></p><p>{t('course.delivery.checked', { time: result.integrityCheckedAt, size: result.sizeBytes })}</p>{result.files && <ul>{result.files.map(file => <li key={file.path}><code>{file.path}</code> · {file.sizeBytes} · SHA-256: <code>{file.sha256}</code></li>)}</ul>}</div>}
  </section>
}
