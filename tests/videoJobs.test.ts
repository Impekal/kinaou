import { describe, expect, it } from 'vitest'
import { parseVideoJob } from '../src/core/videoJobs'

describe('video jobs', () => {
  const provenance = { kind: 'local-model', adapterId: 'comfyui', templateId: 'scene-video', mediaType: 'video', seed: 42, width: null, height: null, positivePrompt: 'harbour at dawn', negativePrompt: '' }
  const base = { id: 'v1', state: 'running', progress: 0.5, createdAt: 'x', updatedAt: 'x', templatePath: 'KINAOU/Models/ComfyUI/Workflows/video.json', provenance }

  it('parses active and completed managed video jobs with duration', () => {
    expect(parseVideoJob(base).state).toBe('running')
    const done = parseVideoJob({ ...base, state: 'succeeded', progress: 1, videoPath: 'KINAOU/Assets/GeneratedVideo/v1.mp4', sizeBytes: 4096, durationMs: 3000, width: 1280, height: 720 })
    expect(done.videoPath).toBe('KINAOU/Assets/GeneratedVideo/v1.mp4')
    expect(done.durationMs).toBe(3000)
  })

  it('rejects completed output without duration or outside managed video storage', () => {
    expect(() => parseVideoJob({ ...base, state: 'succeeded', progress: 1, videoPath: 'KINAOU/Assets/GeneratedVideo/v1.mp4', sizeBytes: 4096 })).toThrow(/completed/)
    expect(() => parseVideoJob({ ...base, state: 'succeeded', progress: 1, videoPath: 'KINAOU/Assets/GeneratedImages/v1.mp4', sizeBytes: 4096, durationMs: 3000 })).toThrow(/completed/)
  })

  it('rejects image provenance on a video job', () => {
    expect(() => parseVideoJob({ ...base, provenance: { ...provenance, mediaType: 'image' } })).toThrow(/media type/)
  })
})
