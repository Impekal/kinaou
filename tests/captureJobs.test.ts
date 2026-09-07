import { describe, expect, it } from 'vitest'
import { parseCaptureJob } from '../src/core/captureJobs'

describe('capture jobs', () => {
  const provenance = { kind: 'real-capture', adapterId: 'macos-screencapture', displayId: 1, delaySeconds: 0, region: null, requestedDurationMs: null }
  const base = { id: 'cap-1', kind: 'screenshot', state: 'running', progress: 0.5, createdAt: 'x', updatedAt: 'x', provenance }

  it('parses active and completed capture jobs with real-capture provenance', () => {
    expect(parseCaptureJob(base).state).toBe('running')
    const shot = parseCaptureJob({ ...base, state: 'succeeded', progress: 1, capturePath: 'KINAOU/Assets/Captures/cap-1.png', sizeBytes: 2048 })
    expect(shot.capturePath).toBe('KINAOU/Assets/Captures/cap-1.png')
    const recording = parseCaptureJob({ ...base, kind: 'recording', state: 'succeeded', progress: 1, provenance: { ...provenance, requestedDurationMs: 30000 }, capturePath: 'KINAOU/Assets/Captures/cap-1.mov', sizeBytes: 9000, durationMs: 12000, width: 2560, height: 1600 })
    expect(recording.durationMs).toBe(12000)
  })

  it('rejects completed recordings without duration and results outside managed capture storage', () => {
    expect(() => parseCaptureJob({ ...base, kind: 'recording', state: 'succeeded', progress: 1, capturePath: 'KINAOU/Assets/Captures/cap-1.mov', sizeBytes: 9000 })).toThrow(/completed/)
    expect(() => parseCaptureJob({ ...base, state: 'succeeded', progress: 1, capturePath: 'KINAOU/Renders/escape.png', sizeBytes: 1 })).toThrow(/completed/)
  })

  it('rejects generated or foreign provenance on capture jobs', () => {
    expect(() => parseCaptureJob({ ...base, provenance: { ...provenance, kind: 'local-model' } })).toThrow(/provenance/)
    expect(() => parseCaptureJob({ ...base, provenance: { ...provenance, adapterId: 'comfyui' } })).toThrow(/provenance/)
    expect(() => parseCaptureJob({ ...base, provenance: undefined })).toThrow(/provenance/)
  })
})
