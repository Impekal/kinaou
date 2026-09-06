import { describe, expect, it } from 'vitest'
import { parseSttJob } from '../src/core/sttJobs'

describe('STT jobs', () => {
  it('parses active and completed managed jobs', () => {
    const base = { id: 'j1', state: 'running', progress: .4, createdAt: '2026-01-01', updatedAt: '2026-01-01' }
    expect(parseSttJob(base).state).toBe('running')
    expect(parseSttJob({ ...base, state: 'succeeded', progress: 1, transcriptPath: 'KINAOU/Projects/Transcripts/j1.json', transcript: { schemaVersion: 1, adapterId: 'whisper.cpp', language: 'de', text: 'Hallo', segments: [] } }).transcript?.text).toBe('Hallo')
  })
  it('rejects completed results outside managed transcript storage', () => {
    expect(() => parseSttJob({ id: 'j1', state: 'succeeded', progress: 1, createdAt: 'x', updatedAt: 'x', transcriptPath: '../x', transcript: { schemaVersion: 1, adapterId: 'whisper.cpp' } })).toThrow(/completed/)
  })
})
