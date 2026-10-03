import { useEffect, useMemo, useRef, useState } from 'react'
import { AnalyticsSession, analyticsByteLimit, analyticsSummary, loadAnalyticsSource, newAnalyticsDraft, parseAnalyticsCsv, retainedPerformanceReports, type AnalyticsDraft, type AnalyticsSource, type PerformanceReport } from '../core/localAnalytics'
import type { KinaouProject } from '../core/project'
import type { PersistentVersionHistory } from '../core/versioning'
import { useUiLanguage } from './UiLanguageProvider'
import { AnalyticsCalendarView } from './AnalyticsCalendarView'
import { AnalyticsComparisonView } from './AnalyticsComparisonView'

export function AnalyticsReportView({ report }: { report: PerformanceReport }) {
  const { t, language } = useUiLanguage(), [page, setPage] = useState(0), summary = analyticsSummary(report)
  const number = (value: number) => value.toLocaleString(language), shown = report.rows.slice(page * 25, (page + 1) * 25)
  return <div className="analyticsReport stack">
    <h3>{report.draft.name}</h3><p>{report.draft.platform} · {report.draft.scope}</p>
    {report.draft.timezoneNote && <p>{t('analytics.zone')}: {report.draft.timezoneNote}</p>}
    <p>{summary.from} — {summary.through}</p>
    <strong>{t('analytics.sum', { value: number(summary.sum) })}</strong><p>{t('analytics.days', { count: number(summary.count), missing: number(summary.missing) })}</p>
    <AnalyticsCalendarView key={report.id} report={report} />
    <AnalyticsComparisonView report={report} />
    <h4>{t('analytics.dailyOriginals')}</h4>
    <div className="analyticsTable"><table><thead><tr><th>{t('analytics.date')}</th><th>{t('analytics.views')}</th><th>{t('analytics.raw')}</th><th>{t('analytics.record')}</th></tr></thead><tbody>{shown.map(row => <tr key={row.date}><td>{row.date}</td><td>{number(row.views)}</td><td><code>{JSON.stringify([row.rawDate, row.rawViews])}</code></td><td>{row.record}</td></tr>)}</tbody></table></div>
    <div className="directorActions"><button className="secondaryButton" disabled={!page} onClick={() => setPage(p => p - 1)}>{t('analytics.previous')}</button><span>{page * 25 + 1}–{Math.min((page + 1) * 25, report.rows.length)} / {report.rows.length}</span><button className="secondaryButton" disabled={(page + 1) * 25 >= report.rows.length} onClick={() => setPage(p => p + 1)}>{t('analytics.next')}</button></div>
    {report.excludedSummary && <p>{t('analytics.excluded')}: <code>{JSON.stringify([report.excludedSummary.rawDate, report.excludedSummary.rawViews])}</code></p>}
    <details><summary>{t('analytics.source')}</summary><p>{report.source.filename} · {report.source.bytes} B · {report.importedAt}</p><code>{report.source.sha256}</code><p>{t('analytics.dateColumn')}: {report.columns.date} ({report.draft.mapping.dateColumn + 1}) · {t('analytics.viewsColumn')}: {report.columns.views} ({report.draft.mapping.viewsColumn + 1})</p><p>{report.draft.mapping.dateFormat} · {report.draft.mapping.numberFormat} · {JSON.stringify(report.draft.mapping.delimiter)}</p></details>
  </div>
}

