import { z } from 'zod'
import type { KinaouAsset, KinaouProject } from './project'
import { assertSafeManagedPath } from './storage'

const id = z.string().regex(/^[a-zA-Z0-9-]{1,100}$/)
const title = z.string().trim().min(1).max(120)
export const courseEvidenceLimits = { sourcesPerLesson: 20, demosPerLesson: 10, courseCharacters: 250000 } as const
export const courseEvidenceDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(value + 'T00:00:00.000Z')
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}, 'Use a valid calendar date')
export const courseSourceUrlSchema = z.string().max(2048).refine(value => {
  if (/[\u0000-\u0020\u007f]/.test(value)) return false
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && Boolean(url.hostname) && !url.username && !url.password }
  catch { return false }
}, 'Use an HTTP(S) source URL without embedded credentials')

export const courseSourceSchema = z.object({
  id, title, url: courseSourceUrlSchema,
  accessedOn: courseEvidenceDateSchema.optional(),
  notes: z.string().max(4000)
}).strict()
export const courseEvidenceReferenceSchema = z.object({
  assetId: z.string().min(1).max(200),
  uri: z.string().min(1).max(4096),
  kind: z.enum(['video', 'image', 'audio', 'caption', 'document', 'other'])
}).strict()
export const courseDemonstrationSchema = z.object({
  id, title,
  steps: z.string().max(4000),
  expected: z.string().max(4000),
  observed: z.string().max(4000),
  performedOn: courseEvidenceDateSchema.optional(),
  evidence: courseEvidenceReferenceSchema.optional()
}).strict()
export type CourseSource = z.infer<typeof courseSourceSchema>
export type CourseDemonstration = z.infer<typeof courseDemonstrationSchema>

function usableReference(asset: KinaouAsset) {
  if (!asset.managed || asset.id.length > 200 || asset.uri.length > 4096) return false
  try { return assertSafeManagedPath(asset.uri) === asset.uri && asset.uri.startsWith('KINAOU/') }
  catch { return false }
}
export function courseEvidenceAssetChoices(project: KinaouProject): KinaouAsset[] {
  const counts = new Map<string, number>()
  for (const asset of project.assets) counts.set(asset.id, (counts.get(asset.id) ?? 0) + 1)
  return project.assets.filter(asset => usableReference(asset) && !asset.offline && counts.get(asset.id) === 1)
}
/** Registration, URI and offline metadata only — no assertion about bytes, authenticity or execution. */
export function courseDemoEvidenceState(project: KinaouProject, demo: CourseDemonstration): 'none' | 'missing' | 'changed' | 'offline' | 'linked' {
  if (!demo.evidence) return 'none'
  const matches = project.assets.filter(asset => asset.id === demo.evidence!.assetId)
  if (!matches.length) return 'missing'
  const asset = matches[0]
  if (matches.length !== 1 || !usableReference(asset) || asset.uri !== demo.evidence.uri || asset.kind !== demo.evidence.kind) return 'changed'
  return asset.offline ? 'offline' : 'linked'
}
export function attachCourseDemoEvidence(project: KinaouProject, demo: CourseDemonstration, assetId: string): CourseDemonstration {
  const asset = courseEvidenceAssetChoices(project).find(asset => asset.id === assetId)
  if (!asset) throw new Error('Select an available managed asset from this project')
  return { ...demo, evidence: { assetId: asset.id, uri: asset.uri, kind: asset.kind } }
}
