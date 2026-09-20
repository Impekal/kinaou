import { describe, expect, it } from 'vitest'
import { createProject } from '../src/core/project'
import { forgetProjectShortExportRecipe, projectShortExportRecipes, reviewShortExportRecipe, saveProjectShortExportRecipe } from '../src/core/shortExportRecipes'
import type { ShortExportCandidate } from '../src/core/shortExportRanges'

const candidates: ShortExportCandidate[] = [
  { id: 'scene-a', sceneIds: ['scene-a'], titles: ['Hook'], inMs: 0, outMs: 5000, durationMs: 5000 },
  { id: 'scene-b', sceneIds: ['scene-b'], titles: ['Proof'], inMs: 5000, outMs: 10000, durationMs: 5000 }
]

describe('Short export recipes', () => {
  it('stores only a bounded named current selection and reopens it for review', () => {
    const project = createProject('Recipes', new Date('2026-09-20T06:00:00.000Z'))
    const saved = saveProjectShortExportRecipe(project, { name: 'Vertical hooks', candidateIds: ['scene-a', 'scene-b'], formats: ['vertical', 'square'] }, candidates, new Date('2026-09-20T06:01:00.000Z'), '11111111-1111-4111-8111-111111111111')
    const [recipe] = projectShortExportRecipes(saved)
    expect(recipe).toMatchObject({ name: 'Vertical hooks', candidateIds: ['scene-a', 'scene-b'], formats: ['vertical', 'square'] })
    expect(recipe).not.toHaveProperty('outputPath')
    expect(reviewShortExportRecipe(recipe, [candidates[1]])).toEqual({ candidateIds: ['scene-b'], formats: ['vertical', 'square'], unavailableCandidateIds: ['scene-a'] })
    expect(forgetProjectShortExportRecipe(saved, recipe.id, new Date('2026-09-20T06:02:00.000Z')).metadata.shortExportRecipes).toBeUndefined()
  })

  it('refuses stale, duplicate or unbounded recipe state', () => {
    const project = createProject('Recipes', new Date('2026-09-20T06:00:00.000Z'))
    expect(() => saveProjectShortExportRecipe(project, { name: ' ', candidateIds: ['scene-a'], formats: ['vertical'] }, candidates)).toThrow()
    expect(() => saveProjectShortExportRecipe(project, { name: 'Dupes', candidateIds: ['scene-a', 'scene-a'], formats: ['vertical'] }, candidates)).toThrow(/only once/)
    expect(() => saveProjectShortExportRecipe(project, { name: 'Stale', candidateIds: ['missing'], formats: ['vertical'] }, candidates)).toThrow(/no longer available/)
    const saved = saveProjectShortExportRecipe(project, { name: 'One', candidateIds: ['scene-a'], formats: ['vertical'] }, candidates, new Date('2026-09-20T06:01:00.000Z'), '22222222-2222-4222-8222-222222222222')
    expect(() => saveProjectShortExportRecipe(saved, { name: 'one', candidateIds: ['scene-b'], formats: ['square'] }, candidates)).toThrow(/already exists/)
    expect(projectShortExportRecipes({ ...saved, metadata: { shortExportRecipes: [{ bad: true }, ...projectShortExportRecipes(saved), ...projectShortExportRecipes(saved)] } })).toHaveLength(1)
  })
})
