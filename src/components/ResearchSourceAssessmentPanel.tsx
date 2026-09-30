import { useEffect, useRef, useState } from 'react'
import type { KinaouProject } from '../core/project'
import type { PersistentVersionHistory } from '../core/versioning'
import { retainedSearchTrends, type RetainedSearchTrend } from '../core/searchTrends'
import { newSourceAssessmentDraft, selectedSourceAssessments, sourceAssessmentDraft, sourceAssessmentKey, SourceAssessmentSession, type SourceAssessment, type SourceAssessmentDraft } from '../core/researchSourceAssessment'
import { useUiLanguage } from './UiLanguageProvider'

export function ResearchSourceAssessmentPanel({ project, history, onProjectChange }: { project: KinaouProject; history: PersistentVersionHistory; onProjectChange: (project: KinaouProject) => void }) {
  const { t, language } = useUiLanguage(), session = useRef(new SourceAssessmentSession())
  const [selected, setSelected] = useState(0), [loaded, setLoaded] = useState<{ source: RetainedSearchTrend; baseline: string; draft: SourceAssessmentDraft } | null>(null)
  const [review, setReview] = useState<SourceAssessment | null>(null), [ack, setAck] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState(false)
  session.current.observe(project, loaded?.source ?? null, loaded?.draft ?? null, language)
  useEffect(() => () => session.current.detach(), [])
  let sources: RetainedSearchTrend[] = [], existing: SourceAssessment | undefined, readError = ''
  try { sources = retainedSearchTrends(project); existing = selectedSourceAssessments(project, sources[selected] ? [sources[selected]] : [])[0] } catch (cause) { readError = String(cause) }
  const current = review && session.current.current(review)
  function load() {
    if (loaded || !sources[selected] || readError) return
    try { setLoaded({ source: sources[selected], baseline: sourceAssessmentKey(project, sources[selected]), draft: existing ? sourceAssessmentDraft(existing) : newSourceAssessmentDraft() }); setReview(null); setAck(false); setSaved(false); setError('') } catch (cause) { setError(String(cause)) }
  }
  function edit(patch: Partial<SourceAssessmentDraft>) { if (loaded) { setLoaded({ ...loaded, draft: { ...loaded.draft, ...patch } }); setReview(null); setAck(false); setError(''); setSaved(false) } }
  function prepare() { if (!loaded || readError) return; setReview(null); setAck(false); setError(''); try { setReview(session.current.prepare(project, loaded.source, loaded.draft, loaded.baseline, language)) } catch (cause) { setError(String(cause)) } }
  function save() {
    if (!review || !current || !ack || readError) return
    try { session.current.commit(project, review, ack, value => { history.snapshot(value, 'Before saving source assessment', 'system') }, onProjectChange); setLoaded(null); setReview(null); setAck(false); setSaved(true); setError('') } catch (cause) { setError(String(cause)) }
  }
  function display(record: SourceAssessment) { return <div className="stack"><p>{t('assessment.historical', { revision: record.revision, date: record.savedAt })}</p><strong>{record.observation.items[0].query} · {record.observation.country}</strong><p style={{ whiteSpace: 'pre-wrap' }}>{record.claim}</p><p>{t(`assessment.${record.finding}`)}</p><p style={{ whiteSpace: 'pre-wrap' }}>{record.notes}</p><p>{t('assessment.links')}</p><ul>{record.readArticleUrls.map(url => <li key={url}><a href={url} target="_blank" rel="noopener noreferrer">{url}</a></li>)}</ul><details><summary>{t('research.provenance')}</summary><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify(record.observation, null, 2)}</pre></details><p>{t('assessment.boundary')}</p></div> }
  return <section className="card stack">
    <h3>{t('assessment.heading')}</h3><p>{t('assessment.help')}</p><p>{t('assessment.boundary')}</p>
    <label>{t('assessment.choose')}<select disabled={!!loaded || !!readError || !sources.length} value={sources[selected] ? selected : ''} onChange={event => { setSelected(Number(event.target.value)); setSaved(false); setError('') }}>
      {!sources.length && <option value="">—</option>}{sources.map((source,index) => <option key={index} value={index}>{source.items[0].query} · {source.country} · {source.retrievedAt}</option>)}
    </select></label>
    {!loaded && <><button disabled={!!readError || !sources[selected]} onClick={load}>{t('assessment.load')}</button>{existing ? display(existing) : <p>{t('assessment.none')}</p>}</>}
    {loaded && <><p role="status">{t('assessment.draft')}</p><strong>{loaded.source.items[0].query} · {loaded.source.country} · {loaded.source.retrievedAt}</strong>
      <label>{t('assessment.claim')}<textarea maxLength={2000} value={loaded.draft.claim} onChange={event => edit({ claim: event.target.value })}/></label>
      <label>{t('assessment.finding')}<select value={loaded.draft.finding} onChange={event => edit({ finding: event.target.value as SourceAssessmentDraft['finding'] })}>{(['open','supports','contradicts'] as const).map(value => <option key={value} value={value}>{t(`assessment.${value}`)}</option>)}</select></label>
      <label>{t('assessment.notes')}<textarea rows={5} maxLength={4000} value={loaded.draft.notes} onChange={event => edit({ notes: event.target.value })}/></label>
      <fieldset className="stack"><legend>{t('assessment.links')}</legend>{!loaded.source.items[0].articles.length && <p>{t('assessment.noLinks')}</p>}
      {loaded.source.items[0].articles.filter((article,index,all) => all.findIndex(item => item.url === article.url) === index).map(article => <div key={article.url}><label className="researchBriefAck"><input type="checkbox" checked={loaded.draft.readArticleUrls.includes(article.url)} onChange={event => edit({ readArticleUrls: event.target.checked ? [...loaded.draft.readArticleUrls, article.url] : loaded.draft.readArticleUrls.filter(url => url !== article.url) })}/>{article.title} — {article.source}</label><a href={article.url} target="_blank" rel="noopener noreferrer">{t('assessment.openLink')}</a></div>)}
      </fieldset><button disabled={!!readError} onClick={prepare}>{t('assessment.prepare')}</button><button className="secondaryButton" onClick={() => { setLoaded(null); setReview(null); setAck(false); setError('') }}>{t('assessment.close')}</button>
    </>}
    {review && !current && <p role="alert">{t('assessment.stale')}</p>}
    {review && current && <section className="stack"><h4>{t('assessment.preview')}</h4>{display(review)}<label className="researchBriefAck"><input type="checkbox" checked={ack} onChange={event => setAck(event.target.checked)}/>{t('assessment.ack')}</label><button className="primary" disabled={!ack || !!readError} onClick={save}>{t('assessment.save')}</button></section>}
    {saved && <p role="status">{t('assessment.saved')}</p>}
    {(error || readError) && <div role="alert">{t('assessment.failed')}<details><summary>{t('common.details')}</summary>{error || readError}</details></div>}
  </section>
}
