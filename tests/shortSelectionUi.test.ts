import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { createProject, parseProject } from '../src/core/project'
import { RenderPanel } from '../src/components/RenderPanel'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import { uiLanguages } from '../src/core/uiLanguage'
import { translateUi } from '../src/core/uiMessages'
import { planShortExportRanges, setProjectShortExportMaximum } from '../src/core/shortExportRanges'
import { saveProjectShortExportRecipe, projectShortExportRecipes, reviewShortExportRecipe } from '../src/core/shortExportRecipes'

function fixture() {
  return parseProject({ ...createProject('Original project'), assets: [{ id: 'a', kind: 'image', uri: 'KINAOU/Assets/a.png', managed: true }],
    storyboard: [{ id: 'one', title: '<Original scene>', durationMs: 1000 }, { id: 'long', title: 'Long scene', durationMs: 2000 }, { id: 'missing', title: 'Missing scene', durationMs: 1000 }],
    tracks: [{ id: 'v', name: 'Original track', type: 'video', clips: [{ id: 'c', assetId: 'a', sceneId: 'one', startMs: 0, durationMs: 1000 }, { id: 'd', assetId: 'a', sceneId: 'long', startMs: 1000, durationMs: 2000 }] }] })
}

it.each(uiLanguages)('renders Short selection and exact skipped limits in %s without changing user metadata', language => {
  const limited = setProjectShortExportMaximum(fixture(), 1501)
  const candidates = planShortExportRanges(limited, 1501).candidates
  const project = saveProjectShortExportRecipe(limited, { name: '<Original recipe>', candidateIds: ['one'], formats: ['landscape', 'vertical'] }, candidates)
  const before = JSON.stringify(project)
  const onProjectChange = vi.fn()
  const html = renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: language, children: createElement(RenderPanel, { project, onProjectChange, workerUrl: 'http://127.0.0.1:43117', workerToken: '', workerConnected: false, workerCapabilities: [] }) }))
  for (const key of ['shortSelect.heading', 'shortSelect.custom', 'shortSelect.apply', 'shortSelect.include', 'shortSelect.formats', 'shortRecipe.heading', 'shortRecipe.save', 'shortRecipe.review', 'shortRecipe.forget', 'shortSelect.skip.unanchored'] as const) expect(html).toContain(translateUi(language, key))
  expect(html).toContain(translateUi(language, 'shortSelect.skip.overLimit', { seconds: (1.501).toLocaleString(language) }))
  expect(html).toContain('&lt;Original scene&gt;'); expect(html).toContain('&lt;Original recipe&gt;')
  expect(html).toContain(translateUi(language, 'export.landscape'))
  expect(html).toContain(translateUi(language, 'shortSelect.export', { count: 0 }))
  expect(onProjectChange).not.toHaveBeenCalled()
  expect(JSON.stringify(project)).toBe(before)
})

it('retains exact fractional skip limits and never truncates the scene', () => {
  const project = fixture()
  const before = JSON.stringify(project)
  const result = planShortExportRanges(project, 1501)
  expect(result.skipped).toContainEqual({ sceneId: 'long', title: 'Long scene', code: 'overLimit', limitMs: 1501, reason: 'Scene is longer than the 1.501 s candidate limit.' })
  expect(result.candidates.map(item => item.outMs)).toEqual([1000])
  expect(JSON.stringify(project)).toBe(before)
})

it('rechecks recipes against regrouped candidates without creating outputs or rewriting originals', () => {
  const original = fixture()
  const candidates = planShortExportRanges(original).candidates
  const saved = saveProjectShortExportRecipe(original, { name: 'Original recipe', candidateIds: [candidates[0].id], formats: ['vertical', 'square'] }, candidates)
  const changed = setProjectShortExportMaximum(saved, 1501)
  const recipe = projectShortExportRecipes(changed)[0]
  expect(reviewShortExportRecipe(recipe, planShortExportRanges(changed, 1501).candidates)).toEqual({ candidateIds: [], unavailableCandidateIds: ['one--long'], formats: ['vertical', 'square'] })
  expect(changed.tracks).toEqual(original.tracks)
  expect(changed.assets).toEqual(original.assets)
  expect(projectShortExportRecipes(changed)).toEqual(projectShortExportRecipes(saved))
  expect(reviewShortExportRecipe(recipe, candidates).candidateIds).toEqual(['one--long'])
})
