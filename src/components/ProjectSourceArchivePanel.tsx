import { useEffect, useRef, useState } from 'react'
import type { KinaouProject } from '../core/project'
import { WorkerClient } from '../core/workerClient'
import { validateSourceArchiveQuery } from '../../worker/project-source-protocol.mjs'
import { reviewProjectSourceArchive, useProjectSourceArchiveReview, readSourceArchiveTicket, forgetSourceArchiveTicket, SourceArchiveSession, type SourceArchiveReview, type SourceArchiveTicket, type SourceArchiveFeedback } from '../core/projectSourceArchive'
import type { CourseOutputWorkerProps } from './CourseOutputFileCheckPanel'
import { useUiLanguage } from './UiLanguageProvider'

export function ProjectSourceArchivePanel({ project, dirty, workerUrl = '', workerToken = '', workerConnected = false, workerCapabilities = [] }: CourseOutputWorkerProps & { project: KinaouProject; dirty: boolean }) {
  const { t } = useUiLanguage(), available = workerConnected && !!workerToken.trim() && workerCapabilities.includes('project-source-archive')
  const scope = JSON.stringify([project, dirty, workerUrl, workerToken, available]), current = useRef(scope), generation = useRef(0), mounted = useRef(true), session = useRef<SourceArchiveSession | null>(null)
  const [review, setReview] = useState<SourceArchiveReview | null>(null), [reviewScope, setReviewScope] = useState(''), [reviewing, setReviewing] = useState(false), [ack, setAck] = useState(false)
  const [pending, setPending] = useState<SourceArchiveTicket | null>(null), [ticketError, setTicketError] = useState(''), [forgetAck, setForgetAck] = useState(false)
  const [feedback, setFeedback] = useState<SourceArchiveFeedback | null>(null), [feedbackScope, setFeedbackScope] = useState('')
  if (current.current !== scope) { current.current = scope; generation.current++; session.current?.detach() }
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; session.current?.detach() } }, [])
  useEffect(() => { setReview(null); setAck(false); setFeedback(null); setReviewing(false); setForgetAck(false); loadTicket() }, [scope])
  function loadTicket() { try { setPending(readSourceArchiveTicket(window.localStorage, project.id)); setTicketError('') } catch (cause) { setPending(null); setTicketError(String(cause)) } }
  const shown = feedbackScope === scope ? feedback : null, visibleReview = reviewScope === scope ? review : null
  const ticket = pending?.query.projectId === project.id ? pending : null, busy = reviewing || shown?.phase === 'checking'
  function publish(value: SourceArchiveFeedback, baseline = scope) { if (mounted.current && current.current === baseline) { setFeedbackScope(baseline); setFeedback(value) } }
  async function prepare() {
    if (dirty || busy || ticket || ticketError) return
    const baseline = scope, revision = generation.current; setReviewing(true); setReview(null); setAck(false); setFeedback(null)
    try { const next = await reviewProjectSourceArchive(project); if (mounted.current && current.current === baseline && generation.current === revision) { setReview(next); setReviewScope(baseline) } }
    catch (cause) { if (generation.current === revision) publish({ phase: 'failed', detail: String(cause) }, baseline) }
    finally { if (mounted.current && current.current === baseline && generation.current === revision) setReviewing(false) }
  }
  function task(value: SourceArchiveTicket) {
    session.current?.detach(); const baseline = scope
    const next = new SourceArchiveSession(value, { storage: window.localStorage, client: new WorkerClient({ baseUrl: workerUrl, token: workerToken }), current: () => mounted.current && current.current === baseline && session.current === next,
      publish: value => { publish(value, baseline); if (mounted.current && current.current === baseline) loadTicket() } })
    session.current = next; return next
  }
  async function start() {
    if (!available || dirty || busy || ticket || ticketError || !visibleReview || !ack) return
    try { const request = useProjectSourceArchiveReview(project, visibleReview, ack); await task({ schemaVersion: 1, workerUrl, query: validateSourceArchiveQuery(request) }).start(request) }
    catch (cause) { publish({ phase: 'failed', detail: String(cause) }) }
  }
  async function check() { if (available && !dirty && !busy && ticket?.workerUrl === workerUrl) await task(ticket).check() }
  function forget() {
    if (!ticket || !forgetAck || busy) return
    try { forgetSourceArchiveTicket(window.localStorage, ticket); session.current?.detach(); setFeedback(null); setForgetAck(false); loadTicket() }
    catch (cause) { publish({ phase: 'failed', detail: String(cause) }) }
  }
  return <section className="card stack">
    <h3>{t('sourceArchive.heading')}</h3><p>{t('sourceArchive.help')}</p><p>{t('sourceArchive.exclusions')}</p><small>{t('sourceArchive.limits')}</small>
    {!available && <p>{t('sourceArchive.unavailable')}</p>}{dirty && <p>{t('course.saveFirst')}</p>}
    <button disabled={dirty || busy || !!ticket || !!ticketError} onClick={prepare}>{t('sourceArchive.review')}</button>
    {visibleReview && <div><p>{t('sourceArchive.summary', { assets: visibleReview.assetCount, files: visibleReview.paths.length, captions: visibleReview.inlineCaptions })}</p>
      <strong>{visibleReview.title}</strong><p>SHA-256: <code>{visibleReview.projectSha256}</code></p>
      <details><summary>{t('sourceArchive.files')}</summary><ul>{visibleReview.paths.map(uri => <li key={uri}><code>{uri}</code></li>)}</ul></details>
      <label><input type="checkbox" checked={ack} disabled={busy || !!ticket} onChange={event => setAck(event.target.checked)} />{t('sourceArchive.ack')}</label>
      <button disabled={!available || dirty || busy || !ack || !!ticket || !!ticketError} onClick={start}>{t('sourceArchive.start')}</button>
    </div>}
    {ticketError && <div role="alert">{t('sourceArchive.failed')}<details><summary>{t('common.details')}</summary>{ticketError}</details></div>}
    {ticket && <div><p>{t('sourceArchive.pending', { id: ticket.query.requestId })}</p><code>{ticket.workerUrl}</code><p>SHA-256: <code>{ticket.query.projectSha256}</code></p><p>{t('sourceArchive.recovery')}</p>
      <button disabled={!available || dirty || busy || ticket.workerUrl !== workerUrl} onClick={check}>{t('sourceArchive.check')}</button>
      <label><input type="checkbox" checked={forgetAck} disabled={busy} onChange={event => setForgetAck(event.target.checked)} />{t('sourceArchive.forgetAck')}</label><button disabled={busy || !forgetAck} onClick={forget}>{t('sourceArchive.forget')}</button>
    </div>}
    {reviewing && <p role="status">{t('sourceArchive.busy')}</p>}
    {shown && <div role={shown.phase === 'failed' || shown.phase === 'uncertain' || ['failed','interrupted','integrityFailed'].includes(shown.job?.state ?? '') ? 'alert' : 'status'}>
      {shown.job ? t(`sourceArchive.state.${shown.job.state}`) : t(shown.phase === 'checking' ? 'sourceArchive.busy' : shown.phase === 'uncertain' ? 'sourceArchive.uncertain' : 'sourceArchive.failed')}
      {shown.job?.copiedFiles !== undefined && <p>{t('sourceArchive.copied', { count: shown.job.copiedFiles })}</p>}
      {(shown.detail || shown.job?.error) && <details><summary>{t('common.details')}</summary>{shown.detail || shown.job?.error}</details>}
      {shown.job?.result && <div><code>{shown.job.result.directory}</code><p>{t('sourceArchive.result', { files: shown.job.result.files.length, bytes: shown.job.result.totalBytes, date: shown.job.result.integrityCheckedAt })}</p><p>{t('sourceArchive.restoreBoundary')}</p></div>}
    </div>}
  </section>
}
