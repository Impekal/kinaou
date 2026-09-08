import { describe, expect, it } from 'vitest'
import { createProjectFromInput } from '../src/core/create'
import { parseWebCaptureBrowsers, parseWebCaptureJob } from '../src/core/webCaptureJobs'
import { registerWebCapture } from '../src/core/webCaptures'
import type { WebCaptureJobRecord } from '../src/core/webCaptureJobs'

describe('web capture jobs and assets', () => {
  const provenance = { kind: 'real-capture' as const, adapterId: 'headless-browser' as const, browserId: 'firefox', engine: 'gecko' as const, browserVersion: 'Mozilla Firefox 130.0', url: 'https://example.org/docs', width: 1280, height: 800 }
  const job: WebCaptureJobRecord = { id: 'web-1', state: 'succeeded', progress: 1, createdAt: 'x', updatedAt: '2026-09-08T11:00:00.000Z', provenance, imagePath: 'KINAOU/Assets/WebCaptures/web-1.png', sizeBytes: 12563 }

  it('parses browser lists and completed jobs', () => {
    expect(parseWebCaptureBrowsers([{ id: 'chrome', engine: 'chromium', label: 'Google Chrome', version: 'Chrome 129' }])).toHaveLength(1)
    expect(() => parseWebCaptureBrowsers([{ id: 'x', engine: 'webkit', label: 'Safari' }])).toThrow(/browser entry/)
    expect(parseWebCaptureJob(job).imagePath).toBe('KINAOU/Assets/WebCaptures/web-1.png')
    expect(() => parseWebCaptureJob({ ...job, imagePath: 'KINAOU/Assets/Captures/web-1.png' })).toThrow(/completed/)
    expect(() => parseWebCaptureJob({ ...job, provenance: { ...provenance, url: 'file:///etc/passwd' } })).toThrow(/URL/)
  })

  it('registers a web capture once with URL/browser provenance and never a generated flag', () => {
    const project = createProjectFromInput({ title: 'Web', kind: 'idea', content: '' })
    const next = registerWebCapture(project, job)
    expect(next.assets[0]).toMatchObject({
      kind: 'image', uri: job.imagePath, managed: true,
      metadata: { name: 'Web capture · example.org/docs', mimeType: 'image/png', captured: true, captureMethod: 'headless-browser', webCaptureJobId: 'web-1', url: 'https://example.org/docs', browserId: 'firefox', browserVersion: 'Mozilla Firefox 130.0', width: 1280, height: 800, capturedAt: '2026-09-08T11:00:00.000Z' }
    })
    expect(next.assets[0].metadata).not.toHaveProperty('generated')
    expect(registerWebCapture(next, job)).toBe(next)
    expect(() => registerWebCapture(project, { ...job, state: 'running', imagePath: undefined })).toThrow(/completed/i)
  })
})
