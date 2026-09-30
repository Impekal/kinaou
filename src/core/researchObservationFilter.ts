import { searchTrendCountries, type SearchTrendCountry } from '../../worker/search-trends-protocol.mjs'
import type { RetainedSearchTrend } from './searchTrends'

export interface ResearchObservationFilter {
  text: string
  country: SearchTrendCountry | 'all'
  from: string
  through: string
  dateBasis: 'published' | 'retrieved'
  order: 'newest' | 'oldest'
}
export function newResearchObservationFilter(): ResearchObservationFilter {
  return { text: '', country: 'all', from: '', through: '', dateBasis: 'published', order: 'newest' }
}
function day(value: string): number | null {
  if (value === '') return null
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000-')) throw Error('Use a valid UTC calendar date')
  const stamp = Date.parse(value + 'T00:00:00.000Z')
  if (!Number.isFinite(stamp) || new Date(stamp).toISOString().slice(0, 10) !== value) throw Error('Use a valid UTC calendar date')
  return stamp
}
const normalized = (value: string) => value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()

/** Read-only view over the already validated ledger. Never a market/time-series metric. */
export function filterResearchObservations(records: readonly RetainedSearchTrend[], filter: ResearchObservationFilter) {
  if (!filter || Object.keys(filter).some(key => !['text', 'country', 'from', 'through', 'dateBasis', 'order'].includes(key)) ||
    typeof filter.text !== 'string' || filter.text.length > 200 || /[\x00-\x1f\x7f]/.test(filter.text) ||
    (filter.country !== 'all' && !searchTrendCountries.includes(filter.country)) ||
    !['published', 'retrieved'].includes(filter.dateBasis) || !['newest', 'oldest'].includes(filter.order)) throw Error('Invalid research library filter')
  const from = day(filter.from), through = day(filter.through)
  if (from !== null && through !== null && from > through) throw Error('Start date must not follow end date')
  const terms = normalized(filter.text).trim().split(/\s+/).filter(Boolean)
  const entries = records.map((entry, index) => ({ entry, index, stamp: Date.parse(filter.dateBasis === 'published' ? entry.items[0].publishedAt : entry.retrievedAt) }))
    .filter(({ entry, stamp }) => {
      if (filter.country !== 'all' && entry.country !== filter.country) return false
      if ((from !== null && stamp < from) || (through !== null && stamp >= through + 86400000)) return false
      const item = entry.items[0], text = normalized([item.query, ...item.articles.flatMap(article => [article.title, article.source])].join(' '))
      return terms.every(term => text.includes(term))
    })
  entries.sort((a, b) => (filter.order === 'newest' ? b.stamp - a.stamp : a.stamp - b.stamp) || a.index - b.index)
  return entries.map(({ entry, index }) => ({ entry, index }))
}
