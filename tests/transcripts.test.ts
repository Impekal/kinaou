import { describe, expect, it } from 'vitest'
import { createProject } from '../src/core/project'
import { registerTranscriptAsset } from '../src/core/transcripts'

describe('transcript assets', () => {
  it('registers a completed local transcript once with attribution', () => {
    const project = createProject('Interview')
    project.assets.push({ id: 'audio', kind: 'audio', uri: 'KINAOU/Assets/interview.wav', managed: true, offline: false, metadata: { name: 'Interview' } })
    const job = { id: 'j1', state: 'succeeded' as const, progress: 1, createdAt: 'x', updatedAt: 'x', transcriptPath: 'KINAOU/Projects/Transcripts/j1.json', transcript: { schemaVersion: 1 as const, adapterId: 'whisper.cpp' as const, language: 'de', text: 'Hallo', segments: [{ startMs: 0, endMs: 1000, text: 'Hallo' }] } }
    const next = registerTranscriptAsset(project, 'audio', job)
    expect(next.assets[1].uri).toBe(job.transcriptPath)
    expect(next.assets[1].metadata.sourceAssetId).toBe('audio')
    expect(registerTranscriptAsset(next, 'audio', job)).toBe(next)
  })
  it('rejects incomplete jobs and unmanaged sources', () => {
    const project = createProject('Interview')
    project.assets.push({ id: 'audio', kind: 'audio', uri: '/tmp/a.wav', managed: false, offline: false, metadata: {} })
    expect(() => registerTranscriptAsset(project, 'audio', { id: 'j', state: 'running', progress: .5, createdAt: 'x', updatedAt: 'x' })).toThrow(/managed/)
  })
})
