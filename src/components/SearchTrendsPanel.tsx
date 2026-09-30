import { useEffect, useId, useRef, useState } from 'react'
import type { KinaouProject } from '../core/project'
import type { PersistentVersionHistory } from '../core/versioning'
import { WorkerClient } from '../core/workerClient'
import { retainedSearchTrends, retainSearchTrend, SearchTrendSession, type RetainedSearchTrend } from '../core/searchTrends'
import { searchTrendCountries, supportsSearchTrendCountry, type SearchTrendCountry, type SearchTrendSnapshot, type SearchTrendItem } from '../../worker/search-trends-protocol.mjs'
import type { CourseOutputWorkerProps } from './CourseOutputFileCheckPanel'
import { useUiLanguage } from './UiLanguageProvider'
import './SearchTrendsPanel.css'
import { ResearchBriefPanel } from './ResearchBriefPanel'
import { filterResearchObservations, newResearchObservationFilter, type ResearchObservationFilter } from '../core/researchObservationFilter'
import { ResearchDossierPanel } from './ResearchDossierPanel'
import { ResearchSourceAssessmentPanel } from './ResearchSourceAssessmentPanel'
import { researchViews, researchViewForKey, type ResearchView } from '../core/researchWorkspace'

export function SearchTrendsPanel({ project, history, onProjectChange, onOpenDirector, workerUrl = '', workerToken = '', workerConnected = false, workerCapabilities = [] }: CourseOutputWorkerProps & { project: KinaouProject; history: PersistentVersionHistory; onProjectChange: (project: KinaouProject) => void; onOpenDirector?: () => void }) {
  const { t } = useUiLanguage(), [country, setCountry] = useState<SearchTrendCountry>('DE')
  const id = useId(), [view, setView] = useState<ResearchView>('discover')
  const tabs = useRef<Partial<Record<ResearchView, HTMLButtonElement | null>>>({})
  const panel = (item: ResearchView) => ({ id: `${id}-${item}-panel`, role: 'tabpanel', 'aria-labelledby': `${id}-${item}-tab`, tabIndex: 0, hidden: view !== item, className: 'researchView stack' })
  const [filters, setFilters] = useState(newResearchObservationFilter)
  const available = workerConnected && !!workerToken.trim() && supportsSearchTrendCountry(country, workerCapabilities)
  const scope = JSON.stringify([project.id, country, workerUrl, workerToken, available]), current = useRef(scope), session = useRef<SearchTrendSession | null>(null)
  const [result, setResult] = useState<{ scope: string; snapshot: SearchTrendSnapshot } | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState(false)
  if (current.current !== scope) { current.current = scope; session.current?.detach() }
  useEffect(() => { setResult(null); setBusy(false); setError(''); setSaved(false); return () => { session.current?.detach() } }, [scope])
  let retained: RetainedSearchTrend[] = [], ledgerError = ''
  try { retained = retainedSearchTrends(project) } catch (cause) { ledgerError = String(cause) }
  let visible: ReturnType<typeof filterResearchObservations> = [], filterError = ''
  if (!ledgerError) { try { visible = filterResearchObservations(retained, filters) } catch (cause) { filterError = String(cause) } }
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
    <header className="card stack researchWorkspaceLead"><div className="eyebrow">{t('nav.Research')}</div><h2>{t('researchWorkspace.heading')}</h2><p>{t('researchWorkspace.help')}</p><p className="note">{t('researchWorkspace.drafts')}</p>
      <div role="tablist" aria-label={t('researchWorkspace.views')} className="researchTabs">{researchViews.map(item => <button key={item} type="button" role="tab" id={`${id}-${item}-tab`} aria-controls={`${id}-${item}-panel`} aria-selected={view === item} tabIndex={view === item ? 0 : -1} ref={node => { tabs.current[item] = node }} onClick={() => setView(item)} onKeyDown={event => {
        const next = researchViewForKey(item, event.key)
        if (next) { event.preventDefault(); setView(next); tabs.current[next]?.focus() }
      }}><strong>{t(`researchWorkspace.${item}`)}</strong><span>{t(`researchWorkspace.${item}Help`)}</span></button>)}</div>
      {busy && view !== 'discover' && <p role="status">{t('researchWorkspace.background')}</p>}
    </header>
    <div {...panel('discover')}>
    <div className="card stack"><h2>{t('research.title')}</h2><p>{t('research.help')}</p><p>{t('research.limits')}</p><p>{t('research.marketCoverage')}</p>
      <label>{t('research.country')}<select value={country} onChange={event => setCountry(event.target.value as SearchTrendCountry)}>{searchTrendCountries.map(code => <option key={code} value={code}>{t(`research.${code}`)}</option>)}</select></label>
      <button className="primary" disabled={!available || busy} onClick={retrieve}>{t('research.load')}</button>{!available && <p>{t('research.unavailable')}</p>}
      {busy && <p role="status">{t('research.busy')}</p>}{saved && <p role="status">{t('research.saved')}</p>}
      {(error || ledgerError) && <div role="alert">{t('research.failed')}<details><summary>{t('common.details')}</summary>{error || ledgerError}</details></div>}
    </div>
    {snapshot && <div className="card stack"><h3>{t('research.result')} · {t(`research.${snapshot.country}`)}</h3><p>{t('research.date', { date: snapshot.retrievedAt })}</p>{provenance(snapshot)}
      {!snapshot.items.length && <p>{t('research.empty')}</p>}
      {snapshot.items.map((item, index) => <article key={index}>{itemView(item)}<button className="secondaryButton" disabled={!!ledgerError} onClick={() => retain(index)}>{t('research.retain')}</button></article>)}
    </div>}
    </div>
    <div {...panel('assess')}><ResearchSourceAssessmentPanel key={`assessment-${project.id}`} project={project} history={history} onProjectChange={onProjectChange} /></div>
    <div {...panel('brief')}><ResearchBriefPanel key={project.id} project={project} history={history} onProjectChange={onProjectChange} onOpenDirector={onOpenDirector} /></div>
    <div {...panel('library')}>
    <div className="card stack"><h3>{t('research.history')} ({retained.length}/200)</h3>
      <p>{t('research.filterHelp')}</p>
      <fieldset className="researchLibraryFilters"><legend>{t('research.filterHeading')}</legend>
        <label>{t('research.filterText')}<input maxLength={200} value={filters.text} onChange={e => setFilters({ ...filters, text: e.target.value })} /></label>
        <label>{t('research.filterCountry')}<select value={filters.country} onChange={e => setFilters({ ...filters, country: e.target.value as ResearchObservationFilter['country'] })}><option value="all">{t('research.filterAll')}</option>{searchTrendCountries.map(code => <option key={code} value={code}>{t(`research.${code}`)}</option>)}</select></label>
        <label>{t('research.filterBasis')}<select value={filters.dateBasis} onChange={e => setFilters({ ...filters, dateBasis: e.target.value as ResearchObservationFilter['dateBasis'] })}><option value="published">{t('research.filterPublished')}</option><option value="retrieved">{t('research.filterRetrieved')}</option></select></label>
        <label>{t('research.filterFrom')}<input type="date" min="0001-01-01" max="9999-12-31" value={filters.from} onChange={e => setFilters({ ...filters, from: e.target.value })} /></label>
        <label>{t('research.filterThrough')}<input type="date" min="0001-01-01" max="9999-12-31" value={filters.through} onChange={e => setFilters({ ...filters, through: e.target.value })} /></label>
        <label>{t('research.filterOrder')}<select value={filters.order} onChange={e => setFilters({ ...filters, order: e.target.value as ResearchObservationFilter['order'] })}><option value="newest">{t('research.filterNewest')}</option><option value="oldest">{t('research.filterOldest')}</option></select></label>
        <button className="secondaryButton" onClick={() => setFilters(newResearchObservationFilter())}>{t('research.filterReset')}</button>
      </fieldset>
      {filterError && <div role="alert">{t('research.filterInvalid')}<details><summary>{t('common.details')}</summary>{filterError}</details></div>}
      {!filterError && !ledgerError && <p role="status">{t('research.filterCount', { matches: visible.length, total: retained.length })}</p>}
      {!retained.length && !ledgerError && <p>{t('research.historyEmpty')}</p>}
      {!!retained.length && !visible.length && !filterError && !ledgerError && <p>{t('research.filterEmpty')}</p>}
      <ResearchDossierPanel project={project} filters={filters} available={!filterError && !ledgerError && visible.length > 0} />
      {visible.map(({ entry, index }) => <article key={index}><p>{t(`research.${entry.country}`)} · {entry.retrievedAt}</p>{itemView(entry.items[0])}{provenance(entry)}</article>)}
    </div>
    </div>
  </section>
}
