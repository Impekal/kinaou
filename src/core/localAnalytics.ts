import { z } from 'zod'
import { parseProject, type KinaouProject } from './project'

export const analyticsByteLimit = 512 * 1024
const safeText = (max: number) => z.string().min(1).max(max).refine(v => !!v.trim() && !/[\x00-\x1f\x7f]/.test(v))
export const analyticsMappingSchema = z.object({
  delimiter: z.enum([',', ';']), dateColumn: z.number().int().min(0).max(63), viewsColumn: z.number().int().min(0).max(63),
  dateFormat: z.enum(['iso', 'dmy-slash', 'mdy-slash', 'dmy-dot']), numberFormat: z.enum(['plain', 'comma', 'dot', 'space']),
  skipFirstSummary: z.boolean()
}).strict().refine(v => v.dateColumn !== v.viewsColumn, 'Choose different date and views columns')
export const analyticsDraftSchema = z.object({
  name: safeText(120), scope: safeText(300), platform: z.enum(['youtube', 'tiktok', 'instagram', 'threads', 'facebook', 'other']),
  timezoneNote: z.string().max(120).refine(v => !/[\x00-\x1f\x7f]/.test(v)), mapping: analyticsMappingSchema
}).strict()
export type AnalyticsMapping = z.infer<typeof analyticsMappingSchema>
export type AnalyticsDraft = z.infer<typeof analyticsDraftSchema>
export function newAnalyticsDraft(): AnalyticsDraft {
  return { name: '', scope: '', platform: 'youtube', timezoneNote: '', mapping: { delimiter: ',', dateColumn: 0, viewsColumn: 1, dateFormat: 'iso', numberFormat: 'plain', skipFirstSummary: false } }
}
const sourceSchema = z.object({ filename: safeText(255), bytes: z.number().int().min(1).max(analyticsByteLimit), sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict()
export interface AnalyticsSource { text: string; file: z.infer<typeof sourceSchema> }
/** Original bytes are copied before hashing/decoding. No upload, spreadsheet execution or repair. */
async function readAnalyticsSource(bytes: Uint8Array, filename: string): Promise<AnalyticsSource> {
  if (!bytes.length || bytes.length > analyticsByteLimit) throw Error('CSV must contain 1–524288 bytes')
  safeText(255).parse(filename)
  const copy = Uint8Array.from(bytes), text = new TextDecoder('utf-8', { fatal: true }).decode(copy)
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(text)) throw Error('CSV contains unsupported control characters')
  const digest = await crypto.subtle.digest('SHA-256', copy)
  return { text, file: { filename, bytes: copy.length, sha256: Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('') } }
}

/** RFC 4180 quoting, with explicit LF/semicolon extensions; never evaluates cell contents. */
export function parseAnalyticsCsv(text: string, delimiter: ',' | ';') {
  if (![',', ';'].includes(delimiter) || new TextEncoder().encode(text).length > analyticsByteLimit || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(text)) throw Error('Invalid or oversized CSV')
  const records: string[][] = []; let row: string[] = [], cell = '', quoted = false, closed = false
  function field() { row.push(cell); cell = ''; closed = false; if (row.length > 64) throw Error('CSV exceeds 64 columns') }
  function record() { field(); records.push(row); row = []; if (records.length > 502) throw Error('CSV exceeds 500 daily rows plus header and optional summary') }
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++ } else { quoted = false; closed = true } }
      else cell += c
    } else if (c === delimiter) field()
    else if (c === '\n' || c === '\r') {
      if (c === '\r') { if (text[i + 1] !== '\n') throw Error('Bare CR outside quoted CSV field'); i++ }
      record()
    } else if (c === '"' && !cell && !closed) quoted = true
    else { if (closed || c === '"') throw Error('Malformed CSV quoting'); cell += c }
    if (cell.length > 4096) throw Error('CSV cell exceeds 4096 characters')
  }
  if (quoted) throw Error('Unclosed CSV quote')
  if (cell || row.length || closed) record()
  if (records.length < 2) throw Error('CSV needs a header and daily rows')
  const [headers, ...rows] = records
  if (headers.length < 2 || headers.some(v => !v.trim() || v.length > 200 || /[\r\n]/.test(v))) throw Error('Use 2–64 non-empty short column headers')
  if (rows.some(v => v.length !== headers.length || v.every(c => !c.trim()))) throw Error('Inconsistent CSV columns or blank data row')
  return { headers, rows }
}

