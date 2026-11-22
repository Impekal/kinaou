import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CharacterPromptInsert } from '../src/components/CharacterPromptInsert'
import { CharacterSheetPanel, characterSheetIssue } from '../src/components/CharacterSheetPanel'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import {
  addCharactersToPrompt, characterPromptFragment, characterSheetDirectorGuidance, emptyCharacterSheet, imageCharacterUse,
  projectCharacterSheet, saveCharacterSheet, sceneCast, type CharacterSheet
} from '../src/core/characterSheet'
import { defaultProjectContentProfile, localizedDirectorBrief } from '../src/core/contentProfile'
import { assetSchema, createProject, type KinaouProject } from '../src/core/project'
import { uiLanguages } from '../src/core/uiLanguage'
import { translateUi } from '../src/core/uiMessages'
import { displaySystemHistoryLabel } from '../src/core/uiSystemLabels'
import { PersistentVersionHistory } from '../src/core/versioning'

const sheet: CharacterSheet = {
  schemaVersion: 1,
  style: 'flat 2D drawing, bold outlines, warm colours',
  characters: [
    { id: 'mo', name: 'Mo', appearance: 'a small orange fox with a white tail tip and a green scarf', voice: 'curious, short sentences' },
    { id: 'luna', name: 'Luna', appearance: 'a tall grey owl with round yellow glasses', voice: '' }
  ]
}

function history(): PersistentVersionHistory {
  const data = new Map<string, string>()
  return new PersistentVersionHistory({ getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value) }, removeItem: key => { data.delete(key) } })
}

function image(id: string, positivePrompt: string) {
  return assetSchema.parse({ id, kind: 'image', uri: `KINAOU/Assets/GeneratedImages/${id}.png`, managed: true, metadata: { generated: true, adapterId: 'comfyui', name: `Generated image · ${id}`, positivePrompt } })
}

function story(): KinaouProject {
  return {
    ...createProject('Mo und der Mond', new Date('2026-11-22T10:00:00.000Z')),
    script: 'Mo schaut zum Mond.',
    storyboard: [
      { id: 's1', title: 'Am Waldrand', description: 'Mo sitzt im Gras.', narration: 'Mo schaut zum Mond.', durationMs: 4000 },
      { id: 's2', title: 'Die Eule', description: 'Luna landet neben Mo.', narration: 'Hallo, sagt Luna.', durationMs: 4000 },
      { id: 's3', title: 'Der Mond', description: 'Nur der Mond am Himmel.', narration: 'Der Mond leuchtet.', durationMs: 4000 }
    ]
  }
}

describe('character sheet storage', () => {
  it('is empty until saved and round-trips what was saved', () => {
    const project = story()
    expect(projectCharacterSheet(project)).toEqual(emptyCharacterSheet)
    const saved = saveCharacterSheet(project, sheet)
    expect(projectCharacterSheet(saved)).toEqual(sheet)
    expect(saveCharacterSheet(saved, { ...sheet })).toBe(saved)
  })

  it('refuses two characters with the same name, whatever the capitalisation', () => {
    const twins = { ...sheet, characters: [...sheet.characters, { id: 'x', name: 'mo', appearance: 'another fox', voice: '' }] }
    expect(() => saveCharacterSheet(story(), twins)).toThrow(/share a name/)
    expect(characterSheetIssue(twins)).toBe('duplicate')
  })

  it('names the first thing that keeps a draft from being saved', () => {
    expect(characterSheetIssue(sheet)).toBeNull()
    expect(characterSheetIssue({ ...sheet, characters: [{ id: 'a', name: ' ', appearance: 'x', voice: '' }] })).toBe('name')
    expect(characterSheetIssue({ ...sheet, characters: [{ id: 'a', name: 'A', appearance: ' ', voice: '' }] })).toBe('appearance')
    expect(characterSheetIssue({ ...sheet, characters: Array.from({ length: 25 }, (_, index) => ({ id: `c${index}`, name: `N${index}`, appearance: 'x', voice: '' })) })).toBe('limit')
  })

  it('reports a damaged saved sheet instead of silently dropping the cast', () => {
    expect(() => projectCharacterSheet({ ...story(), metadata: { characterSheet: { schemaVersion: 1, characters: 'Mo' } } })).toThrow(/invalid/)
  })
})

describe('the fixed wording', () => {
  it('produces the same text for the same selection, in sheet order, with the style last', () => {
    const fragment = characterPromptFragment(sheet, ['luna', 'mo'])
    expect(fragment).toBe('Mo: a small orange fox with a white tail tip and a green scarf\nLuna: a tall grey owl with round yellow glasses\nStyle: flat 2D drawing, bold outlines, warm colours')
    expect(characterPromptFragment(sheet, ['mo', 'luna'])).toBe(fragment)
    expect(characterPromptFragment(sheet, [])).toBe('')
  })

  it('appends to a prompt without touching what the author wrote and never twice', () => {
    const once = addCharactersToPrompt('Mo sits in the grass at night', sheet, ['mo'])
    expect(once).toBe('Mo sits in the grass at night\nMo: a small orange fox with a white tail tip and a green scarf\nStyle: flat 2D drawing, bold outlines, warm colours')
    expect(addCharactersToPrompt(once, sheet, ['mo'])).toBe(once)
    // A second character joins without repeating the first or the style.
    const both = addCharactersToPrompt(once, sheet, ['mo', 'luna'])
    expect(both).toBe(`${once}\nLuna: a tall grey owl with round yellow glasses`)
    expect(addCharactersToPrompt('', sheet, ['luna'])).toBe('Luna: a tall grey owl with round yellow glasses\nStyle: flat 2D drawing, bold outlines, warm colours')
    expect(addCharactersToPrompt('unchanged', sheet, [])).toBe('unchanged')
  })

  it('reaches the local Director word for word, before the creative brief', () => {
    const brief = localizedDirectorBrief(defaultProjectContentProfile, 'Mo entdeckt den Mond.', characterSheetDirectorGuidance(sheet))
    expect(brief).toContain('- Mo — appearance: a small orange fox with a white tail tip and a green scarf — speaks: curious, short sentences')
    expect(brief).toContain('- Luna — appearance: a tall grey owl with round yellow glasses')
    expect(brief).not.toContain('Luna — appearance: a tall grey owl with round yellow glasses — speaks')
    expect(brief).toContain('Visual style for every scene: flat 2D drawing, bold outlines, warm colours')
    expect(brief).toContain('never rename, redesign or merge them')
    expect(brief.endsWith('Creative brief:\nMo entdeckt den Mond.')).toBe(true)
    expect(characterSheetDirectorGuidance(emptyCharacterSheet)).toEqual([])
  })
})

