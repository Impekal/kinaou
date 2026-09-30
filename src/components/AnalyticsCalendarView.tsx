import { useState } from 'react'
import { analyticsCalendarPeriods, type AnalyticsPeriodKind } from '../core/analyticsCalendar'
import type { PerformanceReport } from '../core/localAnalytics'
import { useUiLanguage } from './UiLanguageProvider'

export function AnalyticsCalendarView({ report }: { report: PerformanceReport }) {
  const { t, language } = useUiLanguage(), [kind, setKind] = useState<AnalyticsPeriodKind>('day'), [page, setPage] = useState(0)
  const groups = analyticsCalendarPeriods(report.rows, kind), first = groups[0], last = groups[groups.length - 1], maximum = Math.max(1, ...groups.map(g => g.views))
  const stamp = (date: string) => Date.parse(date + 'T00:00:00.000Z'), start = stamp(first.from), span = (stamp(last.through) - start) / 86400000 + 1
  const number = (value: number) => value.toLocaleString(language)
  return <section className="stack analyticsCalendar">
    <label>{t('analytics.periodView')}<select value={kind} onChange={event => { setKind(event.target.value as AnalyticsPeriodKind); setPage(0) }}>{(['day', 'week', 'month'] as const).map(value => <option key={value} value={value}>{t(`analytics.period.${value}`)}</option>)}</select></label>
    <p>{t('analytics.periodHelp')}</p>
    <svg className="analyticsChart" viewBox="0 0 800 210" role="img" aria-label={t('analytics.periodChart', { period: t(`analytics.period.${kind}`) })}>
      <title>{t('analytics.periodChart', { period: t(`analytics.period.${kind}`) })}</title><desc>{t('analytics.periodChartHelp')}</desc>
      <line x1="40" y1="180" x2="780" y2="180" stroke="currentColor" />
      <text x="40" y="15" fill="currentColor">{number(maximum)}</text>
      {groups.map(group => <rect key={group.key} x={40 + ((stamp(group.from) - start) / 86400000 + group.calendarDays * 0.1) / span * 740} y={180 - group.views / maximum * 150} width={Math.min(48, 740 / span * group.calendarDays * 0.8)} height={group.views / maximum * 150} fill="currentColor" opacity={group.missingDays ? 0.6 : 1}><title>{group.key}: {number(group.views)} · {t('analytics.periodCoverage', { present: group.reportedDays, days: group.calendarDays, missing: group.missingDays })}</title></rect>)}
      <text x="40" y="205" fill="currentColor">{first.from}</text><text x="780" y="205" textAnchor="end" fill="currentColor">{last.through}</text>
    </svg><small>{t('analytics.periodChartHelp')}</small>
    {kind !== 'day' && <><div className="analyticsTable"><table><thead><tr><th>{t('analytics.periodLabel')}</th><th>{t('analytics.periodSum')}</th><th>{t('analytics.periodDays')}</th><th>{t('analytics.periodMissing')}</th><th>{t('analytics.periodStatus')}</th></tr></thead><tbody>{groups.slice(page * 25, (page + 1) * 25).map(group => <tr key={group.key}><td>{group.key}<br /><small>{group.from} — {group.through}</small></td><td>{number(group.views)}</td><td>{group.reportedDays} / {group.calendarDays}</td><td>{group.missingDays}</td><td>{t(group.missingDays ? 'analytics.periodPartial' : 'analytics.periodAllDays')}</td></tr>)}</tbody></table></div>
      <div className="directorActions"><button className="secondaryButton" disabled={!page} onClick={() => setPage(p => p - 1)}>{t('analytics.previous')}</button><span>{page * 25 + 1}–{Math.min((page + 1) * 25, groups.length)} / {groups.length}</span><button className="secondaryButton" disabled={(page + 1) * 25 >= groups.length} onClick={() => setPage(p => p + 1)}>{t('analytics.next')}</button></div></>}
  </section>
}
