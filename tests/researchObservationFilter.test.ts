import { expect, it } from 'vitest'
import { filterResearchObservations, newResearchObservationFilter, type ResearchObservationFilter } from '../src/core/researchObservationFilter'
import { createProject, parseProject } from '../src/core/project'
import { retainSearchTrend, retainedSearchTrends, type RetainedSearchTrend } from '../src/core/searchTrends'

function sample(country: 'DE' | 'FR' | 'CA', publishedAt: string, query: string, retrievedAt = '2026-09-30T12:00:00.000Z'): RetainedSearchTrend {
  return { schemaVersion: 1, provider: 'google-trends-rss', country, sourceUrl: `https://trends.google.com/trending/rss?geo=${country}`, retrievedAt, feedSha256: 'a'.repeat(64), items: [{ query, publishedAt, reportedTraffic: '200+', articles: [{ title: 'École et Tactique — synthetic test', source: 'Example Journal', url: 'https://example.org/report' }] }] }
}
const records = [sample('DE', '2026-09-27T23:59:59.999Z', 'Football sample'), sample('FR', '2026-09-28T00:00:00.000Z', 'École sample'), sample('CA', '2026-09-29T00:00:00.000Z', 'Learning sample')]
const run = (filter: Partial<ResearchObservationFilter> = {}, items = records) => filterResearchObservations(items, { ...newResearchObservationFilter(), ...filter })

it('shows all saved records by descending publication date without mutating records or provider data', () => {
  const before = JSON.stringify(records), filters = newResearchObservationFilter()
  expect(run().map(item => item.index)).toEqual([2, 1, 0])
  expect(run({ order: 'oldest' }).map(item => item.index)).toEqual([0, 1, 2])
  expect(JSON.stringify(records)).toBe(before)
  expect(filters).toEqual(newResearchObservationFilter())
  expect(run()[0].entry.items[0].reportedTraffic).toBe('200+')
})
it('includes complete UTC days, excludes the following midnight and supports open bounds', () => {
  expect(run({ from: '2026-09-27', through: '2026-09-27' }).map(item => item.index)).toEqual([0])
  expect(run({ from: '2026-09-28', through: '2026-09-28' }).map(item => item.index)).toEqual([1])
  expect(run({ through: '2026-09-28' })).toHaveLength(2)
  expect(run({ from: '2026-09-28' })).toHaveLength(2)
})
it('distinguishes retrieval from publication and preserves ledger order on equal timestamps', () => {
  expect(run({ from: '2026-09-30', through: '2026-09-30' })).toEqual([])
  expect(run({ from: '2026-09-30', through: '2026-09-30', dateBasis: 'retrieved' }).map(item => item.index)).toEqual([0, 1, 2])
  expect(run({ order: 'oldest', dateBasis: 'retrieved' }).map(item => item.index)).toEqual([0, 1, 2])
})
it('combines country, literal words, accents/case normalization and source names without translation', () => {
  expect(run({ country: 'FR', text: 'ECOLE journal' }).map(item => item.index)).toEqual([1])
  expect(run({ text: 'ＦＯＯＴＢＡＬＬ' }).map(item => item.index)).toEqual([0])
  expect(run({ text: 'football learning' })).toEqual([])
  expect(run({ text: 'example.org' })).toEqual([])
  expect(run({ text: '.*' })).toEqual([])
  expect(run({ text: '   ' })).toHaveLength(3)
})
it.each(['2026-02-29', '1900-02-29', '2026-04-31', '2026-13-01', '2026-00-01', '0000-01-01', '2026-9-1', '2026-09-01T00:00:00Z', 'not a date'])('rejects invalid or ambiguous calendar bound %s', from => {
  expect(() => run({ from })).toThrow(/UTC calendar/)
  expect(() => run({ through: from })).toThrow(/UTC calendar/)
})
it('accepts leap days and year bounds without host-timezone interpretation', () => {
  expect(() => run({ from: '2000-02-29', through: '9999-12-31' })).not.toThrow()
  expect(() => run({ from: '0001-01-01', through: '2024-02-29' })).not.toThrow()
  expect(() => run({ from: '2026-09-29', through: '2026-09-28' })).toThrow(/Start date/)
})
it.each([{ text: 'x'.repeat(201) }, { text: '\n' }, { country: 'worldwide' }, { dateBasis: 'language' }, { order: 'popular' }, { unknown: true }, { from: undefined }, { through: null }])('rejects malformed filter %# without returning a broad fallback', patch => {
  expect(() => run(patch as Partial<ResearchObservationFilter>)).toThrow()
})
it('keeps exact saved evidence through real project serialization and filtering', () => {
  let project = createProject('Original research')
  for (const record of records) project = retainSearchTrend(project, record, 0)
  const serialized = JSON.stringify(project), restored = parseProject(JSON.parse(serialized)), ledger = retainedSearchTrends(restored)
  expect(run({ country: 'FR', text: 'ecole' }, ledger)[0].entry).toEqual(records[1])
  expect(JSON.stringify(restored)).toBe(serialized)
  expect(run({ text: 'none' }, ledger)).toEqual([])
  expect(filterResearchObservations(ledger, newResearchObservationFilter())).toHaveLength(3)
  expect(JSON.stringify(restored)).toBe(serialized)
})
