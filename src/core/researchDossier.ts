import type { KinaouProject } from './project'
import { retainedSearchTrends } from './searchTrends'
import { filterResearchObservations, type ResearchObservationFilter } from './researchObservationFilter'
import { isUiLanguage, type UiLanguage } from './uiLanguage'
import { translateUi, type UiMessageKey } from './uiMessages'

type Format = 'json' | 'text'
export interface ResearchDossierFile { filename: string; mimeType: string; text: string }
export interface ResearchDossierReview { count: number; total: number; createdAt: string; files: Record<Format, ResearchDossierFile> }

export function buildResearchDossier(project: KinaouProject, filters: ResearchObservationFilter, language: UiLanguage, now = new Date()): ResearchDossierReview {
  if (!isUiLanguage(language)) throw Error('Unsupported dossier language')
  const ledger = retainedSearchTrends(project), selected = filterResearchObservations(ledger, filters)
  if (!selected.length) throw Error('No retained observations match this selection')
  const createdAt = now.toISOString(), t = (key: UiMessageKey, values?: Record<string, string | number>) => translateUi(language, key, values)
  const payload = {
    schemaVersion: 1, type: 'kinaou-research-source-dossier', createdAt, documentLanguage: language,
    projectTitle: project.title, filters: { ...filters }, dateTimezone: 'UTC', retainedCount: ledger.length, exportedCount: selected.length,
    marketCoverage: 'incomplete', factChecked: false, feedHashesReverified: false, limitations: t('research.dossierBoundary'),
    observations: selected.map(({ entry }) => entry)
  }
  const lines = [t('research.dossierHeading'), t('research.dossierProject') + ': ' + JSON.stringify(project.title),
    t('research.dossierCreated', { date: createdAt }), t('research.filterCount', { matches: selected.length, total: ledger.length }),
    '', payload.limitations, '', t('research.filterHeading'),
    t('research.filterText') + ': ' + (filters.text || '—'),
    t('research.filterCountry') + ': ' + (filters.country === 'all' ? t('research.filterAll') : t(`research.${filters.country}`)),
    t('research.filterBasis') + ': ' + t(filters.dateBasis === 'published' ? 'research.filterPublished' : 'research.filterRetrieved'),
    t('research.filterFrom') + ': ' + (filters.from || '—'), t('research.filterThrough') + ': ' + (filters.through || '—'),
    t('research.filterOrder') + ': ' + t(filters.order === 'newest' ? 'research.filterNewest' : 'research.filterOldest')]
  selected.forEach(({ entry }, index) => {
    const item = entry.items[0]
    lines.push('', '---', t('research.dossierSource', { index: index + 1 }), item.query,
      'Google Trends RSS · ' + t(`research.${entry.country}`), entry.sourceUrl,
      t('research.dossierRetrieved', { date: entry.retrievedAt }), t('research.published', { date: item.publishedAt }),
      item.reportedTraffic === null ? t('research.noTraffic') : t('research.traffic', { value: item.reportedTraffic }),
      'feedSha256: ' + entry.feedSha256, t('research.references'))
    for (const article of item.articles) lines.push(article.title + ' — ' + article.source, article.url)
  })
  const base = 'kinaou-research-sources-' + createdAt.slice(0, 10)
  const files = { json: { filename: base + '.json', mimeType: 'application/json;charset=utf-8', text: JSON.stringify(payload, null, 2) + '\n' },
    text: { filename: base + '.txt', mimeType: 'text/plain;charset=utf-8', text: lines.join('\n') + '\n' } }
  for (const file of Object.values(files)) if (new TextEncoder().encode(file.text).length > 4 * 1024 ** 2) throw Error('Research dossier exceeds 4 MiB')
  return { count: selected.length, total: ledger.length, createdAt, files }
}

/** Bind explicit downloads to the observed source/filter/language lifetime, including A→B→A. */
export class ResearchDossierSession {
  private signature = ''
  private generation = 0
  private reviews = new WeakMap<ResearchDossierReview, { generation: number; bytes: string }>()
  observe(project: KinaouProject, filters: ResearchObservationFilter, language: UiLanguage) {
    const signature = JSON.stringify([project.id, project.title, project.metadata.searchTrendObservations ?? null, filters, language])
    if (signature !== this.signature) { this.signature = signature; this.generation++ }
  }
  prepare(project: KinaouProject, filters: ResearchObservationFilter, language: UiLanguage, now = new Date()) {
    this.observe(project, filters, language)
    const review = buildResearchDossier(project, filters, language, now)
    this.reviews.set(review, { generation: this.generation, bytes: JSON.stringify(review) })
    return review
  }
  current(review: ResearchDossierReview) {
    const record = this.reviews.get(review)
    return !!record && record.generation === this.generation && record.bytes === JSON.stringify(review)
  }
  download(review: ResearchDossierReview, format: Format, acknowledged: boolean) {
    if (acknowledged !== true || !this.current(review) || !['json', 'text'].includes(format)) throw Error('Review the current source dossier and acknowledge before downloading')
    return { ...review.files[format] }
  }
}
