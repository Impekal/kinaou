import { z } from 'zod'
import { touchProject, type KinaouProject } from './project'
import { type TargetFormat } from './render'
import { type ShortExportCandidate } from './shortExportRanges'

export const shortExportRecipeLimit = 10

export const shortExportRecipeSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  candidateIds: z.array(z.string().trim().min(1).max(500)).min(1).max(100),
  formats: z.array(z.enum(['landscape', 'vertical', 'square'])).min(1).max(3),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
}).strict().superRefine((recipe, context) => {
  if (new Set(recipe.candidateIds).size !== recipe.candidateIds.length) context.addIssue({ code: 'custom', path: ['candidateIds'], message: 'Short recipe candidates must be unique' })
  if (new Set(recipe.formats).size !== recipe.formats.length) context.addIssue({ code: 'custom', path: ['formats'], message: 'Short recipe formats must be unique' })
})

export const shortExportRecipesSchema = z.array(shortExportRecipeSchema).max(shortExportRecipeLimit).superRefine((recipes, context) => {
  if (new Set(recipes.map((recipe) => recipe.id)).size !== recipes.length) context.addIssue({ code: 'custom', message: 'Short recipe ids must be unique' })
  if (new Set(recipes.map((recipe) => recipe.name.toLocaleLowerCase())).size !== recipes.length) context.addIssue({ code: 'custom', message: 'Short recipe names must be unique' })
})

export type ShortExportRecipe = z.infer<typeof shortExportRecipeSchema>
export interface ShortExportRecipeReview { candidateIds: string[]; formats: TargetFormat[]; unavailableCandidateIds: string[] }

export function projectShortExportRecipes(project: KinaouProject): ShortExportRecipe[] {
  if (!Array.isArray(project.metadata.shortExportRecipes)) return []
  const recipes: ShortExportRecipe[] = []
  const ids = new Set<string>()
  const names = new Set<string>()
  for (const value of project.metadata.shortExportRecipes.slice(0, shortExportRecipeLimit * 4)) {
    const parsed = shortExportRecipeSchema.safeParse(value)
    const name = parsed.success ? parsed.data.name.toLocaleLowerCase() : ''
    if (parsed.success && !ids.has(parsed.data.id) && !names.has(name)) {
      recipes.push(parsed.data)
      ids.add(parsed.data.id)
      names.add(name)
    }
    if (recipes.length === shortExportRecipeLimit) break
  }
  return recipes
}

export function saveProjectShortExportRecipe(project: KinaouProject, input: { name: string; candidateIds: string[]; formats: TargetFormat[] }, candidates: ShortExportCandidate[], now = new Date(), id = crypto.randomUUID()): KinaouProject {
  const name = z.string().trim().min(1).max(80).parse(input.name)
  const selected = [...new Set(input.candidateIds)]
  if (!selected.length || selected.length !== input.candidateIds.length) throw new Error('Select each Short candidate for a recipe only once.')
  const current = new Set(candidates.map((candidate) => candidate.id))
  if (selected.some((candidateId) => !current.has(candidateId))) throw new Error('A selected Short candidate is no longer available. Review the current ranges again.')
  const formats = [...new Set(input.formats)]
  if (!formats.length || formats.length !== input.formats.length) throw new Error('Select each Short recipe format only once.')
  const recipe = shortExportRecipeSchema.parse({ schemaVersion: 1, id, name, candidateIds: selected, formats, createdAt: now.toISOString(), updatedAt: now.toISOString() })
  const currentRecipes = projectShortExportRecipes(project)
  if (currentRecipes.some((item) => item.name.toLocaleLowerCase() === recipe.name.toLocaleLowerCase())) throw new Error('A Short recipe with this name already exists.')
  const recipes = shortExportRecipesSchema.parse([recipe, ...currentRecipes].slice(0, shortExportRecipeLimit))
  return touchProject({ ...project, metadata: { ...project.metadata, shortExportRecipes: recipes } }, now)
}

export function reviewShortExportRecipe(recipe: ShortExportRecipe, candidates: ShortExportCandidate[]): ShortExportRecipeReview {
  const normalized = shortExportRecipeSchema.parse(recipe)
  const current = new Set(candidates.map((candidate) => candidate.id))
  return { candidateIds: normalized.candidateIds.filter((id) => current.has(id)), formats: [...normalized.formats], unavailableCandidateIds: normalized.candidateIds.filter((id) => !current.has(id)) }
}

export function forgetProjectShortExportRecipe(project: KinaouProject, recipeId: string, now = new Date()): KinaouProject {
  const id = z.string().uuid().parse(recipeId)
  const current = projectShortExportRecipes(project)
  const recipes = current.filter((recipe) => recipe.id !== id)
  if (recipes.length === current.length) return project
  const metadata = { ...project.metadata }
  if (recipes.length) metadata.shortExportRecipes = shortExportRecipesSchema.parse(recipes)
  else delete metadata.shortExportRecipes
  return touchProject({ ...project, metadata }, now)
}
