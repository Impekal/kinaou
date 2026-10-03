import { useEffect, useRef, useState } from 'react'
import type { KinaouProject } from '../core/project'
import { retainedSearchTrends, type RetainedSearchTrend } from '../core/searchTrends'
import { PublicSourceReadSession } from '../core/publicSourceReader'
import { WorkerClient } from '../core/workerClient'
import { publicSourceUrl, type PublicSourceResult } from '../../worker/public-source-protocol.mjs'
import type { CourseOutputWorkerProps } from './CourseOutputFileCheckPanel'
import { useUiLanguage } from './UiLanguageProvider'

export function PublicSourceReader({ project, source, workerUrl = '', workerToken = '', workerConnected = false, workerCapabilities = [] }: CourseOutputWorkerProps & { project: KinaouProject; source: RetainedSearchTrend }) {
  const { t, language } = useUiLanguage(), [selected, setSelected] = useState(''), [result, setResult] = useState<PublicSourceResult | null>(null), [busy,setBusy] = useState(false), [error,setError] = useState('')
  const session = useRef<PublicSourceReadSession | null>(null)
  let validSource = false
  try { validSource = retainedSearchTrends(project).some(item => JSON.stringify(item) === JSON.stringify(source)) } catch { /* Invalid source ledgers must not initiate retrieval. */ }
  const articles = source.items[0].articles.filter((article,index,all) => all.findIndex(item => item.url === article.url) === index)
  const article = articles.find(item => item.url === selected)
  let supported = false
  try { if (article) { publicSourceUrl(article.url); supported = true } } catch { /* Original links remain separately accessible. */ }
  const available = validSource && workerConnected && !!workerToken.trim() && workerCapabilities.includes('public-source-reader')
  const scope = JSON.stringify([project, source, selected, workerUrl, workerToken, available, language])
  session.current?.observe(scope)
  useEffect(() => () => session.current?.detach(), [])
  const stale = !!session.current && !session.current.current
  async function read() {
    if (!available || !supported || !article || (busy && !stale)) return
    session.current?.detach()
    const next = new PublicSourceReadSession(scope,article.url); session.current = next
    setResult(null);setError('');setBusy(true)
    await next.load(() => new WorkerClient({baseUrl:workerUrl,token:workerToken}).readPublicSource({url:article.url}), value => {setResult(value);setBusy(false)}, cause => {setError(String(cause));setBusy(false)})
  }
  function clear() { session.current?.detach(); session.current = null; setResult(null);setError('');setBusy(false) }
  return <section className="publicSourceReader stack" aria-label={t('sourceReader.heading')}>
    <h4>{t('sourceReader.heading')}</h4><p>{t('sourceReader.help')}</p><p className="note">{t('sourceReader.boundary')}</p>
    <label>{t('sourceReader.choose')}<select value={selected} onChange={event => {clear();setSelected(event.target.value)}}><option value="">—</option>{articles.map(item => <option key={item.url} value={item.url}>{item.title} — {item.source}</option>)}</select></label>
    {article && <a href={article.url} target="_blank" rel="noopener noreferrer">{article.url}</a>}
    <div className="publicSourceActions"><button className="primary" disabled={!available || !supported || (busy && !stale)} onClick={read}>{t('sourceReader.read')}</button><button className="secondaryButton" disabled={!session.current} onClick={clear}>{t('sourceReader.clear')}</button></div>
    {!available && <p>{t('sourceReader.unavailable')}</p>}{article && !supported && <p>{t('sourceReader.unsupported')}</p>}
    {stale ? <p role="status">{t('sourceReader.stale')}</p> : <>
      {busy && <p role="status">{t('sourceReader.busy')}</p>}
      {error && <div role="alert">{t('sourceReader.failed')}<details><summary>{t('common.details')}</summary>{error}</details></div>}
      {result && <div className="stack"><h4>{result.title || t('sourceReader.noTitle')}</h4><p>{t('sourceReader.received', {date:result.retrievedAt,bytes:result.htmlBytes})}</p><p>{t('sourceReader.language', {language:result.declaredLanguage ?? '—'})}</p>
        <p>{t('sourceReader.mode', {mode:result.extraction})}</p><a href={result.finalUrl} target="_blank" rel="noopener noreferrer">{result.finalUrl}</a>
        {!!result.redirectUrls.length && <details><summary>{t('sourceReader.redirects')}</summary><ol>{result.redirectUrls.map(url => <li key={url}>{url}</li>)}</ol></details>}
        <p>{result.truncated ? t('sourceReader.truncated') : t('sourceReader.incomplete')}</p>
        <div className="publicSourceText" tabIndex={0} aria-label={t('sourceReader.text')}>{result.text}</div>
        <details><summary>{t('sourceReader.provenance')}</summary><p>{t('sourceReader.digest')}</p><code>SHA-256: {result.htmlSha256}</code></details>
      </div>}
    </>}
  </section>
}
