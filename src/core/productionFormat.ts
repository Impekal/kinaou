import { z } from 'zod'
import { touchProject, type KinaouProject } from './project'

export const productionFormats = ['general', 'cartoon', 'children', 'learning', 'sports'] as const
export type ProductionFormat = typeof productionFormats[number]

/** Declared by the author. KINAOU never infers or verifies a viewer's age. */
export const productionAgeBands = ['unspecified', 'under6', '6to9', '10to13', '14to17', 'adults', 'all'] as const
export type ProductionAgeBand = typeof productionAgeBands[number]

export const productionReviewItems = ['age-suitability', 'educational-accuracy', 'character-consistency', 'sports-source-rights'] as const
export type ProductionReviewItem = typeof productionReviewItems[number]

const youngBands = new Set<ProductionAgeBand>(['under6', '6to9', '10to13'])

export const productionFormatDeclarationSchema = z.object({
  format: z.enum(productionFormats),
  ageBand: z.enum(productionAgeBands),
  purpose: z.string().trim().max(1000)
}).strict().superRefine((value, ctx) => {
  // A children's production without a declared age is exactly the vagueness this profile exists to remove.
  if (value.format === 'children' && !youngBands.has(value.ageBand) && value.ageBand !== '14to17') {
    ctx.addIssue({ code: 'custom', path: ['ageBand'], message: 'A children\'s production needs a declared age band below 18' })
  }
  if (value.format !== 'general' && !value.purpose) {
    ctx.addIssue({ code: 'custom', path: ['purpose'], message: 'State what the viewer should take away' })
  }
})
export type ProductionFormatDeclaration = z.infer<typeof productionFormatDeclarationSchema>

const reviewSchema = z.object({
  item: z.enum(productionReviewItems),
  reviewer: z.string().trim().min(1).max(120),
  note: z.string().trim().min(1).max(2000),
  reviewedAt: z.string().datetime(),
  signature: z.string().regex(/^[a-f0-9]{64}$/),
  scope: z.literal('production-format-script-v1')
}).strict()
export type ProductionFormatReview = z.infer<typeof reviewSchema>

const storedSchema = z.object({
  schemaVersion: z.literal(1),
  declaration: productionFormatDeclarationSchema,
  reviews: z.array(reviewSchema).max(productionReviewItems.length)
}).strict().superRefine((value, ctx) => {
  if (new Set(value.reviews.map(review => review.item)).size !== value.reviews.length) ctx.addIssue({ code: 'custom', message: 'Duplicate format review records' })
})

export const defaultProductionFormatDeclaration: ProductionFormatDeclaration = { format: 'general', ageBand: 'unspecified', purpose: '' }

const key = 'productionFormat'

function stored(project: KinaouProject): z.infer<typeof storedSchema> | null {
  if (!Object.hasOwn(project.metadata, key)) return null
  const result = storedSchema.safeParse(project.metadata[key])
  if (!result.success) throw new Error('Saved production format is invalid; restore a valid project version')
  return result.data
}

export function projectProductionFormat(project: KinaouProject): ProductionFormatDeclaration {
  return stored(project)?.declaration ?? defaultProductionFormatDeclaration
}

export function projectProductionFormatReviews(project: KinaouProject): ProductionFormatReview[] {
  return stored(project)?.reviews ?? []
}

/**
 * Which self-reported checks a declaration calls for. The list is deliberately short:
 * each item names something only a person can judge, and none of them is a certificate.
 */
export function requiredProductionReviews(declaration: ProductionFormatDeclaration): ProductionReviewItem[] {
  const required: ProductionReviewItem[] = []
  if (declaration.format === 'children' || youngBands.has(declaration.ageBand)) required.push('age-suitability')
  if (declaration.format === 'learning' || declaration.format === 'children') required.push('educational-accuracy')
  if (declaration.format === 'cartoon') required.push('character-consistency')
  if (declaration.format === 'sports') required.push('sports-source-rights')
  return required
}

/**
 * Saving a different declaration discards earlier acknowledgements: a check made for
 * ten-year-olds says nothing about the same script declared for under-sixes.
 */
export function setProjectProductionFormat(project: KinaouProject, declaration: ProductionFormatDeclaration, now = new Date()): KinaouProject {
  const normalized = productionFormatDeclarationSchema.parse(declaration)
  const current = stored(project)
  if (current && JSON.stringify(current.declaration) === JSON.stringify(normalized)) return project
  const next = storedSchema.parse({ schemaVersion: 1, declaration: normalized, reviews: [] })
  return touchProject({ ...project, metadata: { ...project.metadata, [key]: next } }, now)
}

