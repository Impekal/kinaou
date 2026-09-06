import { describe, expect, it } from 'vitest'
import { parseTtsJob } from '../src/core/ttsJobs'

describe('TTS jobs', () => {
  const base = { id: 'j1', state: 'running', progress: .1, createdAt: 'x', updatedAt: 'x', voicePath: 'KINAOU/Models/de.onnx' }
  it('parses active and completed managed jobs', () => {
    expect(parseTtsJob(base).state).toBe('running')
    expect(parseTtsJob({ ...base, state: 'succeeded', progress: 1, audioPath: 'KINAOU/Assets/GeneratedVoice/j1.wav', durationMs: 1200, sizeBytes: 42 }).durationMs).toBe(1200)
  })
  it('rejects completed output outside generated voice storage', () => {
    expect(() => parseTtsJob({ ...base, state: 'succeeded', progress: 1, audioPath: '../voice.wav', durationMs: 1, sizeBytes: 1 })).toThrow(/completed/)
  })
})
