import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AnalyticsWeekdayView } from '../src/components/AnalyticsWeekdayView'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import { weekdayMinimumDays, weekdayPattern } from '../src/core/analyticsWeekday'
import { buildPerformanceReport, loadAnalyticsSource, newAnalyticsDraft } from '../src/core/localAnalytics'
import { uiLanguages } from '../src/core/uiLanguage'
import { translateUi } from '../src/core/uiMessages'

/** Consecutive days from a Monday (2026-06-01), one value per day. */
function days(values: number[], start = '2026-06-01') {
  const first = Date.parse(start + 'T00:00:00.000Z')
  return values.map((views, index) => ({ date: new Date(first + index * 86400000).toISOString().slice(0, 10), views }))
}

describe('weekday pattern', () => {
  it('puts each day on its own weekday, Monday first', () => {
    const pattern = weekdayPattern(days([10, 20, 30, 40, 50, 60, 70]))
    expect(pattern.rows.map(row => [row.weekday, row.days, row.sum])).toEqual([[1, 1, 10], [2, 1, 20], [3, 1, 30], [4, 1, 40], [5, 1, 50], [6, 1, 60], [7, 1, 70]])
    expect(pattern.totalDays).toBe(7)
  })

  it('reports the typical day as the median, which one outlier does not move', () => {
    // Four Mondays: 100, 100, 100 and one day of 10,000.
    const values: number[] = Array.from({ length: 28 }, (_, index) => index % 7 === 0 ? 100 : 50)
    values[21] = 10_000
    const monday = weekdayPattern(days(values)).rows[0]
    expect(monday).toMatchObject({ days: 4, sum: 10_300, mean: 2575, median: 100, lowest: 100, highest: 10_000, sparse: false })
  })

  it('uses the mean of the two middle days for an even count', () => {
    const tuesday = weekdayPattern(days([0, 10, 0, 0, 0, 0, 0, 0, 25])).rows[1]
    expect(tuesday).toMatchObject({ days: 2, median: 17.5, mean: 17.5 })
  })

  it('treats a weekday with too few days as listed but not comparable', () => {
    const pattern = weekdayPattern(days(Array.from({ length: 24 }, () => 10)))
    // 24 days from a Monday: Monday–Wednesday occur four times, the rest three times.
    expect(pattern.rows.map(row => row.days)).toEqual([4, 4, 4, 3, 3, 3, 3])
    expect(pattern.comparable).toEqual([1, 2, 3])
    expect(pattern.rows[3].sparse).toBe(true)
    expect(weekdayMinimumDays).toBe(4)
  })

  it('leaves a weekday with no day empty rather than zero', () => {
    const friday = weekdayPattern(days([5, 5, 5])).rows[4]
    expect(friday).toEqual({ weekday: 5, days: 0, sum: 0, mean: null, median: null, highest: null, lowest: null, sparse: true })
  })

  it('says when one single day holds more than half of all views', () => {
    expect(weekdayPattern(days([10, 10, 100])).dominatedBySingleDay).toBe(true)
    expect(weekdayPattern(days([10, 10, 20])).dominatedBySingleDay).toBe(false)
    expect(weekdayPattern(days([0, 0, 0])).dominatedBySingleDay).toBe(false)
  })

  it('skips calendar gaps without inventing zero days', () => {
    const rows = [{ date: '2026-06-01', views: 10 }, { date: '2026-06-15', views: 30 }]
    expect(weekdayPattern(rows).rows[0]).toMatchObject({ days: 2, sum: 40, median: 20 })
    expect(weekdayPattern(rows).totalDays).toBe(2)
  })

  it('refuses unordered, duplicated or malformed days', () => {
    expect(() => weekdayPattern([{ date: '2026-06-02', views: 1 }, { date: '2026-06-01', views: 1 }])).toThrow()
    expect(() => weekdayPattern([{ date: '2026-06-01', views: 1 }, { date: '2026-06-01', views: 1 }])).toThrow()
    expect(() => weekdayPattern([{ date: '2026-6-1', views: 1 }])).toThrow()
    expect(() => weekdayPattern([{ date: '2026-06-01', views: -1 }])).toThrow()
    expect(() => weekdayPattern([])).toThrow()
  })
})

describe('weekday view', () => {
  async function report(values: number[]) {
    const csv = ['Date,Views', ...days(values).map(row => `${row.date},${row.views}`)].join('\n') + '\n'
    const source = await loadAnalyticsSource(new TextEncoder().encode(csv), 'synthetic.csv')
    return buildPerformanceReport(source, { ...newAnalyticsDraft(), name: 'Kanal', scope: 'Alle Videos' })
  }

  it('shows the table, the boundary and the comparable count in every language', async () => {
    const saved = await report(Array.from({ length: 28 }, (_, index) => 100 + index))
    for (const language of uiLanguages) {
      const html = renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: language, children: createElement(AnalyticsWeekdayView, { report: saved }) }))
      expect(html).toContain(translateUi(language, 'analytics.weekday.heading'))
      expect(html).toContain(translateUi(language, 'analytics.weekday.boundary').slice(0, 30))
      expect(html).toContain(translateUi(language, 'analytics.weekday.summary', { days: 28, comparable: 7 }))
      expect(html).toContain(translateUi(language, 'analytics.weekday.day.1'))
      expect(html).not.toContain(translateUi(language, 'analytics.weekday.notEnough', { minimum: 4 }).slice(0, 25))
    }
  })

  it('says a short report cannot support a weekday comparison', async () => {
    const html = renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: 'en', children: createElement(AnalyticsWeekdayView, { report: await report([10, 20, 30, 40, 50]) }) }))
    expect(html).toContain('A weekday comparison is not possible with it')
    expect(html).toContain('Too few days to compare (under 4)')
    expect(html).toContain('no day')
  })

  it('warns when the pattern is really one day', async () => {
    const values = Array.from({ length: 28 }, () => 10); values[9] = 5000
    const html = renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: 'de', children: createElement(AnalyticsWeekdayView, { report: await report(values) }) }))
    expect(html).toContain('Ein einziger Tag enthält mehr als die Hälfte aller Aufrufe')
  })
})