export function AnalyticsPanel({ project, history, onProjectChange }: { project: KinaouProject; history: PersistentVersionHistory; onProjectChange: (project: KinaouProject) => void }) {
  const { t } = useUiLanguage(), session = useRef(new AnalyticsSession())
  const [draft, setDraft] = useState(newAnalyticsDraft), [source, setSource] = useState<AnalyticsSource | null>(null)
  const [review, setReview] = useState<PerformanceReport | null>(null), [ack, setAck] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState(false), [selected, setSelected] = useState('')
  const [reading, setReading] = useState<number | null>(null), readLifetime = useRef({ project: JSON.stringify(project), generation: 0 })
  const projectIdentity = JSON.stringify(project)
  if (readLifetime.current.project !== projectIdentity) readLifetime.current = { project: projectIdentity, generation: readLifetime.current.generation + 1 }
  useEffect(() => () => { readLifetime.current.generation++ }, [])
  session.current.observe(project, source, draft)
  const busy = reading !== null && reading === readLifetime.current.generation, current = review && session.current.current(review)
  const library = useMemo(() => { try { return { reports: retainedPerformanceReports(project), error: '' } } catch (cause) { return { reports: [], error: String(cause) } } }, [project])
  const parsed = useMemo(() => { try { return { value: source ? parseAnalyticsCsv(source.text, draft.mapping.delimiter) : null, error: '' } } catch (cause) { return { value: null, error: String(cause) } } }, [source, draft.mapping.delimiter])
  function edit(next: AnalyticsDraft) { setDraft(next); setReview(null); setAck(false); setSaved(false); setError('') }
  async function read(file: File | undefined) {
    if (!file) return
    const generation = ++readLifetime.current.generation
    setReading(generation); setSource(null); setReview(null); setAck(false); setError(''); setSaved(false)
    try {
      if (file.size < 1 || file.size > analyticsByteLimit) throw Error('CSV must contain 1–524288 bytes')
      const candidate = await loadAnalyticsSource(new Uint8Array(await file.arrayBuffer()), file.name)
      if (generation !== readLifetime.current.generation) return
      setSource(candidate)
    } catch (cause) { if (generation === readLifetime.current.generation) setError(String(cause)) }
    finally { if (generation === readLifetime.current.generation) setReading(null) }
  }
  function prepare() {
    setReview(null); setAck(false); setSaved(false); setError('')
    if (source) try { setReview(session.current.prepare(project, source, draft)) } catch (cause) { setError(String(cause)) }
  }
  function save() {
    if (!review || !current || !ack) return
    try {
      session.current.commit(project, review, ack, p => { history.snapshot(p, 'Before local analytics import', 'system') }, onProjectChange)
      setSelected(review.id); setReview(null); setAck(false); setSaved(true); setError('')
    } catch (cause) { setError(String(cause)) }
  }
  const report = library.reports.find(r => r.id === selected)
  return <section className="card stack analyticsPanel">
    <div className="eyebrow">{t('nav.Analytics')}</div><h2>{t('analytics.heading')}</h2><p>{t('analytics.help')}</p><p className="analyticsBoundary">{t('analytics.boundary')}</p>
    <small>{t('analytics.unsaved')}</small>
    {library.error ? <div role="alert">{t('analytics.libraryError')}<details><summary>{t('common.details')}</summary>{library.error}</details></div> : <>
      <label>{t('analytics.file')}<input type="file" accept=".csv,text/csv" onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; void read(file) }} /></label>
      {busy && <p role="status">{t('analytics.reading')}</p>}
      {source && <p>{source.file.filename} · {source.file.bytes} B</p>}
      <div className="analyticsFields">
        <label>{t('analytics.name')}<input value={draft.name} maxLength={120} onChange={e => edit({ ...draft, name: e.target.value })} /></label>
        <label>{t('analytics.scope')}<input value={draft.scope} maxLength={300} onChange={e => edit({ ...draft, scope: e.target.value })} /></label>
        <label>{t('analytics.platform')}<select value={draft.platform} onChange={e => edit({ ...draft, platform: e.target.value as AnalyticsDraft['platform'] })}>{['youtube', 'tiktok', 'instagram', 'threads', 'facebook', 'other'].map(p => <option key={p} value={p}>{p === 'other' ? t('analytics.other') : p}</option>)}</select></label>
        <label>{t('analytics.zone')}<input value={draft.timezoneNote} maxLength={120} onChange={e => edit({ ...draft, timezoneNote: e.target.value })} /></label>
        <label>{t('analytics.delimiter')}<select value={draft.mapping.delimiter} onChange={e => edit({ ...draft, mapping: { ...draft.mapping, delimiter: e.target.value as ',' | ';' } })}><option value=",">,</option><option value=";">;</option></select></label>
        {(['dateColumn', 'viewsColumn'] as const).map(key => <label key={key}>{t(`analytics.${key}`)}<select value={draft.mapping[key]} onChange={e => edit({ ...draft, mapping: { ...draft.mapping, [key]: Number(e.target.value) } })}>{parsed.value?.headers.map((h, i) => <option key={i} value={i}>{i + 1} · {h}</option>)}</select></label>)}
        <label>{t('analytics.dateFormat')}<select value={draft.mapping.dateFormat} onChange={e => edit({ ...draft, mapping: { ...draft.mapping, dateFormat: e.target.value as AnalyticsDraft['mapping']['dateFormat'] } })}>{[['iso', 'YYYY-MM-DD'], ['dmy-slash', 'DD/MM/YYYY'], ['mdy-slash', 'MM/DD/YYYY'], ['dmy-dot', 'DD.MM.YYYY']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>{t('analytics.numberFormat')}<select value={draft.mapping.numberFormat} onChange={e => edit({ ...draft, mapping: { ...draft.mapping, numberFormat: e.target.value as AnalyticsDraft['mapping']['numberFormat'] } })}>{(['plain', 'comma', 'dot', 'space'] as const).map(value => <option key={value} value={value}>{t(`analytics.${value}`)}</option>)}</select></label>
      </div>
      <label className="researchBriefAck"><input type="checkbox" checked={draft.mapping.skipFirstSummary} onChange={e => edit({ ...draft, mapping: { ...draft.mapping, skipFirstSummary: e.target.checked } })} />{t('analytics.skip')}</label>
      <button className="secondaryButton" disabled={!source || busy || !parsed.value} onClick={prepare}>{t('analytics.prepare')}</button>
      {current && review && <section className="analyticsReview stack"><h3>{t('analytics.preview')}</h3><AnalyticsReportView key={review.id} report={review} /><label className="researchBriefAck"><input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} />{t('analytics.ack')}</label><button className="primary" disabled={!ack} onClick={save}>{t('analytics.save')}</button></section>}
      {review && !current && <p role="status">{t('analytics.stale')}</p>}
      {(error || parsed.error) && <div role="alert">{t('analytics.error')}<details><summary>{t('common.details')}</summary>{error || parsed.error}</details></div>}
      {saved && <p role="status">{t('analytics.saved')}</p>}
      <h3>{t('analytics.library')}</h3>{!library.reports.length ? <p>{t('analytics.empty')}</p> : <><label>{t('analytics.choose')}<select value={selected} onChange={e => setSelected(e.target.value)}><option value="">—</option>{library.reports.map(r => <option key={r.id} value={r.id}>{r.draft.name} · {r.importedAt}</option>)}</select></label>{report && <AnalyticsReportView key={report.id} report={report} />}</>}
    </>}
  </section>
}
