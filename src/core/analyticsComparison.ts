import { analyticsCalendarPeriods } from './analyticsCalendar'
import { analyticsDate } from './localAnalytics'

export interface AnalyticsPeriodRange { from: string; through: string }
export interface AnalyticsComparisonPeriod extends AnalyticsPeriodRange {
  days: number; reportedDays: number; reportedViews: number; missingDates: string[]
}
export interface AnalyticsComparison {
  baseline: AnalyticsComparisonPeriod; comparison: AnalyticsComparisonPeriod
  complete: boolean; difference: number | null; percent: number | null
}
export type AnalyticsComparisonErrorCode = 'dates' | 'order' | 'length' | 'range' | 'source'
export class AnalyticsComparisonError extends Error {
  constructor(readonly code: AnalyticsComparisonErrorCode) { super(`Analytics comparison: ${code}`) }
}
const DAY = 86400000
const stamp = (date: string) => Date.parse(date + 'T00:00:00.000Z')
function checkedRange(value: AnalyticsPeriodRange) {
  try { if (analyticsDate(value.from, 'iso') !== value.from || analyticsDate(value.through, 'iso') !== value.through) throw Error() }
  catch { throw new AnalyticsComparisonError('dates') }
  const days = (stamp(value.through) - stamp(value.from)) / DAY + 1
  if (days < 1 || days > 366) throw new AnalyticsComparisonError('length')
  return { from: value.from, through: value.through, days }
}

/** One retained daily series only. No missing-as-zero, inferred activity time, timezone shift or causal claim. */
export function compareAnalyticsPeriods(rows: readonly { date: string; views: number }[], first: AnalyticsPeriodRange, second: AnalyticsPeriodRange): AnalyticsComparison {
  try { analyticsCalendarPeriods(rows, 'day') } catch { throw new AnalyticsComparisonError('source') }
  const baselineRange = checkedRange(first), comparisonRange = checkedRange(second)
  if (baselineRange.through >= comparisonRange.from) throw new AnalyticsComparisonError('order')
  if (baselineRange.days !== comparisonRange.days) throw new AnalyticsComparisonError('length')
  if (baselineRange.from < rows[0].date || comparisonRange.through > rows[rows.length - 1].date) throw new AnalyticsComparisonError('range')
  const values = new Map(rows.map(row => [row.date, row.views]))
  function summarize(range: ReturnType<typeof checkedRange>): AnalyticsComparisonPeriod {
    let reportedDays = 0, reportedViews = 0; const missingDates: string[] = []
    for (let index = 0; index < range.days; index++) {
      const date = new Date(stamp(range.from) + index * DAY).toISOString().slice(0, 10)
      if (values.has(date)) { reportedDays++; reportedViews += values.get(date)! } else missingDates.push(date)
    }
    return { ...range, reportedDays, reportedViews, missingDates }
  }
  const baseline = summarize(baselineRange), comparison = summarize(comparisonRange)
  const complete = !baseline.missingDates.length && !comparison.missingDates.length
  const difference = complete ? comparison.reportedViews - baseline.reportedViews : null
  return { baseline, comparison, complete, difference, percent: difference !== null && baseline.reportedViews > 0 ? difference / baseline.reportedViews * 100 : null }
}
