import { z } from 'zod'
import { touchProject, type KinaouProject } from './project'

const line = (max: number) => z.string().trim().max(max).refine(value => !/[\x00-\x1f\x7f]/.test(value), 'Control characters are not allowed')
const text = (max: number) => z.string().trim().max(max).refine(value => !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value), 'Control characters are not allowed')
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const time = Date.parse(value + 'T00:00:00.000Z')
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value
}, 'Not a real calendar date')

/** Only a plain web address the author looked at. KINAOU never opens it. */
const url = z.string().trim().min(1).max(2000).refine(value => {
  try { const parsed = new URL(value); return (parsed.protocol === 'https:' || parsed.protocol === 'http:') && !parsed.username && !parsed.password } catch { return false }
}, 'Enter a complete http(s) address without credentials')

const entrySchema = z.object({
  id: z.string().min(1).max(64),
  url,
  title: line(200).min(1),
  where: line(60),
  /** The day the author looked. Everything in this entry is true of that day at most. */
  observedOn: isoDate,
  /** Whatever figure the page showed, copied as text. Never parsed, compared or summed. */
  shownFigure: line(80),
  covers: text(1000).min(1),
  leavesOut: text(1000)
}).strict()
export type CompetitionEntry = z.infer<typeof entrySchema>

export const competitionReviewSchema = z.object({
  schemaVersion: z.literal(1),
  topic: line(300),
  /** What this production will do that the reviewed ones do not — the author's claim. */
  angle: text(1500),
  entries: z.array(entrySchema).max(50)
}).strict().superRefine((review, ctx) => {
  if (new Set(review.entries.map(entry => entry.id)).size !== review.entries.length) ctx.addIssue({ code: 'custom', path: ['entries'], message: 'Duplicate entry id' })
  const addresses = review.entries.map(entry => entry.url.toLocaleLowerCase())
  if (new Set(addresses).size !== addresses.length) ctx.addIssue({ code: 'custom', path: ['entries'], message: 'The same address is listed twice' })
})
export type CompetitionReview = z.infer<typeof competitionReviewSchema>

export const emptyCompetitionReview: CompetitionReview = { schemaVersion: 1, topic: '', angle: '', entries: [] }

const key = 'competitionReview'

export function projectCompetitionReview(project: KinaouProject): CompetitionReview {
  if (!Object.hasOwn(project.metadata, key)) return emptyCompetitionReview
  const result = competitionReviewSchema.safeParse(project.metadata[key])
  if (!result.success) throw new Error('Saved competition review is invalid; restore a valid project version')
  return result.data
}

export function saveCompetitionReview(project: KinaouProject, review: CompetitionReview, now = new Date()): KinaouProject {
  const normalized = competitionReviewSchema.parse(review)
  if (Object.hasOwn(project.metadata, key) && JSON.stringify(projectCompetitionReview(project)) === JSON.stringify(normalized)) return project
  return touchProject({ ...project, metadata: { ...project.metadata, [key]: normalized } }, now)
}

export type CompetitionIssue = 'url' | 'title' | 'date' | 'covers' | 'duplicate' | 'future'

/** The first thing that keeps a draft from being saved, with the entry it concerns. */
export function competitionReviewIssue(draft: CompetitionReview, today: string): { issue: CompetitionIssue; index: number } | null {
  const seen = new Set<string>()
  for (const [index, entry] of draft.entries.entries()) {
    if (!url.safeParse(entry.url).success) return { issue: 'url', index }
    if (!entry.title.trim()) return { issue: 'title', index }
    if (!isoDate.safeParse(entry.observedOn).success) return { issue: 'date', index }
    // An observation dated after today cannot have been made.
    if (entry.observedOn > today) return { issue: 'future', index }
    if (!entry.covers.trim()) return { issue: 'covers', index }
    const address = entry.url.trim().toLocaleLowerCase()
    if (seen.has(address)) return { issue: 'duplicate', index }
    seen.add(address)
  }
  return null
}

export interface CompetitionSummary { entries: number; oldest: string | null; newest: string | null; oldestAgeDays: number | null; withGap: number }

/** Counts and dates only. How old an observation is matters because pages change. */
export function summarizeCompetitionReview(review: CompetitionReview, today: string): CompetitionSummary {
  if (!review.entries.length) return { entries: 0, oldest: null, newest: null, oldestAgeDays: null, withGap: 0 }
  const dates = review.entries.map(entry => entry.observedOn).sort()
  const age = Math.round((Date.parse(today + 'T00:00:00.000Z') - Date.parse(dates[0] + 'T00:00:00.000Z')) / 86400000)
  return { entries: review.entries.length, oldest: dates[0], newest: dates[dates.length - 1], oldestAgeDays: Math.max(0, age), withGap: review.entries.filter(entry => entry.leavesOut).length }
}

/**
 * What the local Director is told. It is passed as the author's own notes about what
 * exists — explicitly not as verified fact and never as text to imitate.
 */
export function competitionDirectorGuidance(review: CompetitionReview): string[] {
  const normalized = competitionReviewSchema.parse(review)
  if (!normalized.entries.length && !normalized.angle) return []
  const lines: string[] = []
  if (normalized.entries.length) {
    lines.push('Existing coverage the author looked at (the author\'s own notes, not verified facts; do not copy, quote or imitate these works, and do not cite their figures):')
    for (const entry of normalized.entries.slice(0, 12)) lines.push(`- "${entry.title}" — covers: ${entry.covers}${entry.leavesOut ? ` — leaves out: ${entry.leavesOut}` : ''}`)
    if (normalized.entries.length > 12) lines.push(`- (${normalized.entries.length - 12} further entries not listed here)`)
  }
  if (normalized.angle) lines.push(`What this production must do differently, in the author's words: ${normalized.angle}`)
  return lines
}
