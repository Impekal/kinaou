import { describe, expect, it } from 'vitest'
import { createProjectFromInput } from '../src/core/create'
import { registerGeneratedImage } from '../src/core/generatedImages'
import type { ImageJobRecord } from '../src/core/imageJobs'

describe('generated image assets', () => {
  const job: ImageJobRecord = {
    id: 'img-1', state: 'succeeded', progress: 1, createdAt: '2026-09-08T10:00:00.000Z', updatedAt: '2026-09-08T10:01:00.000Z',
    templatePath: 'KINAOU/Models/ComfyUI/Workflows/ui.json',
    provenance: { kind: 'local-model', adapterId: 'comfyui', templateId: 'ui-sdxl', seed: 42, width: 1024, height: 1024, positivePrompt: 'crisp banking dashboard', negativePrompt: 'blur' },
    imagePath: 'KINAOU/Assets/GeneratedImages/img-1.png', sizeBytes: 2048
  }

  it('registers successful ComfyUI output once with durable structured provenance', () => {
    const project = createProjectFromInput({ title: 'Images', kind: 'idea', content: '' })
    const next = registerGeneratedImage(project, job)
    expect(next.assets[0]).toMatchObject({
      kind: 'image', uri: job.imagePath, managed: true, offline: false,
      metadata: {
        generated: true, mimeType: 'image/png', sizeBytes: 2048,
        adapterId: 'comfyui', imageJobId: 'img-1', templateId: 'ui-sdxl', templatePath: job.templatePath,
        seed: 42, width: 1024, height: 1024,
        positivePrompt: 'crisp banking dashboard', negativePrompt: 'blur',
        generatedAt: '2026-09-08T10:01:00.000Z'
      }
    })
    expect(registerGeneratedImage(next, job)).toBe(next)
  })

  it('rejects unfinished jobs and results outside managed generated storage', () => {
    const project = createProjectFromInput({ title: 'Images', kind: 'idea', content: '' })
    expect(() => registerGeneratedImage(project, { ...job, state: 'running', imagePath: undefined, sizeBytes: undefined })).toThrow(/completed/i)
    expect(() => registerGeneratedImage(project, { ...job, imagePath: 'KINAOU/Renders/escape.png' })).toThrow(/completed/i)
    expect(() => registerGeneratedImage(project, { ...job, provenance: { ...job.provenance, positivePrompt: ' ' } })).toThrow(/provenance/i)
  })
})