export function analyticsDate(raw: string, format: AnalyticsMapping['dateFormat']) {
  const value = raw.trim(); let iso: string
  if (format === 'iso') iso = value
  else {
    const match = (format === 'dmy-dot' ? /^(\d{2})\.(\d{2})\.(\d{4})$/ : /^(\d{2})\/(\d{2})\/(\d{4})$/).exec(value)
    if (!match || !['dmy-dot', 'dmy-slash', 'mdy-slash'].includes(format)) throw Error('Date does not match the selected format')
    iso = `${match[3]}-${format === 'mdy-slash' ? match[1] : match[2]}-${format === 'mdy-slash' ? match[2] : match[1]}`
  }
  const time = Date.parse(iso + 'T00:00:00.000Z')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || iso.startsWith('0000-') || !Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== iso) throw Error('Invalid calendar date')
  return iso
}
export function analyticsViews(raw: string, format: AnalyticsMapping['numberFormat']) {
  const value = raw.trim(), patterns = { plain: /^\d+$/, comma: /^\d+$|^\d{1,3}(,\d{3})+$/, dot: /^\d+$|^\d{1,3}(\.\d{3})+$/, space: /^\d+$|^\d{1,3}( \d{3})+$/ }
  if (!patterns[format]?.test(value)) throw Error('Views must be non-negative whole numbers in the selected format')
  const number = Number(value.replace(/[,. ]/g, ''))
  if (!Number.isSafeInteger(number)) throw Error('View count exceeds safe integer precision')
  return number
}
const rawRowSchema = z.object({ record: z.number().int().min(2).max(502), rawDate: z.string().max(4096), rawViews: z.string().max(4096) }).strict()
const reportSchema = z.object({
  schemaVersion: z.literal(1), id: z.string().uuid(), importedAt: z.string().datetime(), draft: analyticsDraftSchema, source: sourceSchema,
  columns: z.object({ date: z.string().min(1).max(200), views: z.string().min(1).max(200), count: z.number().int().min(2).max(64) }).strict(),
  excludedSummary: rawRowSchema.nullable(),
  rows: z.array(rawRowSchema.extend({ date: z.string(), views: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER) }).strict()).min(1).max(500)
}).strict()
export type PerformanceReport = z.infer<typeof reportSchema>
const dayNumber = (date: string) => Date.parse(date + 'T00:00:00.000Z') / 86400000
export function analyticsSummary(report: PerformanceReport) {
  const rows = report.rows, sum = rows.reduce((n, r) => n + r.views, 0)
  if (!Number.isSafeInteger(sum)) throw Error('View sum exceeds safe integer precision')
  const from = rows[0].date, through = rows[rows.length - 1].date
  return { sum, count: rows.length, from, through, missing: dayNumber(through) - dayNumber(from) + 1 - rows.length }
}
function validatedReport(value: unknown): PerformanceReport {
  const report = reportSchema.parse(value), { mapping } = report.draft
  if (Math.max(mapping.dateColumn, mapping.viewsColumn) >= report.columns.count || mapping.skipFirstSummary !== !!report.excludedSummary) throw Error('Invalid retained column mapping')
  if (report.excludedSummary) {
    if (report.excludedSummary.record !== 2) throw Error('Only the first summary may be excluded')
    let validDate = false
    try { analyticsDate(report.excludedSummary.rawDate, mapping.dateFormat); validDate = true } catch { /* explicitly non-date summary */ }
    if (validDate) throw Error('A valid daily date cannot be excluded as a summary')
  }
  report.rows.forEach((row, index) => {
    if (analyticsDate(row.rawDate, mapping.dateFormat) !== row.date || analyticsViews(row.rawViews, mapping.numberFormat) !== row.views || (index && report.rows[index - 1].date >= row.date)) throw Error('Invalid, duplicate or unordered daily values')
  })
  const first = report.excludedSummary ? 3 : 2, records = report.rows.map(r => r.record).sort((a, b) => a - b)
  if (records.some((record, index) => record !== first + index)) throw Error('Missing or duplicate CSV source records')
  analyticsSummary(report)
  return report
}
export function retainedPerformanceReports(project: KinaouProject) {
  const raw = project.metadata.performanceReportsV1 ?? []
  if (!Array.isArray(raw) || raw.length > 20 || new TextEncoder().encode(JSON.stringify(raw)).length > 1024 ** 2) throw Error('Invalid or oversized saved analytics library')
  const reports = raw.map(validatedReport)
  if (new Set(reports.map(r => r.id)).size !== reports.length) throw Error('Duplicate report IDs')
  return reports
}

