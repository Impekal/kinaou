import { useState } from 'react'
import { AnalyticsComparisonError, compareAnalyticsPeriods, type AnalyticsComparison, type AnalyticsComparisonErrorCode } from '../core/analyticsComparison'
import type { PerformanceReport } from '../core/localAnalytics'
import { useUiLanguage } from './UiLanguageProvider'

function ComparisonForm({ report }: { report: PerformanceReport }) {
  const { t, language } = useUiLanguage()
  const [periods, setPeriods] = useState({ baseline: { from: '', through: '' }, comparison: { from: '', through: '' } })
  const [result, setResult] = useState<AnalyticsComparison | null>(null), [error, setError] = useState<AnalyticsComparisonErrorCode | null>(null)
  const number = (value: number) => value.toLocaleString(language, { maximumFractionDigits: 1 })
  function compare() {
    setResult(null); setError(null)
    try { setResult(compareAnalyticsPeriods(report.rows, periods.baseline, periods.comparison)) }
    catch (cause) { setError(cause instanceof AnalyticsComparisonError ? cause.code : 'source') }
  }
  return <details className="stack analyticsCalendar analyticsComparison">
    <summary>{t('analytics.compare.heading')}</summary><p>{t('analytics.compare.help')}</p><p className="note">{t('analytics.compare.boundary')}</p>
    <div className="analyticsFields">{(['baseline', 'comparison'] as const).map(kind => <fieldset key={kind}><legend>{t(`analytics.compare.${kind}`)}</legend>
      {(['from', 'through'] as const).map(field => <label key={field}>{t(`analytics.compare.${kind}`)} · {t(`analytics.compare.${field}`)}<input type="date" min={report.rows[0]?.date} max={report.rows.at(-1)?.date} value={periods[kind][field]} onChange={event => { setPeriods({ ...periods, [kind]: { ...periods[kind], [field]: event.target.value } }); setResult(null); setError(null) }} /></label>)}
    </fieldset>)}</div>
    <button className="secondaryButton" disabled={Object.values(periods).some(period => !period.from || !period.through)} onClick={compare}>{t('analytics.compare.run')}</button>
    {error && <p role="alert">{t(`analytics.compare.${error}`)}</p>}
    {result && <div className="stack">
      <div className="analyticsTable"><table><caption>{t('analytics.compare.caption')}</caption><thead><tr>{(['period', 'sum', 'coverage', 'missing'] as const).map(key => <th scope="col" key={key}>{t(`analytics.compare.${key}`)}</th>)}</tr></thead>
        <tbody>{(['baseline', 'comparison'] as const).map(kind => { const period = result[kind]; return <tr key={kind}><th scope="row">{t(`analytics.compare.${kind}`)}<br /><small>{period.from} — {period.through}</small></th><td>{period.reportedDays ? number(period.reportedViews) : t('analytics.compare.noDays')}</td><td>{period.reportedDays} / {period.days}</td><td>{period.missingDates.length > 0 ? <details><summary>{period.missingDates.length}</summary><p>{t('analytics.compare.missingList', { shown: Math.min(14, period.missingDates.length), total: period.missingDates.length })}</p><p>{period.missingDates.slice(0, 14).join(', ')}</p></details> : '0'}</td></tr> })}</tbody>
      </table></div>
      <p className="note">{t(result.complete ? 'analytics.compare.complete' : 'analytics.compare.partial')}</p>
      {result.complete && <><strong>{t('analytics.compare.difference', { value: number(result.difference!) })}</strong><p>{result.percent === null ? t('analytics.compare.zero') : t('analytics.compare.percent', { value: number(result.percent) })}</p></>}
    </div>}
  </details>
}

/** Report changes reset transient choices/results; language changes only translate the read-only view. */
export function AnalyticsComparisonView({ report }: { report: PerformanceReport }) {
  return <ComparisonForm key={JSON.stringify(report)} report={report} />
}
