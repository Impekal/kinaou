import { parseProject, type KinaouProject } from './project'
import { validateSearchTrendSnapshot, type SearchTrendSnapshot, type SearchTrendCountry } from '../../worker/search-trends-protocol.mjs'

export type RetainedSearchTrend = SearchTrendSnapshot & { items: [SearchTrendSnapshot['items'][number]] }
const key = 'searchTrendObservations', maxRecords = 200, maxBytes = 1024 * 1024
export function retainedSearchTrends(project: KinaouProject): RetainedSearchTrend[] {
  const raw = project.metadata[key]
  if (raw === undefined) return []
  if (!Array.isArray(raw) || raw.length > maxRecords || new TextEncoder().encode(JSON.stringify(raw)).length > maxBytes) throw Error('Invalid or oversized search trend ledger')
  return raw.map(entry => {
    const snapshot = validateSearchTrendSnapshot(entry, { country: entry?.country as SearchTrendCountry })
    if (snapshot.items.length !== 1) throw Error('A retained observation requires exactly one trend')
    return snapshot as RetainedSearchTrend
  })
}
function identity(entry: RetainedSearchTrend) { return JSON.stringify([entry.country, entry.feedSha256, entry.items[0]]) }
export function retainSearchTrend(project: KinaouProject, snapshot: SearchTrendSnapshot, index: number): KinaouProject {
  const validated = validateSearchTrendSnapshot(snapshot, { country: snapshot.country })
  if (!Number.isSafeInteger(index) || index < 0 || index >= validated.items.length) throw Error('Choose a trend from the retrieved snapshot')
  const observation: RetainedSearchTrend = { ...validated, items: [validated.items[index]] }, records = retainedSearchTrends(project)
  if (records.some(entry => identity(entry) === identity(observation))) return project
  if (records.length >= maxRecords) throw Error('Search trend ledger is full; no observations were discarded')
  const next = parseProject({ ...project, updatedAt: new Date().toISOString(), metadata: { ...project.metadata, [key]: [...records, observation] } })
  retainedSearchTrends(next)
  return next
}
/** Permanently invalidates late responses, including A → B → A scope changes. */
export class SearchTrendSession {
  private active = true
  detach() { this.active = false }
  async load(load: () => Promise<SearchTrendSnapshot>, publish: (value: SearchTrendSnapshot) => void, fail: (error: unknown) => void) {
    try { const result = await load(); if (this.active) publish(result) } catch (error) { if (this.active) fail(error) }
  }
}
