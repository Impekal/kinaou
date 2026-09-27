import { useEffect, useRef, useState } from 'react'
import type { KinaouProject } from '../core/project'
import type { PersistentVersionHistory } from '../core/versioning'
import { WorkerClient } from '../core/workerClient'
import { retainedSearchTrends, retainSearchTrend, SearchTrendSession, type RetainedSearchTrend } from '../core/searchTrends'
import { searchTrendCountries, type SearchTrendCountry, type SearchTrendSnapshot, type SearchTrendItem } from '../../worker/search-trends-protocol.mjs'
import type { CourseOutputWorkerProps } from './CourseOutputFileCheckPanel'
import { useUiLanguage } from './UiLanguageProvider'
import './SearchTrendsPanel.css'
import { ResearchBriefPanel } from './ResearchBriefPanel'

export function SearchTrendsPanel({ project, history, onProjectChange, onOpenDirector, workerUrl = '', workerToken = '', workerConnected = false, workerCapabilities = [] }: CourseOutputWorkerProps & { project: KinaouProject; history: PersistentVersionHistory; onProjectChange: (project: KinaouProject) => void; onOpenDirector?: () => void }) {
  const { t } = useUiLanguage(), [country, setCountry] = useState<SearchTrendCountry>('DE')
  const available = workerConnected && !!workerToken.trim() && workerCapabilities.includes('public-search-trends')
  const scope = JSON.stringify([project.id, country, workerUrl, workerToken, available]), current = useRef(scope), session = useRef<SearchTrendSession | null>(null)
  const [result, setResult] = useState<{ scope: string; snapshot: SearchTrendSnapshot } | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState(false)
  if (current.current !== scope) { current.current = scope; session.current?.detach() }
  useEffect(() => { setResult(null); setBusy(false); setError(''); setSaved(false); return () => { session.current?.detach() } }, [scope])
  let retained: RetainedSearchTrend[] = [], ledgerError = ''
  try { retained = retainedSearchTrends(project) } catch (cause) { ledgerError = String(cause) }
  async function retrieve() {
    if (!available || busy) return
    session.current?.detach(); const next = new SearchTrendSession(); session.current = next
    setBusy(true); setError(''); setSaved(false); setResult(null)
    await next.load(() => new WorkerClient({ baseUrl: workerUrl, token: workerToken }).searchTrends({ country }),
      snapshot => { setResult({ scope, snapshot }); setBusy(false) }, cause => { setError(String(cause)); setBusy(false) })
  }
  function retain(index: number) {
    if (!result || result.scope !== current.current || ledgerError) return
    setSaved(false); setError('')
    try {
      const next = retainSearchTrend(project, result.snapshot, index)
      if (next !== project) { history.snapshot(project, 'Before retaining public search trend', 'system'); onProjectChange(next) }
      setSaved(true)
    } catch (cause) { setError(String(cause)) }
  }
  function itemView(item: SearchTrendItem) {
    return <><h4>{item.query}</h4><p>{t('research.published', { date: item.publishedAt })}</p>
      <p>{item.reportedTraffic === null ? t('research.noTraffic') : t('research.traffic', { value: item.reportedTraffic })}</p>
      {!!item.articles.length && <details><summary>{t('research.references')}</summary><ul>{item.articles.map((article, index) => <li key={index}><a href={article.url} target="_blank" rel="noopener noreferrer">{article.title}</a> — {article.source}</li>)}</ul></details>}</>
  }
  function provenance(snapshot: SearchTrendSnapshot) {
    return <details><summary>{t('research.provenance')}</summary><a href={snapshot.sourceUrl} target="_blank" rel="noopener noreferrer">Google Trends · {t(`research.${snapshot.country}`)}</a><p>{t('research.date', { date: snapshot.retrievedAt })}</p><code style={{ overflowWrap: 'anywhere' }}>SHA-256: {snapshot.feedSha256}</code></details>
  }
  const snapshot = result?.scope === scope ? result.snapshot : null
  return <section className="stack searchTrendsPanel">
    <div className="card stack"><h2>{t('research.title')}</h2><p>{t('research.help')}</p><p>{t('research.limits')}</p>
      <label>{t('research.country')}<select value={country} onChange={event => setCountry(event.target.value as SearchTrendCountry)}>{searchTrendCountries.map(code => <option key={code} value={code}>{t(`research.${code}`)}</option>)}</select></label>
      <button className="primary" disabled={!available || busy} onClick={retrieve}>{t('research.load')}</button>{!available && <p>{t('research.unavailable')}</p>}
      {busy && <p role="status">{t('research.busy')}</p>}{saved && <p role="status">{t('research.saved')}</p>}
      {(error || ledgerError) && <div role="alert">{t('research.failed')}<details><summary>{t('common.details')}</summary>{error || ledgerError}</details></div>}
    </div>
    {snapshot && <div className="card stack"><h3>{t('research.result')} · {t(`research.${snapshot.country}`)}</h3><p>{t('research.date', { date: snapshot.retrievedAt })}</p>{provenance(snapshot)}
      {!snapshot.items.length && <p>{t('research.empty')}</p>}
      {snapshot.items.map((item, index) => <article key={index}>{itemView(item)}<button className="secondaryButton" disabled={!!ledgerError} onClick={() => retain(index)}>{t('research.retain')}</button></article>)}
    </div>}
    <ResearchBriefPanel key={project.id} project={project} history={history} onProjectChange={onProjectChange} onOpenDirector={onOpenDirector} />
    <div className="card stack"><h3>{t('research.history')} ({retained.length}/200)</h3>
      {!retained.length && !ledgerError && <p>{t('research.historyEmpty')}</p>}
      {retained.map((entry, index) => <article key={index}><p>{t(`research.${entry.country}`)} · {entry.retrievedAt}</p>{itemView(entry.items[0])}{provenance(entry)}</article>)}
    </div>
  </section>
}