/** Only the loader can mint a source used for a report, retaining its byte-hash binding. */
const sourceBindings = new WeakMap<AnalyticsSource, string>()
export async function loadAnalyticsSource(bytes: Uint8Array, filename: string) {
  const source = await readAnalyticsSource(bytes, filename)
  sourceBindings.set(source, JSON.stringify(source)); return source
}
export function buildPerformanceReport(source: AnalyticsSource, input: AnalyticsDraft): PerformanceReport {
  if (sourceBindings.get(source) !== JSON.stringify(source)) throw Error('Read the unchanged local file again')
  const draft = analyticsDraftSchema.parse(input), { headers, rows } = parseAnalyticsCsv(source.text, draft.mapping.delimiter), m = draft.mapping
  if (Math.max(m.dateColumn, m.viewsColumn) >= headers.length) throw Error('Choose existing date and views columns')
  const raw = rows.map((row, index) => ({ record: index + 2, rawDate: row[m.dateColumn], rawViews: row[m.viewsColumn] }))
  const excludedSummary = m.skipFirstSummary ? raw.shift()! : null
  return validatedReport({ schemaVersion: 1, id: crypto.randomUUID(), importedAt: new Date().toISOString(), draft, source: source.file,
    columns: { date: headers[m.dateColumn], views: headers[m.viewsColumn], count: headers.length }, excludedSummary,
    rows: raw.map(row => ({ ...row, date: analyticsDate(row.rawDate, m.dateFormat), views: analyticsViews(row.rawViews, m.numberFormat) })).sort((a, b) => a.date.localeCompare(b.date)) })
}

/** An observed A→B→A change invalidates review; persistence retry keeps IDs and one snapshot. */
export class AnalyticsSession {
  private identity = ''; private generation = 0
  private bindings = new WeakMap<PerformanceReport, { generation: number; bytes: string; project: string; next: KinaouProject; snapshot: boolean; complete: boolean }>()
  observe(project: KinaouProject, source: AnalyticsSource | null, draft: AnalyticsDraft) {
    const identity = JSON.stringify([project, source, draft])
    if (identity !== this.identity) { this.identity = identity; this.generation++ }
  }
  prepare(project: KinaouProject, source: AnalyticsSource, draft: AnalyticsDraft) {
    this.observe(project, source, draft)
    const reports = retainedPerformanceReports(project), review = buildPerformanceReport(source, draft)
    if (reports.some(r => r.source.sha256 === review.source.sha256 && JSON.stringify(r.draft.mapping) === JSON.stringify(review.draft.mapping) && r.draft.scope === draft.scope && r.draft.platform === draft.platform)) throw Error('This file, mapping and declared scope are already saved; use the existing report')
    const next = parseProject({ ...project, updatedAt: new Date().toISOString(), metadata: { ...project.metadata, performanceReportsV1: [...reports, review] } })
    retainedPerformanceReports(next)
    this.bindings.set(review, { generation: this.generation, bytes: JSON.stringify(review), project: JSON.stringify(project), next, snapshot: false, complete: false })
    return review
  }
  current(review: PerformanceReport) {
    const bound = this.bindings.get(review)
    return !!bound && !bound.complete && bound.generation === this.generation && bound.bytes === JSON.stringify(review)
  }
  commit(project: KinaouProject, review: PerformanceReport, acknowledged: boolean, snapshot: (project: KinaouProject) => void, persist: (project: KinaouProject) => void) {
    const bound = this.bindings.get(review)
    if (acknowledged !== true || !bound || !this.current(review) || bound.project !== JSON.stringify(project)) throw Error('Review and acknowledge the unchanged report and project before saving')
    if (!bound.snapshot) { snapshot(project); bound.snapshot = true }
    persist(structuredClone(bound.next)); bound.complete = true
  }
}
