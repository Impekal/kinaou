import { weekdayMinimumDays, weekdayPattern } from '../core/analyticsWeekday'
import type { PerformanceReport } from '../core/localAnalytics'
import { useUiLanguage } from './UiLanguageProvider'

/** Read-only. It changes nothing, requests nothing and recommends nothing. */
export function AnalyticsWeekdayView({ report }: { report: PerformanceReport }) {
  const { t, language } = useUiLanguage()
  const pattern = weekdayPattern(report.rows)
  const whole = (value: number) => value.toLocaleString(language)
  const decimal = (value: number) => value.toLocaleString(language, { maximumFractionDigits: 1 })
  return <section className="stack analyticsWeekday">
    <h4>{t('analytics.weekday.heading')}</h4>
    <p>{t('analytics.weekday.help')}</p>
    <small>{t('analytics.weekday.boundary')}</small>
    <p role="status">{t('analytics.weekday.summary', { days: pattern.totalDays, comparable: pattern.comparable.length })}</p>
    {pattern.comparable.length < 2 && <div className="warning" role="status">{t('analytics.weekday.notEnough', { minimum: weekdayMinimumDays })}</div>}
    {pattern.dominatedBySingleDay && <div className="warning" role="status">{t('analytics.weekday.dominated')}</div>}
    <div className="analyticsTable"><table>
      <thead><tr><th>{t('analytics.weekday.column.day')}</th><th>{t('analytics.weekday.column.days')}</th><th>{t('analytics.weekday.column.median')}</th><th>{t('analytics.weekday.column.mean')}</th><th>{t('analytics.weekday.column.range')}</th><th>{t('analytics.weekday.column.note')}</th></tr></thead>
      <tbody>{pattern.rows.map(row => <tr key={row.weekday}>
        <td>{t(`analytics.weekday.day.${row.weekday}`)}</td>
        <td>{row.days ? whole(row.days) : t('analytics.weekday.none')}</td>
        <td>{row.median === null ? '—' : decimal(row.median)}</td>
        <td>{row.mean === null ? '—' : decimal(row.mean)}</td>
        <td>{row.lowest === null || row.highest === null ? '—' : `${whole(row.lowest)} – ${whole(row.highest)}`}</td>
        <td>{row.sparse ? t('analytics.weekday.sparse', { minimum: weekdayMinimumDays }) : t('analytics.weekday.comparable')}</td>
      </tr>)}</tbody>
    </table></div>
  </section>
}
