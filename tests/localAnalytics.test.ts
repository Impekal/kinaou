import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createHash } from 'node:crypto'
import { expect, it, vi } from 'vitest'
import { AnalyticsSession, analyticsDate, analyticsSummary, analyticsViews, buildPerformanceReport, loadAnalyticsSource, newAnalyticsDraft, parseAnalyticsCsv, retainedPerformanceReports } from '../src/core/localAnalytics'
import { createProject, parseProject } from '../src/core/project'
import { PersistentVersionHistory } from '../src/core/versioning'
import { AnalyticsPanel, AnalyticsReportView } from '../src/components/AnalyticsPanel'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import { translateUi } from '../src/core/uiMessages'
const csv = 'Date,Views,Private\r\n2026-09-29,30,PRIVATE_UNSELECTED\r\n2026-09-27,10,=HYPERLINK(""ignored"")\r\n'
const validCsv = csv.replace('=HYPERLINK(""ignored"")', 'PRIVATE_OTHER')
const draft = () => ({ ...newAnalyticsDraft(), name: 'SYNTHETIC own daily views', scope: 'Synthetic one video' })
const source = (text = validCsv) => loadAnalyticsSource(new TextEncoder().encode(text), 'synthetic.csv')
it('hashes original BOM/UTF-8 bytes, keeps Unicode and rejects malformed encodings/control/size', async () => {
  const bytes = new TextEncoder().encode('\ufeffDate,Views\n2026-09-29,1\n'), pending = loadAnalyticsSource(bytes, 'École.csv')
  const expected = createHash('sha256').update(bytes).digest('hex'); bytes.fill(0)
  const read = await pending
  expect(read.file).toEqual({ filename: 'École.csv', bytes: 27, sha256: expected })
  expect(read.text.startsWith('Date,')).toBe(true)
  for (const bytes of [new Uint8Array(), new Uint8Array(524289), new Uint8Array([0xff]), new Uint8Array([0])]) await expect(loadAnalyticsSource(bytes, 'input.csv')).rejects.toThrow()
  await expect(loadAnalyticsSource(new Uint8Array([65]), 'bad\nname')).rejects.toThrow()
})
it('parses explicit comma/semicolon, escaped quotes and quoted delimiters/newlines without execution', () => {
  expect(parseAnalyticsCsv('Day;Views;Note\r\n2026-09-01;"1,234";"line1\nline2; ""quoted"""\r\n', ';')).toEqual({ headers: ['Day', 'Views', 'Note'], rows: [['2026-09-01', '1,234', 'line1\nline2; "quoted"']] })
  expect(parseAnalyticsCsv('D,V,N\n2026-09-01,0,=1+1\n', ',').rows[0][2]).toBe('=1+1')
  expect(parseAnalyticsCsv('D,V,N\n2026-09-01,0,""', ',').rows[0][2]).toBe('')
})
it.each(['', 'D,V', 'D,V\n', 'D,V\n1', 'D,V\n1,2,3', 'D,V\n\n', 'D,V\n"oops,2', 'D,V\n"x"z,2', 'D,V\nx"z,2', 'D,V\r1,2', ',V\n1,2', 'D,V\n1,2\n\n'])('rejects malformed CSV %j', text => {
  expect(() => parseAnalyticsCsv(text, ',')).toThrow()
})
it('bounds CSV byte, column, header, cell and record sizes', () => {
  expect(() => parseAnalyticsCsv('x'.repeat(524289), ',')).toThrow()
  expect(() => parseAnalyticsCsv('D,' + 'x'.repeat(201) + '\n1,2', ',')).toThrow()
  expect(() => parseAnalyticsCsv('D,V\n1,' + 'x'.repeat(4097), ',')).toThrow()
  expect(() => parseAnalyticsCsv(Array(65).fill('h').join(',') + '\n' + Array(65).fill('1').join(','), ',')).toThrow()
  expect(() => parseAnalyticsCsv('D,V\n' + '1,2\n'.repeat(502), ',')).toThrow()
})
it.each([['2024-02-29', 'iso', '2024-02-29'], ['29/02/2024', 'dmy-slash', '2024-02-29'], ['02/29/2024', 'mdy-slash', '2024-02-29'], ['29.02.2024', 'dmy-dot', '2024-02-29'], ['0001-01-01', 'iso', '0001-01-01']] as const)('interprets explicit calendar format %s/%s', (raw, format, expected) => expect(analyticsDate(raw, format)).toBe(expected))
it.each(['2026-02-29', '2026-02-30', '2026-13-01', '0000-01-01', '26-09-01', '2026-9-1', '2026-09-01T00:00:00Z'])('rejects invalid/ambiguous calendar %s', value => expect(() => analyticsDate(value, 'iso')).toThrow())
it('requires explicit decimal-free grouping and never guesses abbreviations or precision', () => {
  expect(analyticsViews('1,234', 'comma')).toBe(1234); expect(analyticsViews('1.234', 'dot')).toBe(1234); expect(analyticsViews('1 234', 'space')).toBe(1234)
  expect(analyticsViews(' 0 ', 'plain')).toBe(0)
  for (const value of ['1.5', '1e3', '1K', '-1', '+1', '10%', 'NaN', '', '1,234', '9007199254740992']) expect(() => analyticsViews(value, 'plain')).toThrow()
  for (const value of ['12,34', '1.234', '1,234.00', '1234,567']) expect(() => analyticsViews(value, 'comma')).toThrow()
  expect(() => analyticsViews('1\u00a0234', 'space')).toThrow()
})
it('builds sorted exact original daily evidence, sum and unknown gaps; drops unrelated cells', async () => {
  const report = buildPerformanceReport(await source(), draft())
  expect(report.rows.map(r => [r.date, r.views, r.record])).toEqual([['2026-09-27', 10, 3], ['2026-09-29', 30, 2]])
  expect(analyticsSummary(report)).toEqual({ sum: 40, count: 2, from: '2026-09-27', through: '2026-09-29', missing: 1 })
  expect(JSON.stringify(report)).not.toContain('PRIVATE_'); expect(report.columns.count).toBe(3)
  expect(report.rows[1].rawViews).toBe('30'); expect(report.source.sha256).toBe(createHash('sha256').update(validCsv).digest('hex'))
})
it('never silently excludes summaries, valid daily rows, duplicates, decimals or unsafe sums', async () => {
  const summary = await source('D,V\nTotal,30\n2026-09-01,10\n2026-09-02,20\n'), d = draft()
  expect(() => buildPerformanceReport(summary, d)).toThrow()
  d.mapping.skipFirstSummary = true
  expect(buildPerformanceReport(summary, d).excludedSummary).toEqual({ record: 2, rawDate: 'Total', rawViews: '30' })
  for (const text of ['D,V\n2026-09-01,10\n2026-09-01,20', 'D,V\n2026-09-01,1.5', 'D,V\n2026-09-01,9007199254740991\n2026-09-02,1']) {
    const s = await source(text); expect(() => buildPerformanceReport(s, draft())).toThrow()
  }
  const daily = await source(); expect(() => buildPerformanceReport(daily, d)).toThrow(/cannot be excluded/)
})
it('refuses forged/changed source bindings and invalid mapping/drafts', async () => {
  const s = await source(), d = draft()
  expect(() => buildPerformanceReport(structuredClone(s), d)).toThrow()
  for (const input of [{ ...d, name: '' }, { ...d, scope: '' }, { ...d, extra: true }, { ...d, mapping: { ...d.mapping, dateColumn: 1 } }, { ...d, mapping: { ...d.mapping, viewsColumn: 63 } }]) expect(() => buildPerformanceReport(s, input)).toThrow()
  s.text += '2026-09-30,99,other\n'; expect(() => buildPerformanceReport(s, d)).toThrow()
})
it('saves only after acknowledgement/history, preserves unrelated project state, and reopens exact reports', async () => {
  const p = createProject('Keep'), d = draft(), s = await source(), session = new AnalyticsSession(), save = vi.fn(), snap = vi.fn()
  p.metadata.unrelated = { keep: true }; const before = JSON.stringify(p), review = session.prepare(p, s, d)
  expect(() => session.commit(p, review, false, snap, save)).toThrow()
  session.commit(p, review, true, snap, save)
  const next = parseProject(JSON.parse(JSON.stringify(save.mock.calls[0][0])))
  expect(retainedPerformanceReports(next)).toEqual([review]); expect(next.metadata.unrelated).toEqual({ keep: true }); expect(next.tracks).toEqual(p.tracks); expect(next.assets).toEqual(p.assets); expect(JSON.stringify(p)).toBe(before)
  expect(snap).toHaveBeenCalledTimes(1); expect(() => session.commit(p, review, true, snap, save)).toThrow()
  expect(() => new AnalyticsSession().prepare(next, s, d)).toThrow(/already saved/)
})
it('save-only retries keep one snapshot, exact IDs and bytes despite a failing mutating sink', async () => {
  const p = createProject('Retry'), session = new AnalyticsSession(), review = session.prepare(p, await source(), draft()), snap = vi.fn(), writes: unknown[] = []
  expect(() => session.commit(p, review, true, snap, next => { writes.push(structuredClone(next)); next.title = 'Mutated'; throw Error('full') })).toThrow('full')
  session.commit(p, review, true, snap, next => writes.push(next))
  expect(writes[0]).toEqual(writes[1]); expect(snap).toHaveBeenCalledTimes(1)
})
it('failed history never writes a report; forged and modified reviews cannot commit', async () => {
  const p = createProject('History'), session = new AnalyticsSession(), review = session.prepare(p, await source(), draft()), save = vi.fn(), snap = vi.fn()
  expect(() => session.commit(p, review, true, () => { throw Error('history full') }, save)).toThrow('history full'); expect(save).not.toHaveBeenCalled()
  expect(() => session.commit(p, structuredClone(review), true, snap, save)).toThrow()
  review.rows[0].views++; expect(() => session.commit(p, review, true, snap, save)).toThrow(); expect(snap).not.toHaveBeenCalled()
})
it.each(['project', 'source', 'draft'] as const)('permanently rejects observed %s A→B→A review', async change => {
  const p = createProject('Stale'), s = await source(), d = draft(), session = new AnalyticsSession(), review = session.prepare(p, s, d)
  session.observe(change === 'project' ? { ...p, title: 'Changed' } : p, change === 'source' ? null : s, change === 'draft' ? { ...d, scope: 'Changed' } : d)
  session.observe(p, s, d)
  expect(session.current(review)).toBe(false); expect(() => session.commit(p, review, true, vi.fn(), vi.fn())).toThrow()
})
it('validates retained data without silent repair and enforces library limits', async () => {
  const report = buildPerformanceReport(await source(), draft()), p = createProject('Corruption')
  for (const mutate of [(r: any) => { r.rows[0].views++ }, (r: any) => { r.rows.reverse() }, (r: any) => { r.rows[0].record = 500 }, (r: any) => { r.extra = true }]) {
    const next = structuredClone(report); mutate(next); p.metadata.performanceReportsV1 = [next]; expect(() => retainedPerformanceReports(p)).toThrow()
  }
  for (const raw of [{}, [report, report], Array(21).fill(report)]) { p.metadata.performanceReportsV1 = raw; expect(() => retainedPerformanceReports(p)).toThrow() }
})
it('accepts 500 exact days, rejects 501 and refuses overflow of the retained byte budget', async () => {
  const rows = Array.from({ length: 501 }, (_, index) => new Date(Date.UTC(2020, 0, 1 + index)).toISOString().slice(0, 10) + ',0')
  const report = buildPerformanceReport(await source('D,V\n' + rows.slice(0, 500).join('\n')), draft())
  expect(analyticsSummary(report)).toMatchObject({ count: 500, sum: 0, missing: 0 })
  const excessive = await source('D,V\n' + rows.join('\n'))
  expect(() => buildPerformanceReport(excessive, draft())).toThrow()
  const p = createProject('Budget'), huge = structuredClone(report)
  huge.rows.forEach(row => { row.rawViews = ' '.repeat(4095) + '0' })
  p.metadata.performanceReportsV1 = [huge]
  expect(() => retainedPerformanceReports(p)).toThrow(/oversized/)
})
it('leap-day gaps, explicit ambiguous dates and a single zero day remain exact', async () => {
  const s = await source('D;V\n28/02/2024;0\n01/03/2024;2'), d = draft()
  d.mapping.delimiter = ';'; d.mapping.dateFormat = 'dmy-slash'
  expect(analyticsSummary(buildPerformanceReport(s, d))).toMatchObject({ sum: 2, count: 2, missing: 1 })
  expect(analyticsDate('01/03/2024', 'dmy-slash')).toBe('2024-03-01')
  expect(analyticsDate('01/03/2024', 'mdy-slash')).toBe('2024-01-03')
  expect(analyticsSummary(buildPerformanceReport(await source('D,V\n2026-09-30,0'), draft()))).toMatchObject({ sum: 0, count: 1, missing: 0 })
})
it.each(['de', 'en', 'fr'] as const)('renders real local controls and honest report boundaries in %s without requests/writes', async language => {
  const fetch = vi.spyOn(globalThis, 'fetch'), save = vi.fn(), history = new PersistentVersionHistory({ getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() })
  try {
    const html = renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: language, children: createElement(AnalyticsPanel, { project: createProject('Analytics'), history, onProjectChange: save }) }))
    for (const key of ['analytics.heading', 'analytics.help', 'analytics.boundary', 'analytics.empty', 'analytics.prepare'] as const) expect(html).toContain(translateUi(language, key).replace(/&/g, '&amp;').replace(/'/g, '&#x27;'))
    const view = renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: language, children: createElement(AnalyticsReportView, { report: buildPerformanceReport(await source(), draft()) }) }))
    expect(view).toContain('<svg'); expect(view).toContain('2026-09-27'); expect(view).toContain('2026-09-29'); expect(view).not.toContain('2026-09-28'); expect(view).not.toContain('PRIVATE_')
    expect(fetch).not.toHaveBeenCalled(); expect(save).not.toHaveBeenCalled()
  } finally { fetch.mockRestore() }
})
