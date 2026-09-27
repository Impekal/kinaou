import { z } from 'zod'
import { parseProject, type KinaouProject } from './project'
import { exportReceiptSchema, projectExportHistory, type ExportReceipt } from './exportHistory'
import { publicationInstant, publicationLocalTime, publicationTimeZone } from './publicationTime'

const eventSchema = z.object({ kind: z.enum(['main', 'short']), receipt: exportReceiptSchema, offsetHours: z.number().int().min(0).max(720), at: z.string().datetime(), local: z.string().min(16).max(16) }).strict()
const schema = z.object({ schemaVersion: z.literal(1), id: z.string().uuid(), revision: z.number().int().min(1).max(10000), projectId: z.string().min(1).max(200), createdAt: z.string().datetime(), savedAt: z.string().datetime(), basis: z.literal('author-experiment'), timeZone: z.string().min(1).max(100), targetMarket: z.string().regex(/^(WORLD|[A-Z]{2})$/), rationale: z.string().trim().min(1).max(2000), events: z.array(eventSchema).min(2).max(4) }).strict()
export type PublicationPlan = z.infer<typeof schema>
export interface PublicationPlanDraft { mainJobId: string; shorts: Array<{ jobId: string; offsetHours: number }>; mainLocal: string; timeZone: string; targetMarket: string; rationale: string }
export const suggestedShortOffsets = [24, 72, 168] as const
export function publicationPlanChoices(project: KinaouProject) {
  const main = projectExportHistory(project)
  return { main, shorts: main.filter(receipt => ['vertical', 'square'].includes(receipt.format) && receipt.durationMs <= 180000) }
}
function validate(value: unknown, projectId: string): PublicationPlan {
  const plan = schema.parse(value)
  if (plan.projectId !== projectId) throw Error('Publication plan project mismatch')
  publicationTimeZone(plan.timeZone) // Accept valid IANA aliases retained by earlier Intl databases.
  const [main, ...shorts] = plan.events
  if (main.kind !== 'main' || main.offsetHours !== 0 || shorts.some((event, index) => event.kind !== 'short' || event.offsetHours <= (plan.events[index].offsetHours) || !['vertical', 'square'].includes(event.receipt.format) || event.receipt.durationMs > 180000)) throw Error('Invalid main/Short plan sequence')
  if (new Set(plan.events.map(event => event.receipt.jobId)).size !== plan.events.length || new Set(plan.events.map(event => event.receipt.outputRelativePath)).size !== plan.events.length) throw Error('Choose distinct export files')
  for (const event of plan.events) {
    if (new Date(Date.parse(main.at) + event.offsetHours * 3600000).toISOString() !== event.at || publicationLocalTime(event.at, plan.timeZone) !== event.local) throw Error('Publication plan dates do not match')
  }
  if (new TextEncoder().encode(JSON.stringify(plan)).length > 32000) throw Error('Publication plan exceeds 32,000 bytes')
  return plan
}
export function projectPublicationPlan(project: KinaouProject): PublicationPlan | null {
  return project.metadata.publicationPlan === undefined ? null : validate(project.metadata.publicationPlan, project.id)
}
export function publicationPlanDraftFromSaved(project: KinaouProject): PublicationPlanDraft {
  const plan = projectPublicationPlan(project)
  if (!plan) throw Error('No saved local publication plan')
  return { mainJobId: plan.events[0].receipt.jobId, shorts: plan.events.slice(1).map(event => ({ jobId: event.receipt.jobId, offsetHours: event.offsetHours })), mainLocal: plan.events[0].local, timeZone: plan.timeZone, targetMarket: plan.targetMarket, rationale: plan.rationale }
}
export interface PublicationPlanReview { readonly plan: PublicationPlan }
const bindings = new WeakMap<PublicationPlanReview, { project: string; plan: string }>()
/** Read-only proposal. Suggested offsets are editable hypotheses, never measured optimal posting times. */
export function reviewPublicationPlan(project: KinaouProject, draft: PublicationPlanDraft, now = new Date()): PublicationPlanReview {
  const previous = projectPublicationPlan(project), choices = publicationPlanChoices(project), timeZone = publicationTimeZone(draft.timeZone), at = publicationInstant(draft.mainLocal, timeZone)
  if (Date.parse(at) <= now.getTime()) throw Error('Choose a main-video time in the future')
  if (!Array.isArray(draft.shorts) || draft.shorts.length < 1 || draft.shorts.length > 3) throw Error('Choose one to three companion Shorts')
  const main = choices.main.find(receipt => receipt.jobId === draft.mainJobId)
  if (!main) throw Error('Select a retained main-video export')
  const entries: Array<{ kind: 'main' | 'short'; receipt: ExportReceipt; offsetHours: number }> = [{ kind: 'main', receipt: main, offsetHours: 0 }]
  for (const selected of draft.shorts) {
    const receipt = choices.shorts.find(receipt => receipt.jobId === selected.jobId)
    if (!receipt || !Number.isSafeInteger(selected.offsetHours) || selected.offsetHours < 1 || selected.offsetHours > 720) throw Error('Choose a retained eligible Short and a whole-hour offset from 1 to 720')
    entries.push({ kind: 'short', receipt, offsetHours: selected.offsetHours })
  }
  const plan = validate({ schemaVersion: 1, id: previous?.id ?? crypto.randomUUID(), revision: (previous?.revision ?? 0) + 1, projectId: project.id, createdAt: previous?.createdAt ?? now.toISOString(), savedAt: now.toISOString(), basis: 'author-experiment', timeZone, targetMarket: draft.targetMarket.trim().toUpperCase(), rationale: draft.rationale,
    events: entries.map(entry => { const instant = new Date(Date.parse(at) + entry.offsetHours * 3600000).toISOString(); return { ...entry, at: instant, local: publicationLocalTime(instant, timeZone) } }) }, project.id)
  const review = Object.freeze({ plan }); bindings.set(review, { project: JSON.stringify(project), plan: JSON.stringify(plan) }); return review
}
export function applyPublicationPlan(project: KinaouProject, review: PublicationPlanReview, confirmed: boolean, now = new Date()): KinaouProject {
  const binding = bindings.get(review)
  if (!confirmed || !binding || binding.project !== JSON.stringify(project) || binding.plan !== JSON.stringify(review.plan) || Date.parse(review.plan.events[0].at) <= now.getTime()) {
    bindings.delete(review); throw Error('Publication plan needs a current unchanged review and explicit confirmation')
  }
  const plan = validate(review.plan, project.id)
  return parseProject({ ...project, updatedAt: now.toISOString(), metadata: { ...project.metadata, publicationPlan: plan } })
}
export function publicationPlanMissingReceipts(project: KinaouProject, plan: PublicationPlan) {
  const current = publicationPlanChoices(project).main
  return validate(plan, project.id).events.filter(event => !current.some(receipt => JSON.stringify(receipt) === JSON.stringify(event.receipt))).length
}
function escapeText(value: string) { return value.replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '') }
function folded(line: string) {
  const lines: string[] = []; let current = '', bytes = 0
  for (const character of line) { const count = new TextEncoder().encode(character).length; if (bytes + count > 75) { lines.push(current); current = ' '; bytes = 1 } current += character; bytes += count }
  lines.push(current); return lines.join('\r\n')
}
const stamp = (value: string) => new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
/** Local calendar file only. No provider scheduling, invitations, alarms, remote attachments or executable fields. */
export function publicationPlanCalendar(plan: PublicationPlan, labels: { main: string; short: string; warning: string }) {
  const checked = validate(plan, plan.projectId), lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//KINAOU//Local publication experiment//EN', 'CALSCALE:GREGORIAN']
  checked.events.forEach((event, index) => {
    lines.push('BEGIN:VEVENT', 'UID:' + checked.id + '-' + index + '@kinaou.local', 'DTSTAMP:' + stamp(checked.savedAt), 'SEQUENCE:' + (checked.revision - 1), 'DTSTART:' + stamp(event.at), 'DTEND:' + stamp(new Date(Date.parse(event.at) + 15 * 60000).toISOString()), 'STATUS:TENTATIVE', 'TRANSP:TRANSPARENT', 'CLASS:PRIVATE',
      'SUMMARY:' + escapeText((event.kind === 'main' ? labels.main : labels.short) + ': ' + event.receipt.label),
      'DESCRIPTION:' + escapeText([labels.warning, checked.targetMarket + ' / ' + checked.timeZone, event.local, checked.rationale, 'Historical export: ' + event.receipt.outputRelativePath, 'No automatic upload or publishing.'].join('\n')), 'END:VEVENT')
  })
  lines.push('END:VCALENDAR'); return lines.map(folded).join('\r\n') + '\r\n'
}
