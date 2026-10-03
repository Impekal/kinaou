import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { AnalyticsComparisonError, compareAnalyticsPeriods } from '../src/core/analyticsComparison'
import { buildPerformanceReport, loadAnalyticsSource, newAnalyticsDraft } from '../src/core/localAnalytics'
import { AnalyticsComparisonView } from '../src/components/AnalyticsComparisonView'
import { AnalyticsReportView } from '../src/components/AnalyticsPanel'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import { uiAnalyticsComparisonMessages } from '../src/core/uiAnalyticsComparisonMessages'
import { translateUi } from '../src/core/uiMessages'

const range = (from: string, through = from) => ({ from, through })
const daily = (first: string, values: number[]) => values.map((views, i) => ({ date: new Date(Date.parse(first + 'T00:00:00.000Z') + i * 86400000).toISOString().slice(0, 10), views }))
const rows = daily('2026-03-27', [10, 20, 0, 30, 40, 20])
const baseline = range('2026-03-27', '2026-03-29'), comparison = range('2026-03-30', '2026-04-01')
function fails(input: typeof rows, a: typeof baseline, b: typeof baseline, code: AnalyticsComparisonError['code']) {
  try { compareAnalyticsPeriods(input, a, b); throw Error('Unexpected success') } catch (cause) { expect(cause).toBeInstanceOf(AnalyticsComparisonError); expect((cause as AnalyticsComparisonError).code).toBe(code) }
}
it('compares equal complete periods across DST/month boundaries without timezone shifts', () => {
  expect(compareAnalyticsPeriods(rows, baseline, comparison)).toEqual({ baseline: { ...baseline, days: 3, reportedDays: 3, reportedViews: 30, missingDates: [] }, comparison: { ...comparison, days: 3, reportedDays: 3, reportedViews: 90, missingDates: [] }, complete: true, difference: 60, percent: 200 })
})
it.each([[100, 50, -50, -50], [100, 0, -100, -100], [0, 10, 10, null], [0, 0, 0, null], [3, 4, 1, 100 / 3]])('handles reported zero and signed changes %s→%s', (a, b, difference, percent) => {
  const result = compareAnalyticsPeriods(daily('2026-09-01', [a!, b!]), range('2026-09-01'), range('2026-09-02'))
  expect(result.complete).toBe(true); expect(result.difference).toBe(difference)
  if (percent === null) expect(result.percent).toBeNull(); else expect(result.percent).toBeCloseTo(percent!)
})
it.each([0, 1, 2, 3, 4, 5])('does not replace missing day %s with zero or show a change', index => {
  // Keep extent sentinels so every missing target day is still within report bounds.
  const sparse = [{ date: '2026-03-26', views: 0 }, ...rows.filter((_, i) => i !== index), { date: '2026-04-02', views: 0 }]
  const result = compareAnalyticsPeriods(sparse, baseline, comparison)
  expect(result.complete).toBe(false); expect(result.difference).toBeNull(); expect(result.percent).toBeNull()
  expect([...result.baseline.missingDates, ...result.comparison.missingDates]).toEqual([rows[index].date])
})
it('identifies an entirely absent period without fabricating reported zero days', () => {
  const result = compareAnalyticsPeriods([{ date: '2026-03-26', views: 0 }, ...rows.slice(3)], baseline, comparison)
  expect(result.baseline).toMatchObject({ reportedDays: 0, reportedViews: 0, missingDates: rows.slice(0, 3).map(r => r.date) })
  expect(result.difference).toBeNull()
})
it.each(['2024-02-28', '0001-01-01', '0099-12-29', '9999-12-26'])('respects leap/year boundaries in %s', first => {
  const values = daily(first, [1, 2, 3, 4, 5, 6]), result = compareAnalyticsPeriods(values, range(values[0].date, values[2].date), range(values[3].date, values[5].date))
  expect(result.baseline.days).toBe(3); expect(result.comparison.days).toBe(3); expect(result.difference).toBe(9)
})
it('accepts at most 366 days per equal period, with explicit sparse coverage', () => {
  const endpoints = daily('2023-01-01', Array(732).fill(0)), a = range(endpoints[0].date, endpoints[365].date), b = range(endpoints[366].date, endpoints[731].date)
  const result = compareAnalyticsPeriods([endpoints[0], endpoints[731]], a, b)
  expect(result.baseline.days).toBe(366); expect(result.baseline.missingDates).toHaveLength(365); expect(result.comparison.missingDates).toHaveLength(365)
  fails([endpoints[0], endpoints[731]], range(endpoints[0].date, endpoints[366].date), b, 'length')
})
it.each(['2026-02-30', '0000-01-01', '2026-3-27', '2026-03-27 ', '', 'tomorrow'])('refuses invalid or repaired date %s', date => fails(rows, range(date, '2026-03-29'), comparison, 'dates'))
it('refuses reversed, overlapping, unequal or outside-report ranges', () => {
  fails(rows, comparison, baseline, 'order')
  fails(rows, baseline, range('2026-03-29', '2026-03-31'), 'order')
  fails(rows, range('2026-03-29', '2026-03-27'), comparison, 'length')
  fails(rows, range('2026-03-28', '2026-03-29'), comparison, 'length')
  fails(rows, range('2026-03-26', '2026-03-28'), comparison, 'range')
  fails(rows, baseline, range('2026-03-31', '2026-04-02'), 'range')
})
it('refuses malformed source rows rather than silently repairing or adding them', () => {
  for (const invalid of [[], [rows[1], rows[0]], [rows[0], rows[0]], Array(501).fill(rows[0]), [{ ...rows[0], views: -1 }, rows[5]], [{ ...rows[0], views: 0.5 }, rows[5]], [{ ...rows[0], views: Infinity }, rows[5]], [{ ...rows[0], date: '2026-02-30' }, rows[5]], [{ ...rows[0], views: Number.MAX_SAFE_INTEGER }, rows[5]]]) fails(invalid, baseline, comparison, 'source')
})
it('retains safe-integer exact differences near the supported limit', () => {
  const values = daily('2026-09-01', [Number.MAX_SAFE_INTEGER - 1, 1]), result = compareAnalyticsPeriods(values, range(values[0].date), range(values[1].date))
  expect(result.difference).toBe(2 - Number.MAX_SAFE_INTEGER); expect(Number.isFinite(result.percent)).toBe(true)
})
it('does not mutate frozen inputs or allow output mutation to poison a later comparison', () => {
  const source = Object.freeze(rows.map(r => Object.freeze({ ...r }))), a = Object.freeze({ ...baseline }), b = Object.freeze({ ...comparison }), before = JSON.stringify([source, a, b])
  const result = compareAnalyticsPeriods(source, a, b); result.baseline.missingDates.push('invented'); result.comparison.reportedViews = 999
  expect(JSON.stringify([source, a, b])).toBe(before); expect(compareAnalyticsPeriods(source, a, b).comparison.reportedViews).toBe(90)
})
it('keeps one retained CSV report and source provenance byte-identical', async () => {
  const report = buildPerformanceReport(await loadAnalyticsSource(new TextEncoder().encode('Day,Views\n' + rows.map(r => `${r.date},${r.views}`).join('\n')), 'SYNTHETIC.csv'), { ...newAnalyticsDraft(), name: 'SYNTHETIC report', scope: 'One channel, daily non-cumulative views' }), before = JSON.stringify(report)
  expect(compareAnalyticsPeriods(report.rows, baseline, comparison).percent).toBe(200)
  expect(JSON.stringify(report)).toBe(before)
})
it.each(['de', 'en', 'fr'] as const)('renders accessible explicit-only comparison controls in %s without requests', async language => {
  const report = buildPerformanceReport(await loadAnalyticsSource(new TextEncoder().encode('D,V\n2026-09-01,1\n2026-09-02,2'), 'SYNTHETIC.csv'), { ...newAnalyticsDraft(), name: 'SYNTHETIC', scope: 'One video' }), fetch = vi.spyOn(globalThis, 'fetch')
  try {
    const html = renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: language, children: createElement(AnalyticsComparisonView, { report }) }))
    expect(html.match(/type="date"/g)).toHaveLength(4); expect(html).toContain('disabled=""'); expect(html).not.toContain('<table>')
    for (const key of Object.keys(uiAnalyticsComparisonMessages) as Array<keyof typeof uiAnalyticsComparisonMessages>) expect(translateUi(language, key)).not.toBe(key)
    const integrated = renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: language, children: createElement(AnalyticsReportView, { report }) }))
    expect(integrated).toContain(translateUi(language, 'analytics.compare.heading')); expect(integrated).toContain(report.source.sha256); expect(fetch).not.toHaveBeenCalled()
  } finally { fetch.mockRestore() }
})