/**
 * What a format review actually looked at: the declaration and every word the production
 * says or shows as text. Media bytes, generated pictures and the final render are not part
 * of it, and the name says so.
 */
export async function productionFormatSignature(project: KinaouProject): Promise<string> {
  const declaration = projectProductionFormat(project)
  const content = {
    declaration,
    script: project.script,
    scenes: project.storyboard.map(scene => ({ id: scene.id, title: scene.title, description: scene.description, narration: scene.narration ?? null }))
  }
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(content)))
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

export type ProductionReviewState = 'missing' | 'current' | 'stale'

export interface ProductionReviewStatus {
  item: ProductionReviewItem
  state: ProductionReviewState
  review?: ProductionFormatReview
}

export function productionReviewStatuses(project: KinaouProject, signature: string): ProductionReviewStatus[] {
  const reviews = projectProductionFormatReviews(project)
  return requiredProductionReviews(projectProductionFormat(project)).map(item => {
    const review = reviews.find(entry => entry.item === item)
    if (!review) return { item, state: 'missing' as const }
    return { item, state: review.signature === signature ? 'current' as const : 'stale' as const, review }
  })
}

export const productionReviewInputSchema = z.object({
  reviewer: z.string().trim().min(1).max(120),
  note: z.string().trim().min(1).max(2000)
}).strict()
export type ProductionReviewInput = z.infer<typeof productionReviewInputSchema>

/** Records one self-reported check against the script as it stands right now. */
export async function recordProductionFormatReview(project: KinaouProject, item: ProductionReviewItem, input: ProductionReviewInput, now = new Date()): Promise<KinaouProject> {
  const current = stored(project)
  if (!current) throw new Error('Save the production format before recording a review')
  if (!requiredProductionReviews(current.declaration).includes(item)) throw new Error('This check does not apply to the saved production format')
  if (!project.script.trim() && !project.storyboard.length) throw new Error('There is no script or storyboard to review yet')
  const parsed = productionReviewInputSchema.parse(input)
  const review = reviewSchema.parse({ ...parsed, item, reviewedAt: now.toISOString(), signature: await productionFormatSignature(project), scope: 'production-format-script-v1' })
  const next = storedSchema.parse({ ...current, reviews: [...current.reviews.filter(entry => entry.item !== item), review] })
  return touchProject({ ...project, metadata: { ...project.metadata, [key]: next } }, now)
}

const formatGuidance: Record<Exclude<ProductionFormat, 'general'>, string[]> = {
  cartoon: [
    'This is a cartoon. Keep every recurring character\'s name, appearance and voice description identical in every scene; never rename or redesign a character between scenes.',
    'Describe visuals as drawn animation, never as live-action footage or a real recording.'
  ],
  children: [
    'This is a production for children. Use short sentences and words the declared age group knows; explain any unavoidable new word once.',
    'No frightening, violent, humiliating or sexual content. No pressure to buy, subscribe, share or keep watching, and no direct appeals to ask parents for purchases.',
    'Do not ask children for personal information.'
  ],
  learning: [
    'This is learning content. State only facts that appear in the creative brief; where the brief does not establish something, say so instead of inventing it.',
    'Introduce one idea per scene and end with what the viewer can now do or explain.'
  ],
  sports: [
    'This is sports content. Describe only original graphics, the creator\'s own footage or sources the brief explicitly names as authorized; never describe broadcast match footage, club or league logos or player likenesses as available material.',
    'Present tactics and results only as stated in the brief; do not invent scores, statistics, quotes or transfer news.'
  ]
}

const ageGuidance: Record<ProductionAgeBand, string> = {
  unspecified: 'Not declared',
  under6: 'under 6 years',
  '6to9': '6 to 9 years',
  '10to13': '10 to 13 years',
  '14to17': '14 to 17 years',
  adults: 'adults',
  all: 'all ages'
}

/**
 * The lines the local Director receives. They constrain a draft; they do not make the
 * draft suitable — that is what the recorded reviews are for.
 */
export function productionFormatDirectorGuidance(declaration: ProductionFormatDeclaration): string[] {
  const normalized = productionFormatDeclarationSchema.parse(declaration)
  if (normalized.format === 'general' && normalized.ageBand === 'unspecified' && !normalized.purpose) return []
  const lines = [
    `- Production format: ${normalized.format}`,
    `- Declared viewer age: ${ageGuidance[normalized.ageBand]}`,
    `- What the viewer should take away: ${normalized.purpose || 'Not specified'}`
  ]
  if (normalized.format !== 'general') lines.push(...formatGuidance[normalized.format])
  if (youngBands.has(normalized.ageBand) && normalized.format !== 'children') lines.push(...formatGuidance.children)
  return lines
}
