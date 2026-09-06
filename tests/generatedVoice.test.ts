import { describe, expect, it } from 'vitest'
import { createProjectFromInput } from '../src/core/create'
import { registerGeneratedVoice } from '../src/core/generatedVoice'

describe('generated voice assets', () => {
  const job = { id: 'tts-1', state: 'succeeded' as const, progress: 1, createdAt: 'x', updatedAt: 'x', voicePath: 'KINAOU/Models/de.onnx', audioPath: 'KINAOU/Assets/GeneratedVoice/tts-1.wav', durationMs: 2400, sizeBytes: 48000 }
  it('registers successful Piper output once with full attribution', () => {
    const project = createProjectFromInput({ title: 'Voice', kind: 'idea', content: '' })
    const next = registerGeneratedVoice(project, job, 'Hallo Welt')
    expect(next.assets[0]).toMatchObject({ kind: 'audio', uri: job.audioPath, managed: true, metadata: { adapterId: 'piper', voicePath: job.voicePath, ttsJobId: job.id, sourceText: 'Hallo Welt', durationMs: 2400 } })
    expect(registerGeneratedVoice(next, job, 'Hallo Welt')).toBe(next)
  })
  it('rejects unfinished output and empty attribution text', () => {
    const project = createProjectFromInput({ title: 'Voice', kind: 'idea', content: '' })
    expect(() => registerGeneratedVoice(project, { ...job, state: 'running', audioPath: undefined }, 'Text')).toThrow(/completed/i)
    expect(() => registerGeneratedVoice(project, job, ' ')).toThrow(/source text/i)
  })
})
