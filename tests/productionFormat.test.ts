import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ProductionFormatPanel } from '../src/components/ProductionFormatPanel'
import { ProductionFormatStatus } from '../src/components/ProductionFormatStatus'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import { defaultProjectContentProfile, localizedDirectorBrief } from '../src/core/contentProfile'
import {
  defaultProductionFormatDeclaration, productionFormatDirectorGuidance, productionFormatSignature, productionReviewStatuses,
  projectProductionFormat, projectProductionFormatReviews, recordProductionFormatReview, requiredProductionReviews, setProjectProductionFormat, summarizeProductionReviews,
  type ProductionFormatDeclaration
} from '../src/core/productionFormat'
import { createProject, type KinaouProject } from '../src/core/project'
import { uiLanguages } from '../src/core/uiLanguage'
import { displaySystemHistoryLabel } from '../src/core/uiSystemLabels'
import { translateUi } from '../src/core/uiMessages'
import { PersistentVersionHistory } from '../src/core/versioning'

function history(): PersistentVersionHistory {
  const data = new Map<string, string>()
  return new PersistentVersionHistory({ getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value) }, removeItem: key => { data.delete(key) } })
}

const children: ProductionFormatDeclaration = { format: 'children', ageBand: '6to9', purpose: 'Die Kinder können erklären, warum der Mond seine Form ändert.' }

function scripted(): KinaouProject {
  return {
    ...createProject('Mond', new Date('2026-11-22T08:00:00.000Z')),
    script: 'Der Mond leuchtet nicht selbst.',
    storyboard: [{ id: 's1', title: 'Der Mond', description: 'Ein gezeichneter Mond am Nachthimmel.', narration: 'Der Mond leuchtet nicht selbst.', durationMs: 4000 }]
  }
}

describe('production format declaration', () => {
  it('starts as a general production that calls for no check and adds nothing to the Director brief', () => {
    const project = scripted()
    expect(projectProductionFormat(project)).toEqual(defaultProductionFormatDeclaration)
    expect(requiredProductionReviews(defaultProductionFormatDeclaration)).toEqual([])
    expect(productionFormatDirectorGuidance(defaultProductionFormatDeclaration)).toEqual([])
    expect(localizedDirectorBrief(defaultProjectContentProfile, 'Brief.', [])).not.toContain('production constraints')
  })

  it('refuses a children\'s format without a declared age and any specific format without a purpose', () => {
    const project = scripted()
    expect(() => setProjectProductionFormat(project, { format: 'children', ageBand: 'unspecified', purpose: 'x' })).toThrow(/age band/)
    expect(() => setProjectProductionFormat(project, { format: 'children', ageBand: 'adults', purpose: 'x' })).toThrow(/age band/)
    expect(() => setProjectProductionFormat(project, { format: 'learning', ageBand: 'adults', purpose: '  ' })).toThrow(/take away/)
    expect(setProjectProductionFormat(project, { format: 'children', ageBand: '14to17', purpose: 'x' })).not.toBe(project)
  })

  it('asks for exactly the checks each declaration needs', () => {
    expect(requiredProductionReviews(children)).toEqual(['age-suitability', 'educational-accuracy'])
    expect(requiredProductionReviews({ format: 'learning', ageBand: 'adults', purpose: 'x' })).toEqual(['educational-accuracy'])
    expect(requiredProductionReviews({ format: 'cartoon', ageBand: 'all', purpose: 'x' })).toEqual(['character-consistency'])
    expect(requiredProductionReviews({ format: 'sports', ageBand: 'adults', purpose: 'x' })).toEqual(['sports-source-rights'])
    // A young declared audience needs the age check whatever the format is called.
    expect(requiredProductionReviews({ format: 'cartoon', ageBand: 'under6', purpose: 'x' })).toEqual(['age-suitability', 'character-consistency'])
    expect(requiredProductionReviews({ format: 'sports', ageBand: '10to13', purpose: 'x' })).toEqual(['age-suitability', 'sports-source-rights'])
  })

  it('leaves the project untouched when the same declaration is saved again', () => {
    const saved = setProjectProductionFormat(scripted(), children)
    expect(setProjectProductionFormat(saved, { ...children })).toBe(saved)
  })

  it('reports a damaged saved record instead of silently treating it as general', () => {
    const project = { ...scripted(), metadata: { productionFormat: { schemaVersion: 1, declaration: { format: 'children' } } } }
    expect(() => projectProductionFormat(project)).toThrow(/invalid/)
  })
})

