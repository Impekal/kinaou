import { it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createProject, parseProject } from '../src/core/project'
import { recordSuccessfulExport, type ExportReceipt } from '../src/core/exportHistory'
import { applyPublicationPlan, reviewPublicationPlan } from '../src/core/publicationPlan'
import { applyPublicationEditorial, projectPublicationEditorial, publicationEditorialContext, publicationEditorialCurrent, publicationEditorialDraft, reviewPublicationEditorial } from '../src/core/publicationEditorial'
import { validateEditorialProposal } from '../worker/publication-editorial.mjs'
import { PublicationEditorialPanel } from '../src/components/PublicationEditorialPanel'
import { PublicationEditorialControl } from '../src/components/PublicationEditorialControl'
import { PersistentVersionHistory } from '../src/core/versioning'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import { uiLanguages } from '../src/core/uiLanguage'
import { uiPublicationEditorialMessages } from '../src/core/uiPublicationEditorialMessages'
import { translateUi } from '../src/core/uiMessages'
import { WorkerClient } from '../src/core/workerClient'

const now = new Date('2026-09-29T00:00:00Z'), authored = { kind: 'authored' as const, edited: true }
export function editorialFixture() {
  let project = createProject('Tactical learning fixture')
  project.script = 'Ein Dreieck schafft drei Passwege. Das ist ein synthetisches Beispiel für einen Test, keine aktuelle Spielanalyse.'
  for (const [jobId, format] of [['main', 'landscape'], ['short', 'vertical']] as const) {
    const receipt: ExportReceipt = { schemaVersion: 1, jobId, label: jobId, format, outputRelativePath: 'KINAOU/Renders/' + jobId + '.mp4', range: { inMs: 0, outMs: 1000 }, durationMs: 1000, sceneIds: [], completedAt: now.toISOString() }
    project = recordSuccessfulExport(project, receipt)
  }
  return applyPublicationPlan(project, reviewPublicationPlan(project, { mainJobId: 'main', shorts: [{ jobId: 'short', offsetHours: 24 }], mainLocal: '2026-10-24T18:00', timeZone: 'Europe/Berlin', targetMarket: 'FR', rationale: 'An authored experiment.' }, now), true, now)
}
function proposal(project = editorialFixture()) {
  const value = publicationEditorialDraft(project)
  value.items = value.items.map((item, i) => ({ ...item, title: i ? 'Trois passes en bref' : 'Comprendre le triangle', description: 'Un exemple pédagogique.', tags: ['Football', 'Tactique'], rationale: 'Expliquer les options.', sourceQuote: 'Ein Dreieck schafft drei Passwege.' }))
  return value
}
it('binds exact plan/receipts and authored source without claiming measured trends or current-video agreement', () => {
  const project = editorialFixture(), before = JSON.stringify(project), context = publicationEditorialContext(project)
  expect(context.targetMarket).toBe('FR'); expect(context.outputLanguage).toBe('de')
  expect(context.exports.map(item => item.jobId)).toEqual(['main', 'short'])
  expect(context.sourceText).toContain(project.script); expect(context).not.toHaveProperty('views')
  expect(JSON.stringify(project)).toBe(before)
})
it.each(['missing-plan', 'missing-export', 'changed-export', 'empty-source', 'oversized-source'] as const)('rejects %s context instead of fabricating or truncating', issue => {
  const project = editorialFixture()
  if (issue === 'missing-plan') delete project.metadata.publicationPlan
  if (issue === 'missing-export') project.metadata.exportHistory = []
  if (issue === 'changed-export') (project.metadata.exportHistory as ExportReceipt[])[0].label += ' changed'
  if (issue === 'empty-source') project.script = ''
  if (issue === 'oversized-source') project.script = 'a'.repeat(40001)
  expect(() => publicationEditorialContext(project)).toThrow()
})
it.each(['wrong-id', 'reordered', 'missing-entry', 'invented-quote', 'empty-quote', 'duplicate-tags', 'comma-tag', 'hashtag', 'unknown-field'] as const)('rejects %s model output', issue => {
  const project = editorialFixture(), value = proposal(project)
  if (issue === 'wrong-id') value.items[0].jobId = 'other'
  if (issue === 'reordered') value.items.reverse()
  if (issue === 'missing-entry') value.items.pop()
  if (issue === 'invented-quote') value.items[0].sourceQuote = 'Guaranteed millions of views'
  if (issue === 'empty-quote') value.items[0].sourceQuote = ''
  if (issue === 'duplicate-tags') value.items[0].tags = ['tag', 'TAG']
  if (issue === 'comma-tag') value.items[0].tags = ['one,two']
  if (issue === 'hashtag') value.items[0].tags = ['#football']
  if (issue === 'unknown-field') Object.assign(value, { published: true })
  expect(() => validateEditorialProposal(publicationEditorialContext(project), value)).toThrow()
})
it('persists a reviewed snapshot, model provenance and edits without changing script, media or timing', () => {
  const project = editorialFixture(), original = JSON.stringify(project), context = publicationEditorialContext(project)
  const review = reviewPublicationEditorial(project, context, proposal(project), { kind: 'local-model', modelId: 'installed-test-model', adapterId: 'ollama', edited: true })
  const saved = applyPublicationEditorial(project, review, true), restored = parseProject(JSON.parse(JSON.stringify(saved))), record = projectPublicationEditorial(restored)!
  expect(record.context).toEqual(context); expect(record.provenance.edited).toBe(true); expect(publicationEditorialCurrent(restored, record)).toBe(true)
  expect(saved.script).toBe(project.script); expect(saved.tracks).toEqual(project.tracks); expect(saved.metadata.publicationPlan).toEqual(project.metadata.publicationPlan); expect(JSON.stringify(project)).toBe(original)
})
it.each(['no-ack', 'copied', 'mutated-review', 'changed-project'] as const)('rejects %s approval', issue => {
  const project = editorialFixture(), review = reviewPublicationEditorial(project, publicationEditorialContext(project), proposal(project), authored)
  if (issue === 'mutated-review') review.record.proposal.items[0].title = 'Changed after review'
  if (issue === 'changed-project') project.script += ' new'
  expect(() => applyPublicationEditorial(project, issue === 'copied' ? { ...review } : review, issue !== 'no-ack')).toThrow()
})
it('keeps review for save-only retry, versions edits and blocks stale handoffs without overwriting historic data', () => {
  const project = editorialFixture(), context = publicationEditorialContext(project), review = reviewPublicationEditorial(project, context, proposal(project), authored)
  expect(() => { applyPublicationEditorial(project, review, true); throw Error('persist failed') }).toThrow('persist failed')
  const saved = applyPublicationEditorial(project, review, true), next = applyPublicationEditorial(saved, reviewPublicationEditorial(saved, context, proposal(saved), authored), true)
  const record = projectPublicationEditorial(next)!
  expect(record.revision).toBe(2); next.script += ' Changed.'
  expect(publicationEditorialCurrent(next, record)).toBe(false); expect(projectPublicationEditorial(next)).toEqual(record)
  expect(() => reviewPublicationEditorial(next, context, proposal(saved), authored)).toThrow()
})
it('refuses corrupt saved metadata and forged model provenance', () => {
  const project = editorialFixture(), context = publicationEditorialContext(project)
  expect(() => reviewPublicationEditorial(project, context, proposal(project), { kind: 'local-model', edited: false })).toThrow()
  project.metadata.publicationEditorial = { schemaVersion: 1 }
  expect(() => reviewPublicationEditorial(project, context, proposal(project), authored)).toThrow()
})
const storage = () => { const map = new Map<string, string>(); return { getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, value: string) => { map.set(key, value) }, removeItem: (key: string) => { map.delete(key) } } }
it.each(uiLanguages)('renders explicit editorial preparation and package handoff in %s without requests or writes', language => {
  const project = editorialFixture(), saved = applyPublicationEditorial(project, reviewPublicationEditorial(project, publicationEditorialContext(project), proposal(project), authored), true)
  const spy = vi.spyOn(globalThis, 'fetch'), save = vi.fn()
  try {
    const html = renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: language, children: createElement(PublicationEditorialPanel, { project: saved, history: new PersistentVersionHistory(storage()), workerUrl: '', workerToken: 'SECRET', workerConnected: false, workerCapabilities: [], onProjectChange: save }) }))
    expect(html).toContain(translateUi(language, 'editorial.heading')); expect(html).not.toContain('SECRET')
    const control = renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: language, children: createElement(PublicationEditorialControl, { project: saved, jobId: 'main', busy: false, onApply: save }) }))
    expect(control).toContain(translateUi(language, 'editorial.applyAck')); expect(control).toContain('disabled=""')
    for (const key of Object.keys(uiPublicationEditorialMessages) as (keyof typeof uiPublicationEditorialMessages)[]) expect(translateUi(language, key)).not.toBe(key)
    expect(spy).not.toHaveBeenCalled(); expect(save).not.toHaveBeenCalled()
  } finally { spy.mockRestore() }
})
it('sends explicit context only to the authenticated local editorial route', async () => {
  const project = editorialFixture(), context = publicationEditorialContext(project), response = { proposal: proposal(project), modelId: 'local', adapterId: 'ollama' }
  const fetchImpl = vi.fn(async (_url: string | URL | Request, _options?: RequestInit) => new Response(JSON.stringify({ ok: true, type: 'publication-editorial', result: response })))
  const client = new WorkerClient({ baseUrl: 'http://127.0.0.1:43117', token: 'test-only', fetchImpl })
  expect(await client.generatePublicationEditorial('local', context)).toEqual(response)
  const [url, options] = fetchImpl.mock.calls[0]; expect(url).toBe('http://127.0.0.1:43117/publication/editorial/generate'); expect(JSON.parse(String(options?.body))).toEqual({ model: 'local', context })
})
