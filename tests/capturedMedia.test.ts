import { describe, expect, it } from 'vitest'
import { createProjectFromInput } from '../src/core/create'
import { registerCapturedMedia } from '../src/core/capturedMedia'
import type { CaptureJobRecord } from '../src/core/captureJobs'

describe('captured media assets', () => {
  const provenance = { kind: 'real-capture' as const, adapterId: 'macos-screencapture' as const, displayId: 1, delaySeconds: 3, region: null, interactive: false, appName: null, requestedDurationMs: null }
  const screenshot: CaptureJobRecord = { id: 'cap-1', kind: 'screenshot', state: 'succeeded', progress: 1, createdAt: '2026-09-08T10:00:00.000Z', updatedAt: '2026-09-08T10:00:05.000Z', provenance, capturePath: 'KINAOU/Assets/Captures/cap-1.png', sizeBytes: 2048, width: 2560, height: 1600 }
  const recording: CaptureJobRecord = { id: 'cap-2', kind: 'recording', state: 'succeeded', progress: 1, createdAt: 'x', updatedAt: '2026-09-08T10:02:00.000Z', provenance: { ...provenance, delaySeconds: 0, requestedDurationMs: 60000 }, capturePath: 'KINAOU/Assets/Captures/cap-2.mov', sizeBytes: 9000, durationMs: 42000 }

  it('registers screenshots and recordings once with real-capture provenance', () => {
    const project = createProjectFromInput({ title: 'Capture', kind: 'idea', content: '' })
    const withShot = registerCapturedMedia(project, screenshot)
    expect(withShot.assets[0]).toMatchObject({ kind: 'image', uri: screenshot.capturePath, managed: true, metadata: { captured: true, captureMethod: 'macos-screencapture', captureJobId: 'cap-1', mimeType: 'image/png', displayId: 1, capturedAt: '2026-09-08T10:00:05.000Z', width: 2560 } })
    expect(withShot.assets[0].metadata).not.toHaveProperty('generated')
    const withBoth = registerCapturedMedia(withShot, recording)
    expect(withBoth.assets[1]).toMatchObject({ kind: 'video', uri: recording.capturePath, metadata: { mimeType: 'video/quicktime', durationMs: 42000, captured: true } })
    expect(registerCapturedMedia(withBoth, recording)).toBe(withBoth)
  })

  it('rejects unfinished captures, missing recording duration and foreign paths', () => {
    const project = createProjectFromInput({ title: 'Capture', kind: 'idea', content: '' })
    expect(() => registerCapturedMedia(project, { ...screenshot, state: 'running', capturePath: undefined })).toThrow(/completed/i)
    expect(() => registerCapturedMedia(project, { ...recording, durationMs: undefined })).toThrow(/completed/i)
    expect(() => registerCapturedMedia(project, { ...screenshot, capturePath: 'KINAOU/Assets/GeneratedImages/cap-1.png' })).toThrow(/completed/i)
    expect(() => registerCapturedMedia(project, { ...screenshot, provenance: { ...provenance, kind: 'local-model' } as never })).toThrow(/provenance/)
  })
})
