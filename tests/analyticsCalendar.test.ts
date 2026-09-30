import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { analyticsCalendarPeriods } from '../src/core/analyticsCalendar'
import { analyticsSummary, buildPerformanceReport, loadAnalyticsSource, newAnalyticsDraft } from '../src/core/localAnalytics'
import { AnalyticsCalendarView } from '../src/components/AnalyticsCalendarView'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import { translateUi } from '../src/core/uiMessages'

it.each([
  ['2020-12-31', '2020-W53', '2020-12-28', '2021-01-03'],
  ['2021-01-01', '2020-W53', '2020-12-28', '2021-01-03'],
  ['2021-01-04', '2021-W01', '2021-01-04', '2021-01-10'],
  ['2022-01-01', '2021-W52', '2021-12-27', '2022-01-02'],
  ['2024-12-30', '2025-W01', '2024-12-30', '2025-01-05'],
  ['2016-01-01', '2015-W53', '2015-12-28', '2016-01-03'],
  ['2017-01-01', '2016-W52', '2016-12-26', '2017-01-01'],
  ['0001-01-01', '0001-W01', '0001-01-01', '0001-01-07'],
  ['0099-01-01', '0099-W01', '0098-12-29', '0099-01-04'],
  ['9999-12-31', '9999-W52', '9999-12-27', '+010000-01-02']
])('uses ISO week-year and full Monday–Sunday boundaries for %s', (date, key, from, through) => {
  expect(analyticsCalendarPeriods([{ date, views: 10 }], 'week')).toEqual([{ key, from, through, views: 10, reportedDays: 1, calendarDays: 7, missingDays: 6 }])
})
it.each([['2024-02-15', 29, '2024-02-29'], ['2026-02-15', 28, '2026-02-28'], ['1900-02-15', 28, '1900-02-28'], ['2000-02-15', 29, '2000-02-29'], ['0004-02-29', 29, '0004-02-29'], ['9999-12-31', 31, '9999-12-31']])('uses actual month length including leap/century/year limits for %s', (date, days, through) => {
  const group = analyticsCalendarPeriods([{ date: String(date), views: 0 }], 'month')[0]
  expect(group).toMatchObject({ from: String(date).slice(0, 7) + '-01', through, calendarDays: days, reportedDays: 1, views: 0, missingDays: Number(days) - 1 })
})
it('counts complete weeks including zero days and does not mutate original readings', () => {
  const rows = Object.freeze(Array.from({ length: 7 }, (_, index) => Object.freeze({ date: `2026-03-${String(23 + index).padStart(2, '0')}`, views: index })))
  const original = JSON.stringify(rows), groups = analyticsCalendarPeriods(rows, 'week')
  expect(groups).toEqual([{ key: '2026-W13', from: '2026-03-23', through: '2026-03-29', views: 21, reportedDays: 7, calendarDays: 7, missingDays: 0 }])
  groups[0].views = 999; expect(JSON.stringify(rows)).toBe(original)
})
it('does not fill entirely absent weeks/months or extrapolate partial periods', () => {
  const rows = [{ date: '2026-01-31', views: 31 }, { date: '2026-03-02', views: 20 }]
  expect(analyticsCalendarPeriods(rows, 'month')).toEqual([
    { key: '2026-01', from: '2026-01-01', through: '2026-01-31', views: 31, reportedDays: 1, calendarDays: 31, missingDays: 30 },
    { key: '2026-03', from: '2026-03-01', through: '2026-03-31', views: 20, reportedDays: 1, calendarDays: 31, missingDays: 30 }
  ])
  const weekly = analyticsCalendarPeriods(rows, 'week')
  expect(weekly).toHaveLength(2); expect(weekly.reduce((sum, g) => sum + g.views, 0)).toBe(51)
  expect(weekly.every(g => g.reportedDays === 1 && g.missingDays === 6)).toBe(true)
})
it('splits Sunday/Monday and calendar month boundaries without combining unrelated reports', () => {
  const rows = [{ date: '2026-09-27', views: 1200 }, { date: '2026-09-29', views: 330 }, { date: '2026-09-30', views: 0 }, { date: '2026-10-01', views: 5 }]
  const weekly = analyticsCalendarPeriods(rows, 'week')
  expect(weekly.map(g => [g.key, g.views, g.reportedDays, g.missingDays])).toEqual([['2026-W39', 1200, 1, 6], ['2026-W40', 335, 3, 4]])
  expect(analyticsCalendarPeriods(rows, 'month').map(g => [g.key, g.views, g.reportedDays, g.missingDays])).toEqual([['2026-09', 1530, 3, 27], ['2026-10', 5, 1, 30]])
  expect(analyticsCalendarPeriods(rows, 'day').map(g => [g.key, g.views, g.missingDays])).toEqual(rows.map(r => [r.date, r.views, 0]))
})
it('preserves total/count invariants across the maximum 500-day input and three views', () => {
  const rows = Array.from({ length: 500 }, (_, i) => ({ date: new Date(Date.UTC(2023, 10, 1 + i)).toISOString().slice(0, 10), views: i % 13 }))
  for (const kind of ['day', 'week', 'month'] as const) {
    const groups = analyticsCalendarPeriods(rows, kind)
    expect(groups.reduce((n, g) => n + g.views, 0)).toBe(rows.reduce((n, r) => n + r.views, 0))
    expect(groups.reduce((n, g) => n + g.reportedDays, 0)).toBe(500)
    expect(groups.every(g => g.reportedDays + g.missingDays === g.calendarDays)).toBe(true)
  }
})
it('rejects bad kind, malformed dates, duplicates/order, excess rows and imprecise sums', () => {
  const valid = [{ date: '2026-09-27', views: 1 }]
  expect(() => analyticsCalendarPeriods(valid, 'year' as 'day')).toThrow()
  for (const rows of [[], Array(501).fill(valid[0]), [valid[0], valid[0]], [{ date: '2026-02-30', views: 1 }], [{ date: '2026-09-27 ', views: 1 }], [{ date: '2026-09-28', views: 1 }, valid[0]], [{ ...valid[0], views: -1 }], [{ ...valid[0], views: 1.5 }], [{ ...valid[0], views: NaN }], [{ ...valid[0], views: Number.MAX_SAFE_INTEGER }, { date: '2026-09-28', views: 1 }]]) expect(() => analyticsCalendarPeriods(rows, 'month')).toThrow()
})
it('retained report provenance and original rows remain byte-identical across views', async () => {
  const source = await loadAnalyticsSource(new TextEncoder().encode('Date,Views\n2026-09-27,1200\n2026-09-29,330\n2026-09-30,0'), 'SYNTHETIC.csv')
  const report = buildPerformanceReport(source, { ...newAnalyticsDraft(), name: 'SYNTHETIC', scope: 'One video' }), before = JSON.stringify(report), sum = analyticsSummary(report).sum
  for (const kind of ['day', 'week', 'month'] as const) expect(analyticsCalendarPeriods(report.rows, kind).reduce((n, g) => n + g.views, 0)).toBe(sum)
  expect(JSON.stringify(report)).toBe(before)
})
it.each(['de', 'en', 'fr'] as const)('renders no-request calendar controls and honest boundaries in %s', async language => {
  const report = buildPerformanceReport(await loadAnalyticsSource(new TextEncoder().encode('D,V\n2026-09-30,0'), 'SYNTHETIC.csv'), { ...newAnalyticsDraft(), name: 'SYNTHETIC', scope: 'One video' }), fetch = vi.spyOn(globalThis, 'fetch')
  try {
    const html = renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: language, children: createElement(AnalyticsCalendarView, { report }) }))
    for (const key of ['analytics.periodView', 'analytics.periodHelp', 'analytics.period.week', 'analytics.period.month'] as const) expect(html).toContain(translateUi(language, key).replace(/&/g, '&amp;').replace(/'/g, '&#x27;'))
    expect(html).toContain('height="0"'); expect(fetch).not.toHaveBeenCalled()
  } finally { fetch.mockRestore() }
})
