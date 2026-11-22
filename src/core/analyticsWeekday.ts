import { analyticsDate } from './localAnalytics'

/** ISO order: 1 = Monday … 7 = Sunday. */
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7

export interface WeekdayPatternRow {
  weekday: IsoWeekday
  /** How many of the report's days fell on this weekday. */
  days: number
  sum: number
  /** Arithmetic mean of the supplied days; null when there is none. */
  mean: number | null
  /** The middle value, which one unusually strong day cannot pull up the way it pulls the mean. */
  median: number | null
  highest: number | null
  lowest: number | null
  /** Too few days to say anything about this weekday beyond listing them. */
  sparse: boolean
}

export interface WeekdayPattern {
  rows: WeekdayPatternRow[]
  totalDays: number
  /** Weekdays with at least `minimumDays` supplied days. Comparisons only make sense among these. */
  comparable: IsoWeekday[]
  /** True when one single day holds more than half of all views: any weekday reading is then that one day. */
  dominatedBySingleDay: boolean
}

/** Below this, a weekday is shown but not treated as comparable. A judgement, stated as one. */
export const weekdayMinimumDays = 4

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b), middle = sorted.length >> 1
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

/**
 * Describes on which weekdays the supplied daily views fell. It is a description of one
 * report's own numbers: it does not know the source's timezone, does not know when
 * anything was published, and is not advice on when to publish.
 */
export function weekdayPattern(rows: readonly { date: string; views: number }[]): WeekdayPattern {
  if (!Array.isArray(rows) || !rows.length || rows.length > 500) throw Error('Invalid weekday view')
  const buckets = new Map<IsoWeekday, number[]>()
  let total = 0, highestDay = 0
  rows.forEach((row, index) => {
    if (analyticsDate(row.date, 'iso') !== row.date || !Number.isSafeInteger(row.views) || row.views < 0 || (index && rows[index - 1].date >= row.date)) throw Error('Use exact, unique, ordered daily values')
    total += row.views
    if (!Number.isSafeInteger(total)) throw Error('View sum exceeds safe integer precision')
    highestDay = Math.max(highestDay, row.views)
    const weekday = ((new Date(row.date + 'T00:00:00.000Z').getUTCDay() + 6) % 7 + 1) as IsoWeekday
    buckets.set(weekday, [...(buckets.get(weekday) ?? []), row.views])
  })
  const result = ([1, 2, 3, 4, 5, 6, 7] as const).map(weekday => {
    const values = buckets.get(weekday) ?? [], sum = values.reduce((a, b) => a + b, 0)
    return {
      weekday, days: values.length, sum,
      mean: values.length ? sum / values.length : null,
      median: values.length ? median(values) : null,
      highest: values.length ? Math.max(...values) : null,
      lowest: values.length ? Math.min(...values) : null,
      sparse: values.length < weekdayMinimumDays
    }
  })
  return {
    rows: result, totalDays: rows.length,
    comparable: result.filter(row => !row.sparse).map(row => row.weekday),
    dominatedBySingleDay: total > 0 && highestDay * 2 > total
  }
}
