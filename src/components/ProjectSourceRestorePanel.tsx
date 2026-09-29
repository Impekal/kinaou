import { useEffect, useRef, useState } from 'react'
import type { SourceArchiveJob } from '../../worker/project-source-protocol.mjs'
import { restoreDirectory } from '../../worker/project-source-restore-protocol.mjs'
import { prepareSourceRestore, sourceRestoreScope, readSourceRestoreTicket, retainSourceRestoreTicket, forgetSourceRestoreTicket, SourceRestoreSession, type SourceRestoreRequest, type SourceRestoreFeedback } from '../core/projectSourceRestore'
import { WorkerClient } from '../core/workerClient'
import { useUiLanguage } from './UiLanguageProvider'
interface Props { workerUrl: string; workerToken: string; workerConnected: boolean; workerCapabilities: string[]; managedRoots: string[]; verified?: SourceArchiveJob }
export function ProjectSourceRestorePanel(props: Props) {
  // Every observed source/connection change invalidates review and late callbacks, while the durable ticket remains scoped to storage.
  const identity = JSON.stringify([props.workerUrl, props.workerToken, props.workerConnected, props.workerCapabilities.includes('project-source-restore'), props.managedRoots, props.verified])
  return <RestoreView key={identity} {...props} />
}
function RestoreView({ workerUrl, workerToken, workerConnected, workerCapabilities, managedRoots, verified }: Props) {
  const { t, language } = useUiLanguage()
  const [initial] = useState(() => { try { const scope = sourceRestoreScope(workerUrl, managedRoots); return { scope, ticket: typeof window === 'undefined' ? null : readSourceRestoreTicket(window.localStorage, scope) } } catch (cause) { return { scope: '', ticket: null, error: String(cause) } } })
  const [ticket, setTicket] = useState<SourceRestoreRequest | null>(initial.ticket), [error, setError] = useState(initial.error ?? ''), [ack, setAck] = useState(false), [forgetAck, setForgetAck] = useState(false), [feedback, setFeedback] = useState<SourceRestoreFeedback | null>(null), [busy, setBusy] = useState(false)
  const mounted = useRef(true), flight = useRef(false), session = useRef<SourceRestoreSession | null>(null)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; session.current?.detach() } }, [])
  const available = workerConnected && !!workerToken.trim() && workerCapabilities.includes('project-source-restore') && !!initial.scope
  const result = feedback?.job?.result, state = feedback?.job?.state
  function task(request: SourceRestoreRequest) {
    session.current?.detach()
    const next = new SourceRestoreSession(request, { scope: initial.scope, storage: window.localStorage, current: () => mounted.current && session.current === next,
      client: new WorkerClient({ baseUrl: workerUrl, token: workerToken }), publish: value => { if (mounted.current && session.current === next) setFeedback(value) } })
    session.current = next; return next
  }
  async function run(mode: 'create' | 'check' | 'retry') {
    if (!available || flight.current || (mode !== 'check' && !ack) || (mode === 'retry' && state !== 'unknown')) return
    flight.current = true; setBusy(true); setError('')
    try {
      let request = ticket
      if (mode === 'create') {
        if (ticket || verified?.state !== 'ready') throw Error('Verify an archive and resolve previous reminders first')
        request = await prepareSourceRestore(verified, language, ack)
        if (!mounted.current) return
        retainSourceRestoreTicket(window.localStorage, initial.scope, request); setTicket(request)
      }
      if (!request) throw Error('No retained restoration job')
      await task(request).run(mode !== 'check')
    } catch (cause) {
      if (mounted.current) {
        setError(String(cause))
        // A storage write may have succeeded before readback failed. Never hide its surviving reminder.
        try { setTicket(readSourceRestoreTicket(window.localStorage, initial.scope)) } catch { /* Keep error; do not overwrite corrupt storage. */ }
      }
    } finally { flight.current = false; if (mounted.current) setBusy(false) }
  }
  function forget() {
    if (!ticket || !forgetAck || busy || !state || ['queued','copying'].includes(state)) return
    try { forgetSourceRestoreTicket(window.localStorage, initial.scope, ticket); session.current?.detach(); setTicket(null); setFeedback(null); setAck(false); setForgetAck(false); setError('') }
    catch (cause) { setError(String(cause)) }
  }
  return <section className="stack sourceRestore" aria-label={t('sourceRestore.heading')}>
    <h4>{t('sourceRestore.heading')}</h4><p>{t('sourceRestore.help')}</p>
    {!ticket && verified?.result && <p>{verified.result.projectTitle} · {t('sourceLibrary.result', { files: verified.result.files.length, bytes: verified.result.totalBytes, date: verified.result.integrityCheckedAt })}</p>}
    {(!available || (!ticket && verified?.state !== 'ready')) && <p>{t('sourceRestore.unavailable')}</p>}
    {(!ticket || state === 'unknown') && <label><input type="checkbox" checked={ack} disabled={busy || !available} onChange={event => setAck(event.target.checked)} />{t('sourceRestore.ack')}</label>}
    {!ticket && <button className="secondaryButton" disabled={!available || busy || !ack || verified?.state !== 'ready' || !!initial.error} onClick={() => void run('create')}>{t('sourceRestore.start')}</button>}
    {ticket && <><p>{t('sourceRestore.ticket', { id: ticket.restoreId })}</p><p>{t('sourceLibrary.projectId')}: <code>{ticket.source.projectId}</code> · SHA-256: <code>{ticket.source.projectSha256}</code></p><code>{restoreDirectory(ticket.restoreId)}</code>
      <button className="secondaryButton" disabled={!available || busy} onClick={() => void run('check')}>{t('sourceRestore.check')}</button>
      {state === 'unknown' && <button className="secondaryButton" disabled={!available || busy || !ack} onClick={() => void run('retry')}>{t('sourceRestore.retry')}</button>}
    </>}
    {busy && <p role="status">{t('sourceRestore.busy')}</p>}
    {error && <div role="alert">{t('sourceRestore.error')}<details><summary>{t('common.details')}</summary>{error}</details></div>}
    {feedback && feedback.phase !== 'checking' && <div role={feedback.phase === 'uncertain' || ['failed','interrupted','integrityFailed'].includes(state ?? '') ? 'alert' : 'status'}>
      {state ? t(`sourceRestore.state.${state}`) : t('sourceRestore.uncertain')}
      {(feedback.detail || feedback.job?.error) && <details><summary>{t('common.details')}</summary>{feedback.detail || feedback.job?.error}</details>}
    </div>}
    {result && <div><h4>{result.projectTitle}</h4><p>{t('sourceLibrary.result', { files: result.files.length, bytes: result.totalBytes, date: result.integrityCheckedAt })}</p><p>{t('sourceRestore.root')}<br /><code>{result.managedRoot}</code></p><code>{result.projectPath}</code><p>{t('sourceRestore.next')}</p></div>}
    {ticket && state && !['queued','copying'].includes(state) && <><label><input type="checkbox" checked={forgetAck} disabled={busy} onChange={event => setForgetAck(event.target.checked)} />{t('sourceRestore.forgetAck')}</label><button className="secondaryButton" disabled={busy || !forgetAck} onClick={forget}>{t('sourceRestore.forget')}</button></>}
  </section>
}
