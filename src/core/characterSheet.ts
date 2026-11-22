import { z } from 'zod'
import { touchProject, type KinaouProject } from './project'

const characterSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().trim().min(1).max(80),
  /** The one fixed description. It is reused word for word, which is the whole point. */
  appearance: z.string().trim().min(1).max(1200),
  voice: z.string().trim().max(600)
}).strict()
export type SheetCharacter = z.infer<typeof characterSchema>

export const characterSheetSchema = z.object({
  schemaVersion: z.literal(1),
  style: z.string().trim().max(1000),
  characters: z.array(characterSchema).max(24)
}).strict().superRefine((sheet, ctx) => {
  const names = sheet.characters.map(character => character.name.toLocaleLowerCase())
  if (new Set(names).size !== names.length) ctx.addIssue({ code: 'custom', path: ['characters'], message: 'Two characters share a name' })
  if (new Set(sheet.characters.map(character => character.id)).size !== sheet.characters.length) ctx.addIssue({ code: 'custom', path: ['characters'], message: 'Duplicate character id' })
})
export type CharacterSheet = z.infer<typeof characterSheetSchema>

export const emptyCharacterSheet: CharacterSheet = { schemaVersion: 1, style: '', characters: [] }

const key = 'characterSheet'

export function projectCharacterSheet(project: KinaouProject): CharacterSheet {
  if (!Object.hasOwn(project.metadata, key)) return emptyCharacterSheet
  const result = characterSheetSchema.safeParse(project.metadata[key])
  if (!result.success) throw new Error('Saved character sheet is invalid; restore a valid project version')
  return result.data
}

export function saveCharacterSheet(project: KinaouProject, sheet: CharacterSheet, now = new Date()): KinaouProject {
  const normalized = characterSheetSchema.parse(sheet)
  if (Object.hasOwn(project.metadata, key) && JSON.stringify(projectCharacterSheet(project)) === JSON.stringify(normalized)) return project
  return touchProject({ ...project, metadata: { ...project.metadata, [key]: normalized } }, now)
}

/**
 * The exact text a prompt receives for the chosen characters. Deterministic and in sheet
 * order, so the same selection always yields the same characters, byte for byte.
 */
export function characterPromptFragment(sheet: CharacterSheet, characterIds: readonly string[]): string {
  const chosen = sheet.characters.filter(character => characterIds.includes(character.id))
  if (!chosen.length) return ''
  const parts = chosen.map(character => `${character.name}: ${character.appearance}`)
  if (sheet.style) parts.push(`Style: ${sheet.style}`)
  return parts.join('\n')
}

/** Appends the fragment without disturbing what the author already wrote, and never twice. */
export function addCharactersToPrompt(prompt: string, sheet: CharacterSheet, characterIds: readonly string[]): string {
  const missing = sheet.characters.filter(character => characterIds.includes(character.id) && !prompt.includes(`${character.name}: ${character.appearance}`)).map(character => character.id)
  const lines = sheet.characters.filter(character => missing.includes(character.id)).map(character => `${character.name}: ${character.appearance}`)
  if (sheet.style && !prompt.includes(`Style: ${sheet.style}`) && (lines.length || characterIds.length)) lines.push(`Style: ${sheet.style}`)
  if (!lines.length) return prompt
  return [prompt.trimEnd(), ...lines].filter(Boolean).join('\n')
}

/** The lines the local Director receives. They ask for consistency; they cannot enforce it. */
export function characterSheetDirectorGuidance(sheet: CharacterSheet): string[] {
  const normalized = characterSheetSchema.parse(sheet)
  if (!normalized.characters.length && !normalized.style) return []
  const lines: string[] = []
  if (normalized.characters.length) {
    lines.push('Recurring characters. Use these names and descriptions exactly as written in every scene they appear in; never rename, redesign or merge them, and do not introduce a new recurring character:')
    for (const character of normalized.characters) lines.push(`- ${character.name} — appearance: ${character.appearance}${character.voice ? ` — speaks: ${character.voice}` : ''}`)
  }
  if (normalized.style) lines.push(`Visual style for every scene: ${normalized.style}`)
  return lines
}

function mentions(text: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // Letters on either side would make "Mo" match inside "Mond"; anything else is a boundary.
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, 'iu').test(text)
}

export interface SceneCast { sceneId: string; title: string; characterIds: string[] }

/**
 * Where each character's name literally occurs in the script. A literal match is all this
 * is: a pronoun, a nickname or a picture of the character without the name is not found.
 */
export function sceneCast(project: KinaouProject, sheet: CharacterSheet): { scenes: SceneCast[]; unused: string[] } {
  const scenes = project.storyboard.map(scene => {
    const text = [scene.title, scene.description, scene.narration ?? ''].join('\n')
    return { sceneId: scene.id, title: scene.title, characterIds: sheet.characters.filter(character => mentions(text, character.name)).map(character => character.id) }
  })
  const used = new Set(scenes.flatMap(scene => scene.characterIds))
  const scriptOnly = sheet.characters.filter(character => !used.has(character.id) && mentions(project.script, character.name)).map(character => character.id)
  return { scenes, unused: sheet.characters.filter(character => !used.has(character.id) && !scriptOnly.includes(character.id)).map(character => character.id) }
}

export type ImageCharacterState = 'current' | 'different'

export interface ImageCharacterUse {
  assetId: string
  name: string
  characters: Array<{ characterId: string; state: ImageCharacterState }>
}

/**
 * Compares each generated picture's stored prompt with the sheet. 'current' means the
 * prompt contains the character's present description word for word; 'different' means
 * the name is in the prompt but that description is not — the picture was made from other
 * words. It says nothing about what the picture looks like.
 */
export function imageCharacterUse(project: KinaouProject, sheet: CharacterSheet): ImageCharacterUse[] {
  const uses: ImageCharacterUse[] = []
  for (const asset of project.assets) {
    if (asset.kind !== 'image' || asset.metadata.generated !== true) continue
    const prompt = typeof asset.metadata.positivePrompt === 'string' ? asset.metadata.positivePrompt : ''
    if (!prompt) continue
    const characters = sheet.characters.filter(character => mentions(prompt, character.name)).map(character => ({
      characterId: character.id,
      state: prompt.includes(character.appearance) ? 'current' as const : 'different' as const
    }))
    if (characters.length) uses.push({ assetId: asset.id, name: typeof asset.metadata.name === 'string' ? asset.metadata.name : asset.id, characters })
  }
  return uses
}
