import { describe, expect, it } from 'vitest'
import { createProjectFromInput } from '../src/core/create'
import { registerGeneratedVideo } from '../src/core/generatedVideos'
import type { VideoJobRecord } from '../src/core/videoJobs'

describe('generated video assets', () => {
  const job: VideoJobRecord = {
    id: 'vid-1', state: 'succeeded', progress: 1, createdAt: '2026-09-08T10:00:00.000Z', updatedAt: '2026-09-08T10:05:00.000Z',
    templatePath: 'KINAOU/Models/ComfyUI/Workflows/video.json',
    provenance: { kind: 'local-model', adapterId: 'comfyui', templateId: 'scene-video', mediaType: 'video', seed: 7, width: null, height: null, positivePrompt: 'harbour at dawn', negativePrompt: '' },
    videoPath: 'KINAOU/Assets/GeneratedVideo/vid-1.mp4', sizeBytes: 9000, durationMs: 4000, width: 1280, height: 720
  }

  it('registers successful video output once with duration and durable provenance', () => {
    const project = createProjectFromInput({ title: 'Video', kind: 'idea', content: '' })
    const next = registerGeneratedVideo(project, job)
    expect(next.assets[0]).toMatchObject({
      kind: 'video', uri: job.videoPath, managed: true, offline: false,
      metadata: {
        generated: true, mimeType: 'video/mp4', sizeBytes: 9000, durationMs: 4000, width: 1280, height: 720,
        adapterId: 'comfyui', videoJobId: 'vid-1', templateId: 'scene-video', templatePath: job.templatePath,
        seed: 7, positivePrompt: 'harbour at dawn', negativePrompt: '', generatedAt: '2026-09-08T10:05:00.000Z'
      }
    })
    expect(registerGeneratedVideo(next, job)).toBe(next)
  })

  it('rejects unfinished jobs, missing duration and results outside managed video storage', () => {
    const project = createProjectFromInput({ title: 'Video', kind: 'idea', content: '' })
    expect(() => registerGeneratedVideo(project, { ...job, state: 'running', videoPath: undefined })).toThrow(/completed/i)
    expect(() => registerGeneratedVideo(project, { ...job, durationMs: undefined })).toThrow(/completed/i)
    expect(() => registerGeneratedVideo(project, { ...job, videoPath: 'KINAOU/Renders/escape.mp4' })).toThrow(/completed/i)
  })
})