describe('production format checks', () => {
  it('holds a confirmation only for the text it was made on', async () => {
    const saved = setProjectProductionFormat(scripted(), children)
    const reviewed = await recordProductionFormatReview(saved, 'age-suitability', { reviewer: 'Amina', note: 'Jeden Satz laut gelesen.' }, new Date('2026-11-22T09:00:00.000Z'))

    const current = productionReviewStatuses(reviewed, await productionFormatSignature(reviewed))
    expect(current.map(status => [status.item, status.state])).toEqual([['age-suitability', 'current'], ['educational-accuracy', 'missing']])
    expect(current[0].review).toMatchObject({ reviewer: 'Amina', reviewedAt: '2026-11-22T09:00:00.000Z', scope: 'production-format-script-v1' })

    // One changed narration sentence is enough: nobody has read the new one.
    const edited: KinaouProject = { ...reviewed, storyboard: reviewed.storyboard.map(scene => ({ ...scene, narration: 'Der Mond ist aus Käse.' })) }
    expect(productionReviewStatuses(edited, await productionFormatSignature(edited))[0].state).toBe('stale')

    // Re-confirming replaces the record rather than keeping two for one check.
    const again = await recordProductionFormatReview(edited, 'age-suitability', { reviewer: 'Amina', note: 'Neu gelesen.' })
    expect(projectProductionFormatReviews(again)).toHaveLength(1)
    expect(productionReviewStatuses(again, await productionFormatSignature(again))[0].state).toBe('current')
  })

  it('does not go stale over things the check never covered', async () => {
    const saved = setProjectProductionFormat(scripted(), children)
    const reviewed = await recordProductionFormatReview(saved, 'educational-accuracy', { reviewer: 'Amina', note: 'Gegen das Schulbuch geprüft.' })
    const signature = await productionFormatSignature(reviewed)
    const retimed: KinaouProject = { ...reviewed, title: 'Anderer Titel', storyboard: reviewed.storyboard.map(scene => ({ ...scene, durationMs: 9000, assetId: 'a1' })) }
    expect(await productionFormatSignature(retimed)).toBe(signature)
  })

  it('discards every confirmation when the declaration itself changes', async () => {
    const saved = setProjectProductionFormat(scripted(), children)
    const reviewed = await recordProductionFormatReview(saved, 'age-suitability', { reviewer: 'Amina', note: 'Gelesen.' })
    const younger = setProjectProductionFormat(reviewed, { ...children, ageBand: 'under6' })
    expect(projectProductionFormatReviews(younger)).toEqual([])
    expect(productionReviewStatuses(younger, await productionFormatSignature(younger)).every(status => status.state === 'missing')).toBe(true)
  })

  it('refuses a check that does not apply, an unsaved format, an empty script and an empty note', async () => {
    const saved = setProjectProductionFormat(scripted(), children)
    await expect(recordProductionFormatReview(saved, 'sports-source-rights', { reviewer: 'A', note: 'x' })).rejects.toThrow(/does not apply/)
    await expect(recordProductionFormatReview(scripted(), 'age-suitability', { reviewer: 'A', note: 'x' })).rejects.toThrow(/Save the production format/)
    await expect(recordProductionFormatReview({ ...saved, script: ' ', storyboard: [] }, 'age-suitability', { reviewer: 'A', note: 'x' })).rejects.toThrow(/no script or storyboard/)
    await expect(recordProductionFormatReview(saved, 'age-suitability', { reviewer: 'A', note: '   ' })).rejects.toThrow()
  })
})

describe('production format in the Director brief', () => {
  it('passes the declaration and its format rules to the local Director', () => {
    const brief = localizedDirectorBrief(defaultProjectContentProfile, 'Erkläre die Mondphasen.', productionFormatDirectorGuidance(children))
    expect(brief).toContain('- Production format: children')
    expect(brief).toContain('- Declared viewer age: 6 to 9 years')
    expect(brief).toContain(children.purpose)
    expect(brief).toContain('No pressure to buy')
    // The creative brief still comes last and unchanged.
    expect(brief.endsWith('Creative brief:\nErkläre die Mondphasen.')).toBe(true)
  })

  it('applies the children\'s rules to any format declared for a young audience', () => {
    const lines = productionFormatDirectorGuidance({ format: 'sports', ageBand: '10to13', purpose: 'Abseits verstehen.' }).join('\n')
    expect(lines).toContain('never describe broadcast match footage')
    expect(lines).toContain('Do not ask children for personal information.')
    const adults = productionFormatDirectorGuidance({ format: 'sports', ageBand: 'adults', purpose: 'Abseits verstehen.' }).join('\n')
    expect(adults).not.toContain('personal information')
  })
})

