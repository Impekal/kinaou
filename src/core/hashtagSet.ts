import { z } from 'zod'
import { touchProject, type KinaouProject } from './project'
import { retainedSearchTrends } from './searchTrends'

export const hashtagVariants = ['main', 'short'] as const
export type HashtagVariant = typeof hashtagVariants[number]

const tagPattern = /^[\p{L}\p{N}_]{1,100}$/u

/**
 * Writes a keyword the way a hashtag has to be written: one unbroken word. Several words
 * are joined with each later word capitalised, which keeps them readable and lets screen
 * readers pronounce them. Returns null when nothing usable is left or no letter remains.
 */
export function hashtagForm(keyword: string): string | null {
  const words = keyword.normalize('NFC').replace(/^#+/, '').split(/[^\p{L}\p{N}_]+/u).filter(Boolean)
  if (!words.length) return null
  const joined = words.length === 1 ? words[0] : words.map((word, index) => index === 0 ? word : word.charAt(0).toLocaleUpperCase() + word.slice(1)).join('')
  if (!tagPattern.test(joined) || !/\p{L}/u.test(joined)) return null
  return joined
}

export type HashtagCandidateIssue = 'unusable' | 'duplicate'

export interface HashtagCandidate {
  keyword: string
  tag: string | null
  /** True when the keyword had to be rewritten to become a hashtag, so the author sees the change. */
  rewritten: boolean
  issue: HashtagCandidateIssue | null
}

/** One candidate per entered keyword, in the order entered. Nothing is dropped silently. */
export function hashtagCandidates(input: string): HashtagCandidate[] {
  const seen = new Set<string>()
  const candidates: HashtagCandidate[] = []
  for (const raw of input.split(/[\n,]/)) {
    const keyword = raw.trim().replace(/\s+/g, ' ')
    if (!keyword) continue
    const tag = hashtagForm(keyword)
    if (!tag) { candidates.push({ keyword, tag: null, rewritten: false, issue: 'unusable' }); continue }
    const identity = tag.toLocaleLowerCase()
    const duplicate = seen.has(identity)
    seen.add(identity)
    candidates.push({ keyword, tag, rewritten: tag !== keyword.replace(/^#+/, ''), issue: duplicate ? 'duplicate' : null })
  }
  return candidates
}

export interface HashtagTrendEvidence { country: string; retrievedAt: string; reportedTraffic: string | null }

export interface HashtagEvidence {
  /** Scenes whose title, description or narration contain the keyword as written. */
  scriptScenes: number
  inScript: boolean
  /** Retained search-interest observations whose term is exactly this keyword. */
  trends: HashtagTrendEvidence[]
}

function occurs(text: string, phrase: string): boolean {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+')
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, 'iu').test(text)
}

/**
 * What this project itself holds in support of a keyword. It is recomputed from the
 * current project every time, so it can never describe an older script. A search-interest
 * observation is a dated record from one market — not video demand and not a forecast.
 */
export function hashtagEvidence(project: KinaouProject, keyword: string): HashtagEvidence {
  const phrase = keyword.trim().replace(/^#+/, '').replace(/\s+/g, ' ')
  const scriptScenes = phrase ? project.storyboard.filter(scene => occurs([scene.title, scene.description, scene.narration ?? ''].join('\n'), phrase)).length : 0
  const normalized = phrase.toLocaleLowerCase()
  const trends = phrase ? retainedSearchTrends(project)
    .filter(entry => entry.items[0].query.trim().replace(/\s+/g, ' ').toLocaleLowerCase() === normalized)
    .map(entry => ({ country: entry.country, retrievedAt: entry.retrievedAt, reportedTraffic: entry.items[0].reportedTraffic })) : []
  return { scriptScenes, inScript: scriptScenes > 0 || (Boolean(phrase) && occurs(project.script, phrase)), trends }
}

const savedTagSchema = z.object({ tag: z.string().regex(tagPattern), keyword: z.string().trim().min(1).max(200) }).strict()
const setSchema = z.object({
  variant: z.enum(hashtagVariants),
  /** The author's own limit. KINAOU does not know any platform's rules. */
  limit: z.number().int().min(1).max(60),
  tags: z.array(savedTagSchema).min(1).max(60),
  savedAt: z.string().datetime()
}).strict().superRefine((set, ctx) => {
  if (set.tags.length > set.limit) ctx.addIssue({ code: 'custom', path: ['tags'], message: 'More hashtags than the chosen limit' })
  const identities = set.tags.map(entry => entry.tag.toLocaleLowerCase())
  if (new Set(identities).size !== identities.length) ctx.addIssue({ code: 'custom', path: ['tags'], message: 'Duplicate hashtag' })
  if (set.tags.some(entry => hashtagForm(entry.keyword) !== entry.tag)) ctx.addIssue({ code: 'custom', path: ['tags'], message: 'A hashtag does not match its keyword' })
})
export type HashtagSet = z.infer<typeof setSchema>

const ledgerSchema = z.object({ schemaVersion: z.literal(1), sets: z.array(setSchema).max(hashtagVariants.length) }).strict().superRefine((ledger, ctx) => {
  if (new Set(ledger.sets.map(set => set.variant)).size !== ledger.sets.length) ctx.addIssue({ code: 'custom', message: 'Duplicate hashtag set' })
})

const key = 'hashtagSets'

function ledger(project: KinaouProject): HashtagSet[] {
  if (!Object.hasOwn(project.metadata, key)) return []
  const result = ledgerSchema.safeParse(project.metadata[key])
  if (!result.success) throw new Error('Saved hashtag sets are invalid; restore a valid project version')
  return result.data.sets
}

export function projectHashtagSet(project: KinaouProject, variant: HashtagVariant): HashtagSet | null {
  return ledger(project).find(set => set.variant === variant) ?? null
}

export interface HashtagSetReview { usable: HashtagCandidate[]; blocked: HashtagCandidate[]; overLimit: number }

/** What stands between a keyword list and a savable set. */
export function reviewHashtagInput(input: string, limit: number): HashtagSetReview {
  const candidates = hashtagCandidates(input)
  const usable = candidates.filter(candidate => !candidate.issue)
  return { usable, blocked: candidates.filter(candidate => candidate.issue), overLimit: Math.max(0, usable.length - limit) }
}

/** Saves exactly the reviewed keywords. Anything unusable, duplicated or over the limit refuses the save. */
export function saveHashtagSet(project: KinaouProject, variant: HashtagVariant, input: string, limit: number, now = new Date()): KinaouProject {
  const review = reviewHashtagInput(input, limit)
  if (review.blocked.length) throw new Error('Remove or fix the keywords that cannot become hashtags')
  if (review.overLimit) throw new Error('More hashtags than the chosen limit')
  const set = setSchema.parse({ variant, limit, tags: review.usable.map(candidate => ({ tag: candidate.tag, keyword: candidate.keyword })), savedAt: now.toISOString() })
  const current = projectHashtagSet(project, variant)
  if (current && current.limit === set.limit && JSON.stringify(current.tags) === JSON.stringify(set.tags)) return project
  const next = ledgerSchema.parse({ schemaVersion: 1, sets: [...ledger(project).filter(entry => entry.variant !== variant), set] })
  return touchProject({ ...project, metadata: { ...project.metadata, [key]: next } }, now)
}

export function clearHashtagSet(project: KinaouProject, variant: HashtagVariant, now = new Date()): KinaouProject {
  const sets = ledger(project)
  if (!sets.some(set => set.variant === variant)) return project
  const next = ledgerSchema.parse({ schemaVersion: 1, sets: sets.filter(set => set.variant !== variant) })
  return touchProject({ ...project, metadata: { ...project.metadata, [key]: next } }, now)
}

/** The line to paste into a platform's own field. */
export function hashtagLine(set: Pick<HashtagSet, 'tags'>): string {
  return set.tags.map(entry => `#${entry.tag}`).join(' ')
}
