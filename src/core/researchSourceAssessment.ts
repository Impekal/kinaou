import { z } from 'zod'
import { parseProject, type KinaouProject } from './project'
import { retainedSearchTrends, type RetainedSearchTrend } from './searchTrends'
import { validateSearchTrendSnapshot } from '../../worker/search-trends-protocol.mjs'
import { isUiLanguage, type UiLanguage } from './uiLanguage'
import { sourceExcerptSchema, type SourceExcerpt } from './sourceExcerpt'

const key = 'researchSourceAssessmentsV1'
const authored = (max: number) => z.string().trim().min(1).max(max).refine(value => !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value) && new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(new TextEncoder().encode(value)) === value, 'Use valid plain text without control characters')
const fields = z.object({ claim: authored(2000), finding: z.enum(['open','supports','contradicts']), notes: authored(4000), readArticleUrls: z.array(z.string().max(2048)).max(5), excerpts:z.array(sourceExcerptSchema).max(5).optional() }).strict()
const schema = fields.extend({ schemaVersion: z.literal(1), revision: z.number().int().min(1).max(10000), savedAt: z.string().datetime(), selfReported: z.literal(true), independentlyVerified: z.literal(false), observation: z.unknown() }).strict()
export type SourceAssessmentDraft = z.infer<typeof fields>
export type SourceAssessment = SourceAssessmentDraft & { schemaVersion: 1; revision: number; savedAt: string; selfReported: true; independentlyVerified: false; observation: RetainedSearchTrend }
export function newSourceAssessmentDraft(): SourceAssessmentDraft { return { claim: '', finding: 'open', notes: '', readArticleUrls: [] } }
function observation(value: unknown): RetainedSearchTrend {
  const raw = value as RetainedSearchTrend, parsed = validateSearchTrendSnapshot(raw, { country: raw?.country })
  if (parsed.items.length !== 1) throw Error('Assessment requires one retained observation')
  return parsed as RetainedSearchTrend
}
export function sourceAssessmentIdentity(value: RetainedSearchTrend) { return JSON.stringify(observation(value)) }
function validateExcerpts(source:RetainedSearchTrend,excerpts:SourceExcerpt[]) {
  const allowed=source.items[0].articles.map(item=>item.url),keys=excerpts.map(item=>JSON.stringify([item.originalUrl,item.quote]))
  if(excerpts.some(item=>!allowed.includes(item.originalUrl))||new Set(keys).size!==keys.length)throw Error('Choose distinct excerpts from this exact observation’s article links')
}
export function appendSourceExcerpt(source:RetainedSearchTrend,draft:SourceAssessmentDraft,value:SourceExcerpt):SourceAssessmentDraft {
  const excerpts=z.array(sourceExcerptSchema).max(5).parse([...(draft.excerpts??[]),value]);validateExcerpts(observation(source),excerpts)
  return {...draft,excerpts}
}
export function parseSourceAssessment(value: unknown): SourceAssessment {
  const parsed = schema.parse(value), source = observation(parsed.observation), allowed = source.items[0].articles.map(article => article.url)
  validateExcerpts(source,parsed.excerpts??[])
  if (new Set(parsed.readArticleUrls).size !== parsed.readArticleUrls.length || parsed.readArticleUrls.some(url => !allowed.includes(url))) throw Error('Choose distinct links from this exact observation')
  if (parsed.finding !== 'open' && !parsed.readArticleUrls.length) throw Error('Record at least one article you actually read before reporting support or contradiction')
  return { ...parsed, observation: source, readArticleUrls: [...parsed.readArticleUrls].sort((a,b) => allowed.indexOf(a)-allowed.indexOf(b)) }
}
export function projectSourceAssessments(project: KinaouProject): SourceAssessment[] {
  const raw = project.metadata[key]
  if (raw === undefined) return []
  if (!Array.isArray(raw) || raw.length > 200 || new TextEncoder().encode(JSON.stringify(raw)).length > 1024 ** 2) throw Error('Invalid or oversized source assessments')
  const values = raw.map(parseSourceAssessment)
  if (new Set(values.map(item => sourceAssessmentIdentity(item.observation))).size !== values.length) throw Error('Duplicate source assessment')
  return values
}
export function selectedSourceAssessments(project: KinaouProject, sources: readonly RetainedSearchTrend[]): SourceAssessment[] {
  const records = new Map(projectSourceAssessments(project).map(record => [sourceAssessmentIdentity(record.observation), record]))
  return sources.flatMap(source => { const match = records.get(sourceAssessmentIdentity(source)); return match ? [match] : [] })
}
export function sourceAssessmentKey(project: KinaouProject, source: RetainedSearchTrend) { return JSON.stringify([project.id, sourceAssessmentIdentity(source), selectedSourceAssessments(project, [source])[0] ?? null]) }
const draftOf = (record: SourceAssessment): SourceAssessmentDraft => ({ claim: record.claim, finding: record.finding, notes: record.notes, readArticleUrls: [...record.readArticleUrls], ...(record.excerpts ? {excerpts:structuredClone(record.excerpts)} : {}) })
export { draftOf as sourceAssessmentDraft }

