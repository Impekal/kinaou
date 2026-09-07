import { describe, expect, it } from 'vitest'
import { parseImageGenerationAvailability, parseImageJob } from '../src/core/imageJobs'

describe('image jobs', () => {
  const provenance = { kind: 'local-model', adapterId: 'comfyui', templateId: 'ui-sdxl', seed: 42, width: 1024, height: 1024, positivePrompt: 'banking dashboard', negativePrompt: '' }
  const base = { id: 'j1', state: 'running', progress: 0.5, createdAt: 'x', updatedAt: 'x', templatePath: 'KINAOU/Models/ComfyUI/Workflows/ui.json', provenance }

  it('parses active and completed managed jobs with provenance', () => {
    expect(parseImageJob(base).state).toBe('running')
    const done = parseImageJob({ ...base, state: 'succeeded', progress: 1, imagePath: 'KINAOU/Assets/GeneratedImages/j1.png', sizeBytes: 1234 })
    expect(done.imagePath).toBe('KINAOU/Assets/GeneratedImages/j1.png')
    expect(done.provenance.seed).toBe(42)
  })

  it('rejects completed output outside managed generated image storage', () => {
    expect(() => parseImageJob({ ...base, state: 'succeeded', progress: 1, imagePath: 'KINAOU/Assets/other.png', sizeBytes: 1 })).toThrow(/completed/)
    expect(() => parseImageJob({ ...base, state: 'succeeded', progress: 1 })).toThrow(/completed/)
  })

  it('rejects jobs without trusted provenance or with foreign template paths', () => {
    expect(() => parseImageJob({ ...base, provenance: undefined })).toThrow(/provenance/)
    expect(() => parseImageJob({ ...base, provenance: { ...provenance, adapterId: 'cloud' } })).toThrow(/provenance/)
    expect(() => parseImageJob({ ...base, provenance: { ...provenance, seed: -1 } })).toThrow(/seed/)
    expect(() => parseImageJob({ ...base, templatePath: '../evil.json' })).toThrow(/template path/)
  })

  it('parses honest availability with managed template descriptors', () => {
    const availability = parseImageGenerationAvailability({
      comfyui: { available: true, version: '0.3.40' },
      templates: [{ path: 'KINAOU/Models/ComfyUI/Workflows/ui.json', id: 'ui-sdxl', label: 'UI SDXL', mediaType: 'image', supportsNegativePrompt: true, supportsWidth: true, supportsHeight: true }]
    })
    expect(availability.comfyui.available).toBe(true)
    expect(availability.templates[0].id).toBe('ui-sdxl')
    expect(parseImageGenerationAvailability({ comfyui: { available: false }, templates: [] }).templates).toHaveLength(0)
    expect(() => parseImageGenerationAvailability({ comfyui: { available: true }, templates: [{ path: '/etc/x.json', id: 'x', label: 'x', mediaType: 'image', supportsNegativePrompt: false, supportsWidth: false, supportsHeight: false }] })).toThrow(/template path/)
    expect(() => parseImageGenerationAvailability({ comfyui: { available: true }, templates: [{ path: 'KINAOU/Models/ComfyUI/Workflows/x.json', id: 'x', label: 'x', mediaType: 'audio', supportsNegativePrompt: false, supportsWidth: false, supportsHeight: false }] })).toThrow(/media type/)
  })
})
