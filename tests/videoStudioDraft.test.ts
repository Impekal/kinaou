import { expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createProject, parseProject } from '../src/core/project'
import { reviewVideoDraft } from '../src/core/videoStudioDraft'
import { VideoReferenceInputs } from '../src/components/VideoReferenceInputs'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import { uiLanguages } from '../src/core/uiLanguage'
import { translateUi } from '../src/core/uiMessages'
const template = { path: 'KINAOU/Models/ComfyUI/Workflows/test.json', id: 'test', label: 'Original', mediaType: 'video' as const, supportsNegativePrompt: true, supportsWidth: true, supportsHeight: true, referenceRoles: ['speech' as const] }
const draft = { positivePrompt: 'Original motion', negativePrompt: 'blur', seed: '42', width: '64', height: '64' }
const project = parseProject({ ...createProject('Original'), assets: [{ id: 'voice', kind: 'audio', uri: 'KINAOU/Assets/own.wav', managed: true, metadata: { name: 'Original <voice>', sizeBytes: 100 } }] })
it.each([
  ['blank seed', { ...draft, seed: '' }, 'seed'],
  ['fractional seed', { ...draft, seed: '1.5' }, 'seed'],
  ['bad dimension', { ...draft, width: '65' }, 'dimensions'],
  ['missing prompt', { ...draft, positivePrompt: ' ' }, 'prompt'],
  ['long negative', { ...draft, negativePrompt: 'x'.repeat(20001) }, 'negative'],
] as const)('blocks %s before dispatch', (_label, value, issue) => {
  expect(reviewVideoDraft(template, value, project, { speech: 'voice' }, { speech: true }).issue).toBe(issue)
})
it('requires a video template and never silently discards unsupported negative prompts', () => {
  expect(reviewVideoDraft(null, draft, project, {}, {}).issue).toBe('template')
  expect(reviewVideoDraft({ ...template, mediaType: 'image' }, draft, project, {}, {}).issue).toBe('template')
  expect(reviewVideoDraft({ ...template, supportsNegativePrompt: false }, draft, project, {}, {}).issue).toBe('unsupportedNegative')
})
it('requires an online selected reference and independent explicit permission', () => {
  expect(reviewVideoDraft(template, draft, project, {}, {}).issue).toBe('referenceMissing')
  expect(reviewVideoDraft(template, draft, project, { speech: 'voice' }, {}).issue).toBe('referencePermission')
  const offline = { ...project, assets: project.assets.map(asset => ({ ...asset, offline: true })) }
  expect(reviewVideoDraft(template, draft, offline, { speech: 'voice' }, { speech: true }).issue).toBe('referenceMissing')
})
it('blocks oversized references before submission', () => {
  const large = { ...project, assets: project.assets.map(asset => ({ ...asset, metadata: { sizeBytes: 32 * 1024 * 1024 + 1 } })) }
  expect(reviewVideoDraft(template, draft, large, { speech: 'voice' }, { speech: true }).issue).toBe('referenceSize')
})
it('materializes exact authorized sources without changing drafts or original project', () => {
  const before = JSON.stringify(project)
  expect(reviewVideoDraft(template, draft, project, { speech: 'voice' }, { speech: true }).parameters).toEqual({ templatePath: template.path, positivePrompt: draft.positivePrompt, negativePrompt: draft.negativePrompt, seed: 42, width: 64, height: 64, references: { speech: { assetId: 'voice', path: 'KINAOU/Assets/own.wav', authorized: true } } })
  expect(JSON.stringify(project)).toBe(before); expect(draft.seed).toBe('42')
})
it('does not send stale references to a text-only template', () => {
  expect(reviewVideoDraft({ ...template, referenceRoles: [] }, draft, project, { speech: 'voice' }, { speech: true }).parameters?.references).toBeUndefined()
})
it.each(uiLanguages)('renders references and permissions in %s, retaining original names and checked state', language => {
  const html = renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: language, children: createElement(VideoReferenceInputs, { project, roles: ['speech'], selected: { speech: 'voice' }, authorized: { speech: true }, disabled: true, onSelect: vi.fn(), onAuthorize: vi.fn() }) }))
  for (const key of ['video.speech', 'video.referenceHelp', 'video.referenceLimit', 'video.speechPermission'] as const) expect(html).toContain(translateUi(language, key).replaceAll("'", '&#x27;'))
  expect(html).toContain('Original &lt;voice&gt;'); expect(html).toContain('checked=""'); expect(html).toContain('disabled=""')
})
