import { it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { assetSchema, createProject, parseProject } from '../src/core/project'
import { buildGenerationReferences, parseReferenceProvenance, parseReferenceRoles, referenceAssetAvailable } from '../src/core/generationReferences'
import { parseImageGenerationAvailability } from '../src/core/imageJobs'
import { registerGeneratedVideo } from '../src/core/generatedVideos'
import { VideoReferenceInputs } from '../src/components/VideoReferenceInputs'

const portrait = assetSchema.parse({ id: 'portrait', kind: 'image', uri: 'KINAOU/Assets/portrait.png', managed: true })
const speech = assetSchema.parse({ id: 'speech', kind: 'audio', uri: 'KINAOU/Assets/own.wav', managed: true })
const project = { ...createProject('References'), assets: [portrait, speech] }
const reference = { role: 'speech' as const, assetId: speech.id, sourcePath: speech.uri, authorized: true as const, sha256: 'a'.repeat(64) }

it('requires selection and individual permission, preserves the own recording path', () => {
  expect(() => buildGenerationReferences(project, ['speech'], {}, {})).toThrow(/Select/)
  expect(() => buildGenerationReferences(project, ['speech'], { speech: 'speech' }, {})).toThrow(/permission/)
  expect(buildGenerationReferences(project, ['portrait', 'speech'], { portrait: 'portrait', speech: 'speech' }, { portrait: true, speech: true })).toEqual({ portrait: { assetId: 'portrait', path: portrait.uri, authorized: true }, speech: { assetId: 'speech', path: speech.uri, authorized: true } })
  expect(buildGenerationReferences(project, [], {}, {})).toEqual({})
  expect(referenceAssetAvailable({ ...speech, offline: true }, 'speech')).toBe(false)
  expect(referenceAssetAvailable(portrait, 'speech')).toBe(false)
  expect(referenceAssetAvailable({ ...speech, uri: 'KINAOU/Assets/../private.wav' }, 'speech')).toBe(false)
})

it('rejects malformed or contradictory capability/provenance metadata', () => {
  expect(parseReferenceRoles(undefined)).toEqual([])
  expect(() => parseReferenceRoles(['portrait', 'portrait'])).toThrow()
  expect(() => parseReferenceRoles(['video'])).toThrow()
  expect(parseReferenceProvenance([reference])).toEqual([reference])
  for (const invalid of [{ ...reference, authorized: false }, { ...reference, sha256: 'bad' }, { ...reference, sourcePath: 'KINAOU/Assets/../secret.wav' }]) expect(() => parseReferenceProvenance([invalid])).toThrow()
  expect(() => parseReferenceProvenance([reference, reference])).toThrow()
  expect(() => parseImageGenerationAvailability({ comfyui: { available: true }, templates: [{ path: 'KINAOU/Models/ComfyUI/Workflows/x.json', id: 'x', label: 'x', mediaType: 'image', supportsNegativePrompt: false, supportsWidth: false, supportsHeight: false, referenceRoles: ['speech'] }] })).toThrow(/video/)
})

it('persists source asset, explicit authorization and actual content hash on generated video without changing originals', () => {
  const next = registerGeneratedVideo(project, { id: 'v1', state: 'succeeded', progress: 1, createdAt: 'x', updatedAt: 'x', templatePath: 'KINAOU/Models/ComfyUI/Workflows/x.json', videoPath: 'KINAOU/Assets/GeneratedVideo/v1.mp4', sizeBytes: 123, durationMs: 1000,
    provenance: { kind: 'local-model', adapterId: 'comfyui', templateId: 'x', seed: 1, width: null, height: null, positivePrompt: 'Talk', negativePrompt: '', references: [reference] } })
  expect(parseProject(JSON.parse(JSON.stringify(next))).assets[2].metadata.references).toEqual([reference])
  expect(next.assets.slice(0, 2)).toEqual(project.assets)
  expect(project.assets).toHaveLength(2)
})

it('shows only declared reference controls with honest privacy and capability boundaries', () => {
  const props = { project, roles: ['speech' as const], selected: {}, authorized: {}, disabled: false, onSelect: () => {}, onAuthorize: () => {} }
  const html = renderToStaticMarkup(createElement(VideoReferenceInputs, props))
  expect(html).toContain('your own voice')
  expect(html).toContain('permission to use this voice')
  expect(html).toContain('Copies stay there')
  expect(html).toContain('do not certify animation or lip sync')
  expect(html).not.toContain('Portrait image')
  expect(renderToStaticMarkup(createElement(VideoReferenceInputs, { ...props, roles: [] }))).toBe('')
})
