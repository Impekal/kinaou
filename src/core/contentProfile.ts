import { z } from 'zod'
import { touchProject, type KinaouProject } from './project'

export const contentLanguageSchema = z.enum(['de', 'en', 'fr'])
export type ContentLanguage = z.infer<typeof contentLanguageSchema>

export const contentLanguageLabels: Record<ContentLanguage, string> = {
  de: 'Deutsch',
  en: 'English',
  fr: 'Français'
}

export const projectContentProfileSchema = z.object({
  schemaVersion: z.literal(1),
  sourceLanguage: contentLanguageSchema,
  outputLanguage: contentLanguageSchema,
  targetMarket: z.string().trim().transform((value) => value.toUpperCase()).pipe(z.string().regex(/^(WORLD|[A-Z]{2})$/, 'Target market must be WORLD or a two-letter country code')),
  audience: z.string().trim().max(1000),
  objective: z.string().trim().max(2000),
  tone: z.string().trim().max(500)
}).strict()

export type ProjectContentProfile = z.infer<typeof projectContentProfileSchema>

export const defaultProjectContentProfile: ProjectContentProfile = {
  schemaVersion: 1,
  sourceLanguage: 'de',
  outputLanguage: 'de',
  targetMarket: 'WORLD',
  audience: '',
  objective: '',
  tone: ''
}

export function projectContentProfile(project: KinaouProject): ProjectContentProfile {
  const parsed = projectContentProfileSchema.safeParse(project.metadata.contentProfile)
  return parsed.success ? parsed.data : defaultProjectContentProfile
}

export function setProjectContentProfile(project: KinaouProject, profile: ProjectContentProfile, now = new Date()): KinaouProject {
  const normalized = projectContentProfileSchema.parse(profile)
  if (JSON.stringify(projectContentProfile(project)) === JSON.stringify(normalized) && Object.prototype.hasOwnProperty.call(project.metadata, 'contentProfile')) return project
  return touchProject({ ...project, metadata: { ...project.metadata, contentProfile: normalized } }, now)
}

export function localizedDirectorBrief(profile: ProjectContentProfile, brief: string): string {
  const normalized = projectContentProfileSchema.parse(profile)
  const source = z.string().trim().min(1).max(45_000).parse(brief)
  return [
    'KINAOU multilingual production profile:',
    `- Source language: ${contentLanguageLabels[normalized.sourceLanguage]} (${normalized.sourceLanguage})`,
    `- Required output language: ${contentLanguageLabels[normalized.outputLanguage]} (${normalized.outputLanguage})`,
    `- Target market: ${normalized.targetMarket}`,
    `- Intended audience: ${normalized.audience || 'Not specified'}`,
    `- Conversion objective: ${normalized.objective || 'Not specified'}`,
    `- Voice and tone: ${normalized.tone || 'Not specified'}`,
    `Write every user-facing title, objective, script, scene title, scene description, narration and visual brief in ${contentLanguageLabels[normalized.outputLanguage]}. Preserve proper names and factual source details. Do not claim current trend data unless it is explicitly present in the brief.`,
    '',
    'Creative brief:',
    source
  ].join('\n')
}
