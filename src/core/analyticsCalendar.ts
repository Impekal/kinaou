import { analyticsDate } from './localAnalytics'

export type AnalyticsPeriodKind = 'day' | 'week' | 'month'
export interface AnalyticsCalendarPeriod {
  key: string; from: string; through: string; views: number; reportedDays: number; calendarDays: number; missingDays: number
}
const DAY = 86400000
const dateText = (time: number) => new Date(time).toISOString().split('T')[0]
const monday = (time: number) => time - ((new Date(time).getUTCDay() + 6) % 7) * DAY

function calendarBounds(date: string, kind: AnalyticsPeriodKind) {
  const stamp = Date.parse(date + 'T00:00:00.000Z')
  if (kind === 'day') return { key: date, from: date, through: date, calendarDays: 1 }
  if (kind === 'month') {
    const start = Date.parse(date.slice(0, 7) + '-01T00:00:00.000Z'), next = new Date(start)
    next.setUTCMonth(next.getUTCMonth() + 1)
    return { key: date.slice(0, 7), from: dateText(start), through: dateText(next.getTime() - DAY), calendarDays: (next.getTime() - start) / DAY }
  }
  // ISO weeks start Monday; week 1 contains Jan 4 (the year's first Thursday).
  // Use the Thursday's year, not the source date's Gregorian year.
  const start = monday(stamp), year = String(new Date(start + 3 * DAY).getUTCFullYear()).padStart(4, '0')
  const first = monday(Date.parse(year + '-01-04T00:00:00.000Z'))
  const week = 1 + (start - first) / (7 * DAY)
  return { key: `${year}-W${String(week).padStart(2, '0')}`, from: dateText(start), through: dateText(start + 6 * DAY), calendarDays: 7 }
}

/** Read-only grouping of one report. Absent days/periods never become zero observations. */
export function analyticsCalendarPeriods(rows: readonly { date: string; views: number }[], kind: AnalyticsPeriodKind): AnalyticsCalendarPeriod[] {
  if (!['day', 'week', 'month'].includes(kind) || !Array.isArray(rows) || !rows.length || rows.length > 500) throw Error('Invalid calendar view')
  const periods: AnalyticsCalendarPeriod[] = []; let total = 0
  rows.forEach((row, index) => {
    if (analyticsDate(row.date, 'iso') !== row.date || !Number.isSafeInteger(row.views) || row.views < 0 || (index && rows[index - 1].date >= row.date)) throw Error('Use exact, unique, ordered daily values')
    total += row.views
    if (!Number.isSafeInteger(total)) throw Error('View sum exceeds safe integer precision')
    const bounds = calendarBounds(row.date, kind)
    let group = periods[periods.length - 1]
    if (!group || group.key !== bounds.key) { group = { ...bounds, views: 0, reportedDays: 0, missingDays: bounds.calendarDays }; periods.push(group) }
    group.views += row.views; group.reportedDays++; group.missingDays--
  })
  return periods
}
