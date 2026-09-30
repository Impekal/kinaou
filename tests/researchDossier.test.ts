import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { buildResearchDossier, ResearchDossierSession } from '../src/core/researchDossier'
import { newResearchObservationFilter } from '../src/core/researchObservationFilter'
import { createProject, parseProject } from '../src/core/project'
import { retainSearchTrend } from '../src/core/searchTrends'
import { uiLanguages } from '../src/core/uiLanguage'
import { translateUi } from '../src/core/uiMessages'
import { ResearchDossierPanel } from '../src/components/ResearchDossierPanel'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'

function fixture() {
  const base = createProject('../Private <project>')
  base.script = 'PRIVATE_SCRIPT_DO_NOT_EXPORT'
  base.metadata.secret = 'PRIVATE_TOKEN_DO_NOT_EXPORT'
  base.metadata.researchBrief = { secret: 'PRIVATE_BRIEF_DO_NOT_EXPORT' }
  let project = base
  for (const [country, query] of [['DE', 'Football <script>not instructions</script>'], ['FR', 'École — original']] as const) project = retainSearchTrend(project, {
    schemaVersion: 1, provider: 'google-trends-rss', country, sourceUrl: `https://trends.google.com/trending/rss?geo=${country}`,
    retrievedAt: '2026-09-30T01:00:00.000Z', feedSha256: 'a'.repeat(64), items: [{ query, publishedAt: '2026-09-29T23:59:59.999Z', reportedTraffic: '200+', articles: [{ title: 'Original title', source: 'Example source', url: 'https://example.org/report?a=1&b=2' }] }]
  }, 0)
  return project
}
const now = new Date('2026-09-30T02:00:00.000Z')
it.each(uiLanguages)('exports only selected exact evidence with localized text and explicit limits in %s', language => {
  const project = fixture(), before = JSON.stringify(project), filters = { ...newResearchObservationFilter(), country: 'FR' as const }
  const review = buildResearchDossier(project, filters, language, now), json = JSON.parse(review.files.json.text)
  expect(review.count).toBe(1); expect(review.total).toBe(2)
  expect(json.observations).toEqual([project.metadata.searchTrendObservations && (project.metadata.searchTrendObservations as unknown[])[1]])
  expect(json).toMatchObject({ documentLanguage: language, projectTitle: project.title, filters, exportedCount: 1, retainedCount: 2, dateTimezone: 'UTC', marketCoverage: 'incomplete', factChecked: false, feedHashesReverified: false })
  for (const file of Object.values(review.files)) {
    expect(file.text).toContain('École — original'); expect(file.text).not.toContain('Football')
    for (const privateText of ['PRIVATE_SCRIPT', 'PRIVATE_TOKEN', 'PRIVATE_BRIEF', project.id]) expect(file.text).not.toContain(privateText)
    expect(file.filename).toMatch(/^kinaou-research-sources-2026-09-30\.(txt|json)$/)
    expect(file.text).toContain(translateUi(language, 'research.dossierBoundary'))
    expect(file.text).toContain('200+'); expect(file.text).toContain('a'.repeat(64))
  }
  expect(review.files.text.text).toContain(translateUi(language, 'research.dossierHeading'))
  expect(JSON.stringify(project)).toBe(before)
  expect(buildResearchDossier(parseProject(JSON.parse(before)), filters, language, now)).toEqual(review)
})
it('uses plain UTF-8 text and JSON, preserving source markup as data rather than executable HTML', () => {
  const review = buildResearchDossier(fixture(), newResearchObservationFilter(), 'en', now)
  expect(review.files.text.mimeType).toBe('text/plain;charset=utf-8')
  expect(review.files.json.mimeType).toBe('application/json;charset=utf-8')
  expect(review.files.text.text).toContain('<script>not instructions</script>')
  expect(JSON.parse(review.files.json.text).observations[0].items[0].query).toContain('<script>')
  expect(new TextDecoder().decode(new TextEncoder().encode(review.files.text.text))).toBe(review.files.text.text)
})
it('refuses empty selections, corrupt sources, invalid filters, language, time and oversized reports', () => {
  expect(() => buildResearchDossier(createProject('empty'), newResearchObservationFilter(), 'en')).toThrow(/No retained/)
  expect(() => buildResearchDossier(fixture(), { ...newResearchObservationFilter(), country: 'CA' }, 'en')).toThrow(/No retained/)
  expect(() => buildResearchDossier(fixture(), { ...newResearchObservationFilter(), from: '2026-02-30' }, 'en')).toThrow()
  expect(() => buildResearchDossier(fixture(), newResearchObservationFilter(), 'es' as 'en')).toThrow()
  expect(() => buildResearchDossier(fixture(), newResearchObservationFilter(), 'en', new Date(NaN))).toThrow()
  const corrupt = fixture(); corrupt.metadata.searchTrendObservations = [{ bad: true }]
  expect(() => buildResearchDossier(corrupt, newResearchObservationFilter(), 'en')).toThrow()
  const huge = fixture(); huge.title = 'x'.repeat(4 * 1024 ** 2)
  expect(() => buildResearchDossier(huge, newResearchObservationFilter(), 'en')).toThrow(/4 MiB/)
})
it('requires review identity and explicit acknowledgement; copies downloaded file descriptors', () => {
  const session = new ResearchDossierSession(), review = session.prepare(fixture(), newResearchObservationFilter(), 'en', now)
  expect(() => session.download(review, 'json', false)).toThrow()
  expect(() => session.download(structuredClone(review), 'json', true)).toThrow()
  expect(() => session.download(review, 'html' as 'text', true)).toThrow()
  const file = session.download(review, 'json', true); file.text = 'changed copy'
  expect(session.download(review, 'json', true).text).toBe(review.files.json.text)
  review.files.text.text = 'tampered'
  expect(session.current(review)).toBe(false)
  expect(() => session.download(review, 'text', true)).toThrow()
})
it.each(['project', 'title', 'source', 'filter', 'language'] as const)('permanently invalidates observed %s A→B→A review', change => {
  const project = fixture(), filters = newResearchObservationFilter(), session = new ResearchDossierSession(), review = session.prepare(project, filters, 'de', now)
  const next = structuredClone(project), other = { ...filters }
  if (change === 'project') next.id = 'another-project'
  if (change === 'title') next.title = 'renamed'
  if (change === 'source') next.metadata.searchTrendObservations = []
  if (change === 'filter') other.text = 'different'
  session.observe(next, other, change === 'language' ? 'fr' : 'de')
  session.observe(project, filters, 'de')
  expect(session.current(review)).toBe(false)
  expect(() => session.download(review, 'text', true)).toThrow()
  const fresh = session.prepare(project, filters, 'de', now)
  expect(session.current(fresh)).toBe(true)
})
it('does not invalidate exact source review for unrelated script edits and never writes a project', () => {
  const project = fixture(), filters = newResearchObservationFilter(), session = new ResearchDossierSession(), review = session.prepare(project, filters, 'en', now)
  const next = { ...project, script: 'Changed private script', updatedAt: new Date().toISOString() }, before = JSON.stringify(next)
  session.observe(next, filters, 'en')
  expect(session.current(review)).toBe(true)
  expect(session.download(review, 'text', true).text).not.toContain(next.script)
  expect(JSON.stringify(next)).toBe(before)
})
it.each(uiLanguages)('renders explicit preparation, privacy guidance and no automatic export in %s', language => {
  const fetch = vi.spyOn(globalThis, 'fetch'), project = fixture(), before = JSON.stringify(project)
  try {
    const html = renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: language, children: createElement(ResearchDossierPanel, { project, filters: newResearchObservationFilter(), available: true }) }))
    expect(html).toContain(translateUi(language, 'research.dossierHelp'))
    expect(html).toContain(translateUi(language, 'research.dossierPrepare'))
    expect(html).not.toContain(translateUi(language, 'research.dossierText'))
    expect(html).not.toContain('PRIVATE_TOKEN')
    expect(fetch).not.toHaveBeenCalled(); expect(JSON.stringify(project)).toBe(before)
  } finally { fetch.mockRestore() }
})