describe('production format panel', () => {
  it('renders the declaration, the honest boundary and the due checks in every interface language', () => {
    const project = setProjectProductionFormat(scripted(), children)
    for (const language of uiLanguages) {
      const html = renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: language, children: createElement(ProductionFormatPanel, { project, history: history(), onProjectChange: () => {} }) }))
      expect(html).toContain(translateUi(language, 'format.heading'))
      expect(html).toContain(translateUi(language, 'format.boundary').slice(0, 30))
      expect(html).toContain(translateUi(language, 'format.item.age-suitability'))
      expect(html).toContain(translateUi(language, 'format.item.educational-accuracy'))
      expect(html).not.toContain(translateUi(language, 'format.item.sports-source-rights'))
      expect(html).toContain(translateUi(language, 'format.state.missing'))
    }
  })

  it('says plainly that a general production has no special check', () => {
    const project = scripted()
    const html = renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: 'de', children: createElement(ProductionFormatPanel, { project, history: history(), onProjectChange: () => {} }) }))
    expect(html).toContain('Für dieses Format ist keine besondere Prüfung vorgesehen.')
  })

  it('shows its history entries in the selected language', () => {
    const t = (key: Parameters<typeof translateUi>[1]) => translateUi('fr', key)
    expect(displaySystemHistoryLabel({ label: 'Before changing the production format', source: 'system' }, t)).toBe('Avant la modification du format de production')
    expect(displaySystemHistoryLabel({ label: 'Before recording a format check', source: 'system' }, t)).toBe('Avant l’enregistrement d’une vérification de format')
  })
})

describe('production format status at publication', () => {
  const render = (project: KinaouProject, language: 'de' | 'en' | 'fr' = 'en') => renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: language, children: createElement(ProductionFormatStatus, { project }) }))

  it('renders nothing for a production that calls for no check', () => {
    expect(render(scripted())).toBe('')
    expect(render(setProjectProductionFormat(scripted(), { format: 'general', ageBand: 'adults', purpose: '' }))).toBe('')
  })

  it('never shows a check as confirmed before the hash for this exact project is known', async () => {
    const saved = setProjectProductionFormat(scripted(), children)
    const reviewed = await recordProductionFormatReview(saved, 'age-suitability', { reviewer: 'Amina', note: 'Gelesen.' })
    // Static rendering happens before the asynchronous hash arrives: the stored record alone must not count.
    for (const language of uiLanguages) {
      const html = render(reviewed, language)
      expect(html).toContain(translateUi(language, 'format.status.heading'))
      expect(html).toContain(translateUi(language, 'format.status.outstanding', { open: 2, due: 2, missing: 2, stale: 0 }))
      expect(html).toContain(translateUi(language, 'format.status.where').slice(0, 25))
      expect(html).toContain(translateUi(language, 'format.status.selfReport').slice(0, 25))
      expect(html).not.toContain(translateUi(language, 'format.status.allCurrent', { due: 2 }))
    }
  })

  it('counts current, open and outdated checks', async () => {
    const saved = setProjectProductionFormat(scripted(), children)
    const one = await recordProductionFormatReview(saved, 'age-suitability', { reviewer: 'A', note: 'x' })
    const both = await recordProductionFormatReview(one, 'educational-accuracy', { reviewer: 'A', note: 'x' })
    expect(summarizeProductionReviews(productionReviewStatuses(one, await productionFormatSignature(one)))).toEqual({ due: 2, current: 1, missing: 1, stale: 0 })
    expect(summarizeProductionReviews(productionReviewStatuses(both, await productionFormatSignature(both)))).toEqual({ due: 2, current: 2, missing: 0, stale: 0 })
    const edited = { ...both, script: 'Anderer Text.' }
    expect(summarizeProductionReviews(productionReviewStatuses(edited, await productionFormatSignature(edited)))).toEqual({ due: 2, current: 0, missing: 0, stale: 2 })
  })

  it('stays out of the way when the saved record is damaged, leaving the error to the editing panel', () => {
    expect(render({ ...scripted(), metadata: { productionFormat: { schemaVersion: 9 } } })).toBe('')
  })
})