describe('where the names occur', () => {
  it('lists the cast per scene by literal name', () => {
    const { scenes, unused } = sceneCast(story(), sheet)
    expect(scenes.map(scene => [scene.sceneId, scene.characterIds])).toEqual([['s1', ['mo']], ['s2', ['mo', 'luna']], ['s3', []]])
    expect(unused).toEqual([])
  })

  it('does not find "Mo" inside "Mond" or "Mona"', () => {
    const project: KinaouProject = { ...story(), script: 'Der Mond. Mona lacht.', storyboard: [{ id: 's1', title: 'Mond', description: 'Mona und der Mond.', narration: 'Monde.', durationMs: 1000 }] }
    const { scenes, unused } = sceneCast(project, sheet)
    expect(scenes[0].characterIds).toEqual([])
    expect(unused).toEqual(['mo', 'luna'])
  })

  it('finds a name next to punctuation and in any capitalisation', () => {
    const project: KinaouProject = { ...story(), storyboard: [{ id: 's1', title: 'x', description: '„MO!“, ruft sie. (luna)', durationMs: 1000 }] }
    expect(sceneCast(project, sheet).scenes[0].characterIds).toEqual(['mo', 'luna'])
  })

  it('counts a character named only in the script as used', () => {
    const project: KinaouProject = { ...story(), script: 'Luna erzählt.', storyboard: [{ id: 's1', title: 'x', description: 'Mo.', durationMs: 1000 }] }
    expect(sceneCast(project, sheet).unused).toEqual([])
  })
})

describe('generated pictures against the sheet', () => {
  it('separates pictures made from the current description from pictures made from other words', () => {
    const current = addCharactersToPrompt('Mo at night', sheet, ['mo'])
    const project: KinaouProject = {
      ...story(),
      assets: [
        image('same', current),
        image('other', 'Mo, a red fox with a blue hat, at night'),
        image('none', 'a forest at night'),
        image('both', `${current}\nLuna the owl`),
        assetSchema.parse({ id: 'upload', kind: 'image', uri: 'KINAOU/Assets/u.png', managed: true, metadata: { positivePrompt: current } })
      ]
    }
    expect(imageCharacterUse(project, sheet)).toEqual([
      { assetId: 'same', name: 'Generated image · same', characters: [{ characterId: 'mo', state: 'current' }] },
      { assetId: 'other', name: 'Generated image · other', characters: [{ characterId: 'mo', state: 'different' }] },
      { assetId: 'both', name: 'Generated image · both', characters: [{ characterId: 'mo', state: 'current' }, { characterId: 'luna', state: 'different' }] }
    ])
  })

  it('turns earlier pictures into "different words" once the description is edited', () => {
    const prompt = addCharactersToPrompt('Mo at night', sheet, ['mo'])
    const project: KinaouProject = { ...story(), assets: [image('same', prompt)] }
    const edited = { ...sheet, characters: sheet.characters.map(character => character.id === 'mo' ? { ...character, appearance: 'a small orange fox with a red scarf' } : character) }
    expect(imageCharacterUse(project, edited)[0].characters).toEqual([{ characterId: 'mo', state: 'different' }])
  })
})

describe('character sheet interface', () => {
  it('renders the sheet, its boundary, the cast per scene and the picture comparison in every language', () => {
    const project = saveCharacterSheet({ ...story(), assets: [image('other', 'Mo, a red fox')] }, sheet)
    for (const language of uiLanguages) {
      const html = renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: language, children: createElement(CharacterSheetPanel, { project, history: history(), onProjectChange: () => {} }) }))
      expect(html).toContain(translateUi(language, 'cast.heading'))
      expect(html).toContain(translateUi(language, 'cast.boundary').slice(0, 30))
      expect(html).toContain('Mo, Luna')
      expect(html).toContain(translateUi(language, 'cast.sceneNone'))
      expect(html).toContain(translateUi(language, 'cast.badge.different'))
      expect(html).not.toContain(translateUi(language, 'cast.unused', { names: '' }).slice(0, 12))
    }
  })

  it('offers the insert control only when there is a sheet, and says so otherwise', () => {
    const render = (project: KinaouProject, prompt: string) => renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: 'en', children: createElement(CharacterPromptInsert, { project, prompt, onPrompt: () => {} }) }))
    expect(render(story(), '')).toContain('No character sheet yet.')
    const html = render(saveCharacterSheet(story(), sheet), '')
    expect(html).toContain('Characters from the character sheet')
    expect(html).toContain('Mo')
    expect(html).toContain('Luna')
  })

  it('shows its history entry in the selected language', () => {
    expect(displaySystemHistoryLabel({ label: 'Before changing the character sheet', source: 'system' }, key => translateUi('de', key))).toBe('Vor dem Ändern des Figurenbogens')
  })
})
