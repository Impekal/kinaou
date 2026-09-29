import { useEffect, useRef, useState } from 'react'
import { SourceLibrarySession, type SourceLibraryFeedback, type SourceLibraryPage } from '../core/projectSourceLibrary'
import { WorkerClient } from '../core/workerClient'
import { useUiLanguage } from './UiLanguageProvider'
import { ProjectSourceRestorePanel } from './ProjectSourceRestorePanel'
interface Props { workerUrl: string; workerToken: string; workerConnected: boolean; workerCapabilities: string[]; managedRoots: string[] }
export function ProjectSourceArchiveLibraryPanel(props: Props) {
  const identity = JSON.stringify([props.workerUrl, props.workerToken, props.workerConnected, props.workerCapabilities.includes('project-source-library'), props.managedRoots])
  return <SourceLibraryView key={identity} {...props} />
}
function SourceLibraryView({ workerUrl, workerToken, workerConnected, workerCapabilities, managedRoots }: Props) {
  const { t } = useUiLanguage(), available = workerConnected && !!workerToken.trim() && workerCapabilities.includes('project-source-library')
  const [page, setPage] = useState<SourceLibraryPage | null>(null), [selected, setSelected] = useState(''), [feedback, setFeedback] = useState<SourceLibraryFeedback | null>(null)
  const mounted = useRef(true), session = useRef<SourceLibrarySession | null>(null), inFlight = useRef(false)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; session.current?.detach() } }, [])
  const busy = feedback?.phase === 'listing' || feedback?.phase === 'checking', entry = page?.entries.find(item => item.query.requestId === selected), result = feedback?.job?.result
  function task() {
    session.current?.detach()
    const next = new SourceLibrarySession({ client: new WorkerClient({ baseUrl: workerUrl, token: workerToken }), current: () => mounted.current && session.current === next,
      publish: value => { if (mounted.current && session.current === next) { setFeedback(value); if (value.page) setPage(value.page) } } })
    session.current = next; return next
  }
  async function list(after?: string) {
    if (!available || busy || inFlight.current) return
    inFlight.current = true; setPage(null); setSelected(''); setFeedback(null)
    try { await task().list(after) } finally { inFlight.current = false }
  }
  async function inspect() {
    if (!available || busy || inFlight.current || !entry) return
    inFlight.current = true
    try { await task().inspect(entry.query) } finally { inFlight.current = false }
  }
  return <section className="card stack" style={{ padding: 28, minWidth: 0 }}>
    <h3>{t('sourceLibrary.heading')}</h3><p>{t('sourceLibrary.help')}</p><p>{t('sourceLibrary.boundary')}</p>
    <details><summary>{t('sourceLibrary.root')}</summary>{managedRoots.map(root => <p key={root}><code>{root}</code></p>)}</details>
    {!available && <p>{t('sourceLibrary.unavailable')}</p>}
    <button className="secondaryButton" disabled={!available || busy} onClick={() => void list()}>{t('sourceLibrary.load')}</button>
    {page && <>
      <p>{t('sourceLibrary.page', { count: page.entries.length, scanned: page.scanned, skipped: page.skipped })}</p>
      {!page.entries.length && <p>{t('sourceLibrary.empty')}</p>}
      <label>{t('sourceLibrary.select')}<select disabled={busy} value={entry ? selected : ''} onChange={event => { session.current?.detach(); setSelected(event.target.value); setFeedback(null) }}>
        <option value="">{t('sourceLibrary.choose')}</option>{page.entries.map(item => <option key={item.query.requestId} value={item.query.requestId}>{item.titleHint ?? t('sourceLibrary.untitled')} · {item.query.requestId}</option>)}
      </select></label>
      {entry && <><p>{t(entry.hasCompletionRecord ? 'sourceLibrary.recorded' : 'sourceLibrary.incomplete')}</p><p>{t('sourceLibrary.projectId')}: <code>{entry.query.projectId}</code></p><p>SHA-256: <code>{entry.query.projectSha256}</code></p></>}
      <button className="secondaryButton" disabled={!available || busy || !entry} onClick={() => void inspect()}>{t('sourceLibrary.inspect')}</button>
      {page.nextCursor && <button className="secondaryButton" disabled={!available || busy} onClick={() => void list(page.nextCursor)}>{t('sourceLibrary.next')}</button>}
    </>}
    {feedback && feedback.phase !== 'page' && <div role={feedback.phase === 'failed' || ['failed', 'interrupted', 'integrityFailed', 'unknown'].includes(feedback.job?.state ?? '') ? 'alert' : 'status'}>
      {feedback.job ? t(feedback.job.state === 'ready' ? 'sourceLibrary.verified' : `sourceArchive.state.${feedback.job.state}`) : t(feedback.phase === 'failed' ? 'sourceLibrary.failed' : 'sourceLibrary.busy')}
      {(feedback.detail || feedback.job?.error) && <details><summary>{t('common.details')}</summary>{feedback.detail || feedback.job?.error}</details>}
      {feedback.job && ['queued', 'copying'].includes(feedback.job.state) && <p>{t('sourceLibrary.checkAgain')}</p>}
    </div>}
    {result && <div className="stack"><h4>{result.projectTitle ?? t('sourceLibrary.olderTitle')}</h4><p>{t('sourceLibrary.result', { files: result.files.length, bytes: result.totalBytes, date: result.integrityCheckedAt })}</p>
      <p>{t('sourceLibrary.projectPath')}<br /><code>{result.projectPath}</code></p><p>{t('sourceLibrary.folder')}<br /><code>{result.directory}</code></p>
      <p>{t('sourceLibrary.private')}</p><details><summary>{t('sourceLibrary.files')}</summary><ul>{result.files.map(file => <li key={file.path}><code>{file.path}</code> · {file.sizeBytes} · SHA-256: <code>{file.sha256}</code></li>)}</ul></details>
    </div>}
    <ProjectSourceRestorePanel workerUrl={workerUrl} workerToken={workerToken} workerConnected={workerConnected} workerCapabilities={workerCapabilities} managedRoots={managedRoots} verified={feedback?.job?.state === 'ready' ? feedback.job : undefined} />
  </section>
}