/** Review-only preparation, then a single safety snapshot and save-only retry for the same bound project. */
export class SourceAssessmentSession {
  private signature = ''; private generation = 0
  private bindings = new WeakMap<SourceAssessment, { generation: number; bytes: string; project: string; next: KinaouProject; changed: boolean; snapshot: boolean; complete: boolean }>()
  observe(project: KinaouProject, source: RetainedSearchTrend | null, draft: SourceAssessmentDraft | null, language: UiLanguage) {
    const signature = JSON.stringify([project, source, draft, language])
    if (signature !== this.signature) { this.signature = signature; this.generation++ }
  }
  detach() { this.generation++ }
  prepare(project: KinaouProject, source: RetainedSearchTrend, draft: SourceAssessmentDraft, expectedKey: string, language: UiLanguage, now = new Date()) {
    if (!isUiLanguage(language)) throw Error('Unsupported assessment language')
    this.observe(project, source, draft, language)
    const identity = sourceAssessmentIdentity(source), records = projectSourceAssessments(project)
    if (!retainedSearchTrends(project).some(item => sourceAssessmentIdentity(item) === identity) || sourceAssessmentKey(project, source) !== expectedKey) throw Error('Observation or prior assessment changed; close the editor and load the current source')
    const previous = records.find(item => sourceAssessmentIdentity(item.observation) === identity)
    let candidate = parseSourceAssessment({ ...fields.parse(draft), schemaVersion: 1, revision: previous?.revision ?? 1, savedAt: now.toISOString(), selfReported: true, independentlyVerified: false, observation: source })
    const unchanged = !!previous && JSON.stringify(draftOf(previous)) === JSON.stringify(draftOf(candidate))
    if (!unchanged && previous) candidate = parseSourceAssessment({ ...candidate, revision: previous.revision + 1 })
    const review = unchanged ? previous : candidate
    const next = unchanged ? project : parseProject({ ...project, updatedAt: candidate.savedAt, metadata: { ...project.metadata, [key]: previous ? records.map(item => item === previous ? candidate : item) : [...records, candidate] } })
    projectSourceAssessments(next)
    this.bindings.set(review, { generation: this.generation, bytes: JSON.stringify(review), project: JSON.stringify(project), next, changed: !unchanged, snapshot: false, complete: false })
    return review
  }
  current(review: SourceAssessment) { const bound = this.bindings.get(review); return !!bound && !bound.complete && bound.generation === this.generation && bound.bytes === JSON.stringify(review) }
  commit(project: KinaouProject, review: SourceAssessment, acknowledged: boolean, snapshot: (project: KinaouProject) => void, persist: (project: KinaouProject) => void) {
    const bound = this.bindings.get(review)
    if (acknowledged !== true || !bound || !this.current(review) || bound.project !== JSON.stringify(project)) throw Error('Review and acknowledge the unchanged assessment and project before saving')
    if (bound.changed) { if (!bound.snapshot) { snapshot(project); bound.snapshot = true }; persist(structuredClone(bound.next)) }
    bound.complete = true
  }
}
