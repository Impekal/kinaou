import { describe, expect, it } from 'vitest'
import { createProject } from '../src/core/project'
import { defaultProjectContentProfile, localizedDirectorBrief, projectContentProfile, setProjectContentProfile } from '../src/core/contentProfile'

describe('multilingual project content profile', () => {
  it('persists German, English and French profiles and produces an explicit local Director brief', () => {
    const project = createProject('Localized', new Date('2026-09-20T07:00:00.000Z'))
    const profile = { ...defaultProjectContentProfile, sourceLanguage: 'de' as const, outputLanguage: 'fr' as const, targetMarket: 'fr', audience: 'Jeunes adultes', objective: 'Inscription', tone: 'Clair et crédible' }
    const saved = setProjectContentProfile(project, profile, new Date('2026-09-20T07:01:00.000Z'))
    expect(projectContentProfile(saved)).toEqual({ ...profile, targetMarket: 'FR' })
    const brief = localizedDirectorBrief(projectContentProfile(saved), 'Erkläre das Produkt.')
    expect(brief).toContain('Required output language: Français (fr)')
    expect(brief).toContain('Target market: FR')
    expect(brief).toContain('Do not claim current trend data')
    expect(brief).toContain('Erkläre das Produkt.')
  })

  it('uses safe defaults and rejects unsupported language or market values', () => {
    const project = createProject('Defaults')
    expect(projectContentProfile({ ...project, metadata: { contentProfile: { outputLanguage: 'es' } } })).toEqual(defaultProjectContentProfile)
    expect(() => setProjectContentProfile(project, { ...defaultProjectContentProfile, targetMarket: 'EUROPE' })).toThrow(/Target market/)
    expect(() => localizedDirectorBrief(defaultProjectContentProfile, ' ')).toThrow()
  })
})
